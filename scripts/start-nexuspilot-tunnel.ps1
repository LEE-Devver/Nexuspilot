<#Requires -Version 5.1
.SYNOPSIS
Compatibility-safe canonical launcher for the NexusPilot Secure MCP Tunnel.

.DESCRIPTION
Forwards all arguments to the legacy start-lnwjud-tunnel.ps1 implementation.
The legacy script remains in place so existing automation and upgrades continue
working while new documentation and UI can use the NexusPilot script name.
#>

$legacy = Join-Path $PSScriptRoot 'start-lnwjud-tunnel.ps1'
if (-not (Test-Path -LiteralPath $legacy -PathType Leaf)) {
  throw "Missing compatibility launcher: $legacy"
}

& $legacy @args
exit $LASTEXITCODE
