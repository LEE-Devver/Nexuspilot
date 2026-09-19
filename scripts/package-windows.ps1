$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$desktopDirectory = Join-Path $repositoryRoot 'apps\desktop'
$installerDirectory = Join-Path $desktopDirectory 'dist\installers'
$rootPackage = Get-Content -LiteralPath (Join-Path $repositoryRoot 'package.json') -Raw | ConvertFrom-Json
$expectedArtifacts = @(
    "NexusPilot-Setup-$($rootPackage.version).exe",
    "NexusPilot-Setup-$($rootPackage.version).exe.blockmap",
    "NexusPilot-Portable-$($rootPackage.version).exe",
    'latest.yml',
    'portable.yml',
    'SHA256SUMS.txt',
    'PROVENANCE.json'
)
$capturedSourceDirtyAtStart = $false

Push-Location $repositoryRoot
try {
    $sourceDirtyOverride = if (-not [string]::IsNullOrWhiteSpace($env:NEXUSPILOT_SOURCE_DIRTY_AT_START)) { $env:NEXUSPILOT_SOURCE_DIRTY_AT_START } else { $env:LNWJUD_SOURCE_DIRTY_AT_START }
    if ([string]::IsNullOrWhiteSpace($sourceDirtyOverride)) {
        $sourceStatusAtStart = @(git status --porcelain=v1 --untracked-files=normal)
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to inspect repository status before Windows packaging"
        }
        $sourceDirtyAtStart = (($sourceStatusAtStart -join "`n").Trim().Length -gt 0)
        $sourceDirtyValue = if ($sourceDirtyAtStart) { '1' } else { '0' }
        $env:NEXUSPILOT_SOURCE_DIRTY_AT_START = $sourceDirtyValue
        $env:LNWJUD_SOURCE_DIRTY_AT_START = $sourceDirtyValue
        $capturedSourceDirtyAtStart = $true
    }
    & corepack pnpm@10.15.0 --filter @nexuspilot/desktop package:windows
    if ($LASTEXITCODE -ne 0) {
        throw "Windows packaging failed with exit code $LASTEXITCODE"
    }

    if (-not (Test-Path -LiteralPath $installerDirectory -PathType Container)) {
        throw "Installer directory was not created: $installerDirectory"
    }

    $produced = foreach ($artifactName in $expectedArtifacts) {
        $artifactPath = Join-Path $installerDirectory $artifactName
        if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) {
            throw "Required Windows artifact was not produced: $artifactPath"
        }
        Get-Item -LiteralPath $artifactPath
    }

    $produced | Select-Object -ExpandProperty FullName
}
finally {
    if ($capturedSourceDirtyAtStart) {
        Remove-Item Env:NEXUSPILOT_SOURCE_DIRTY_AT_START -ErrorAction SilentlyContinue
        Remove-Item Env:LNWJUD_SOURCE_DIRTY_AT_START -ErrorAction SilentlyContinue
    }
    Pop-Location
}
