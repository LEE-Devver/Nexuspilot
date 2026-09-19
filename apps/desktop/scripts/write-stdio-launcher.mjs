import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(desktopRoot, 'build');
const canonicalCmdPath = path.join(buildDir, 'nexuspilot-mcp-stdio.cmd');
const canonicalShellPath = path.join(buildDir, 'nexuspilot-mcp-stdio.sh');
const legacyCmdPath = path.join(buildDir, 'lnwjud-mcp-stdio.cmd');
const legacyShellPath = path.join(buildDir, 'lnwjud-mcp-stdio.sh');
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);

if (nodeMajor !== 24) throw new Error(`NexusPilot packaged stdio requires the build runtime to be Node.js 24.x; got ${process.versions.node}`);

const windowsContents = `@echo off
setlocal
set "BASE=%~dp0"
set "APP=%BASE%NexusPilot.exe"
if not exist "%APP%" set "APP=%BASE%lnwjud.exe"
if not exist "%APP%" (
  echo nexuspilot-mcp-stdio: packaged Electron executable missing: %APP% 1>&2
  exit /b 1
)
"%APP%" --mcp-stdio %*
exit /b %ERRORLEVEL%
`;
const shellContents = `#!/bin/sh
set -eu
BASE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP=""
for candidate in \
  "$BASE/nexuspilot" \
  "$BASE/NexusPilot.app/Contents/MacOS/NexusPilot" \
  "$BASE/MacOS/NexusPilot" \
  "$BASE/../MacOS/NexusPilot" \
  "$BASE/../lib/nexuspilot/nexuspilot" \
  "$BASE/../opt/nexuspilot/nexuspilot" \
  "$BASE/lnwjud" \
  "$BASE/lnwjud.app/Contents/MacOS/lnwjud" \
  "$BASE/MacOS/lnwjud" \
  "$BASE/../MacOS/lnwjud" \
  "$BASE/../lib/lnwjud/lnwjud" \
  "$BASE/../opt/lnwjud/lnwjud"; do
  if [ -x "$candidate" ]; then APP="$candidate"; break; fi
done
if [ -z "$APP" ]; then
  echo "nexuspilot-mcp-stdio: packaged Electron executable was not found beside the launcher" >&2
  exit 1
fi
exec "$APP" --mcp-stdio "$@"
`;
mkdirSync(buildDir, { recursive: true });

for (const cmdPath of [canonicalCmdPath, legacyCmdPath]) {
  writeFileSync(cmdPath, windowsContents.replace(/\n/g, '\r\n'), 'utf8');
}
for (const shellPath of [canonicalShellPath, legacyShellPath]) {
  writeFileSync(shellPath, shellContents, { encoding: 'utf8', mode: 0o755 });
  try { chmodSync(shellPath, 0o755); } catch { /* Windows checkout does not expose POSIX mode bits. */ }
}

process.stdout.write(
  `Generated packaged Electron STDIO launchers: ${canonicalCmdPath}, ${canonicalShellPath}; legacy aliases: ${legacyCmdPath}, ${legacyShellPath}\n`,
);
