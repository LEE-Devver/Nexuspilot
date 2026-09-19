#!/usr/bin/env bash
set -euo pipefail

# Target-native, read-only acceptance helper. It never installs, updates, or
# publishes a package and must run on the Linux host that will execute it.
artifact="${1:-}"
if [[ -z "$artifact" || ! -f "$artifact" || -L "$artifact" ]]; then
  echo "usage: verify-linux-release.sh <AppImage-or-deb>" >&2
  exit 2
fi

# Extraction changes the working directory; preserve a relative caller path.
artifact="$(cd -- "$(dirname -- "$artifact")" && pwd)/$(basename -- "$artifact")"

require_regular_executable() {
  local file="$1"
  if [[ ! -f "$file" || -L "$file" || ! -x "$file" ]]; then
    echo "required runtime is not a regular executable: $file" >&2
    exit 1
  fi
}

require_regular_file() {
  local file="$1"
  if [[ ! -f "$file" || -L "$file" ]]; then
    echo "required runtime manifest is not a regular file: $file" >&2
    exit 1
  fi
}
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Linux release verification must run on Linux" >&2
  exit 2
fi

case "$artifact" in
  *.AppImage|*.appimage)
    test -x "$artifact"
    file "$artifact" | grep -Eiq 'ELF|AppImage' || { echo "AppImage is not an executable Linux artifact" >&2; exit 1; }
    staging="$(mktemp -d "${TMPDIR:-/tmp}/lnwjud-linux-verify.XXXXXX")"
    trap 'rm -rf "$staging"' EXIT
    (cd "$staging" && "$artifact" --appimage-extract >/dev/null)
    root="$staging/squashfs-root"
    ;;
  *.deb)
    command -v dpkg-deb >/dev/null
    dpkg-deb --info "$artifact" >/dev/null
    staging="$(mktemp -d "${TMPDIR:-/tmp}/lnwjud-linux-verify.XXXXXX")"
    trap 'rm -rf "$staging"' EXIT
    dpkg-deb --extract "$artifact" "$staging"
    if [[ -d "$staging/opt/NexusPilot" ]]; then root="$staging/opt/NexusPilot"; else root="$staging/opt/nexuspilot"; fi
    ;;
  *)
    echo "expected an AppImage or DEB artifact" >&2
    exit 2
    ;;
esac

if [[ -x "$root/usr/bin/nexuspilot" && ! -L "$root/usr/bin/nexuspilot" ]]; then
  require_regular_executable "$root/usr/bin/nexuspilot"
else
  require_regular_executable "$root/nexuspilot"
fi
launcher="$(find "$root" -type f -name 'nexuspilot-mcp-stdio' -perm -u+x -print -quit)"
test -n "$launcher" && require_regular_executable "$launcher"
legacy_launcher="$(find "$root" -type f -name 'lnwjud-mcp-stdio' -perm -u+x -print -quit)"
test -n "$legacy_launcher" && require_regular_executable "$legacy_launcher"
rg_binary="$(find "$root" -type f -name rg -perm -u+x -print -quit)"
test -n "$rg_binary" && require_regular_executable "$rg_binary"
tunnel_binary="$(find "$root" -type f -name tunnel-client -perm -u+x -print -quit)"
test -n "$tunnel_binary" && require_regular_executable "$tunnel_binary"
host_binary="$(find "$root" -type f -name nexuspilot-linux-host -perm -u+x -print -quit)"
legacy_host_binary="$(find "$root" -type f -name lnwjud-linux-host -perm -u+x -print -quit)"
test -n "$host_binary" && require_regular_executable "$host_binary"
test -n "$legacy_host_binary" && require_regular_executable "$legacy_host_binary"
manifest="$(dirname "$host_binary")/NATIVE_HOST.json"
require_regular_file "$manifest"
file "$host_binary" | grep -Eiq 'ELF' || { echo "native host is not an ELF executable" >&2; exit 1; }
echo "Linux artifact layout verification passed: $artifact"
