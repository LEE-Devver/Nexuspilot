# NexusPilot Rebrand Inventory

## Purpose
This document inventories the inherited `lnwjud` identity before any broad rename. The goal is to separate cosmetic branding from compatibility-sensitive runtime identifiers.

## Current scale
Repository baseline: upstream `lnwjud` v5.2.2 at commit `43712ba`.

Tracked files: 973.

Case-insensitive `lnwjud` references:
- 3,894 occurrences
- 612 files
- 787 package-namespace references across 374 files
- 322 environment-variable references across 81 files
- 457 path/config/runtime-related references across 112 files

This confirms that a repository-wide blind replacement is unsafe.
## Category A — Product branding
Examples:
- README / FULL_README / usage docs
- desktop UI strings and i18n
- window titles, labels, help text
- screenshots, logos, release notes
- visible product name in Electron configuration

Typical target:
```text
lnwjud -> NexusPilot
```

Risk: low to medium.

Rule: branding can change early, but historical documents and attribution must not be rewritten as if NexusPilot authored upstream history.
## Category B — Package namespace and monorepo identity
Current root package:
```text
lnwjud
```

Current workspace packages use:
```text
@lnwjud/*
```

Examples include:
- @lnwjud/domain
- @lnwjud/application
- @lnwjud/mcp-server
- @lnwjud/desktop
- @lnwjud/cli
- @lnwjud/capabilities
- @lnwjud/extensions

Risk: high because imports, filters, lockfile entries, tests, build scripts, and release tooling depend on these names.
## Category C — Desktop application and installer identity
Current examples:
```text
appId: com.lnwjud.desktop
productName: lnwjud
lnwjud.exe
lnwjud-Setup-<version>.exe
lnwjud-Portable-<version>.exe
lnwjud-mcp-stdio.cmd
lnwjud-mcp-stdio
```

These identifiers appear in Electron Builder, packaging tests, release evidence, tunnel setup, update logic, shortcuts, and CI.

Risk: very high.

Changing executable or installer names must be coordinated with updater, release evidence, launcher generation, packaged-boundary tests, and tunnel-profile compatibility.
## Category D — Environment variables
There are many inherited variables with the `LNWJUD_` prefix.

Representative runtime variables:
```text
LNWJUD_DATA_PATH
LNWJUD_WORKSPACE
LNWJUD_UNRESTRICTED
LNWJUD_CAPABILITY_ROOTS
LNWJUD_MCP_PORT
LNWJUD_STDIO_PROFILE
LNWJUD_STDIO_FULL_BYPASS_ALL
LNWJUD_TUNNEL_CLIENT_PATH
LNWJUD_LOG_LEVEL
```

There are also build, test, signing, packaging, verification, and native-provider variables.

Risk: very high because external scripts and existing installations may already depend on these names.
## Category E — Persisted data and workspace metadata
Inherited identity is used in locations such as:
- application data directories
- tunnel logs and profiles
- build-tool caches
- workspace-local `.lnwjud` metadata
- backup / recovery paths
- test fixtures that model real persisted state

Examples seen in tests and runtime:
```text
.lnwjud/project-profile.json
lnwjud-tunnel.log
lnwjud-build-tools
LNWJUD_DATA_PATH
```

Risk: critical for upgrades and backward compatibility.

Do not rename persisted locations without an explicit migration reader/writer strategy.
## Category F — Electron IPC / renderer API identity
The preload currently exposes:
```text
window.lnwjud
```

IPC channel names use the prefix:
```text
lnwjud:...
```

The IPC contract contains many channels and the renderer uses `window.lnwjud` broadly.

Risk: high inside the desktop app, but internally controllable.

Recommendation: migrate this as a dedicated atomic subsystem, preferably with a temporary compatibility alias if packaged renderer/main skew is possible during updates or tests.
## Category G — MCP / runtime product identity
Runtime probes and tests include product/server identity strings such as:
```text
product: "lnwjud"
lnwjud-mcp-stdio
lnwjud-production-stdio-acceptance
```

The names are used by health/identity probes, stdio launchers, tunnel profiles, and acceptance tests.

Risk: very high because remote/local clients can use these strings for identity validation.

Recommendation: define the NexusPilot MCP identity contract before changing these values. If compatibility matters, accept legacy `lnwjud` identity during a bounded migration window while advertising NexusPilot for new sessions.
## Category H — Native hosts
Inherited names include:
```text
lnwjud-macos-host
lnwjud-linux-host
lnwjud-windows-ocr
lnwjud-windows-secret-migrator
LnwjudMacHost
```

These names are wired into packaging manifests, integrity hashes, runtime discovery, release evidence, Swift/C# project names, and tests.

Risk: very high.

Treat native-host rename as a later isolated migration after desktop/package identity is stable.
## Category I — Tunnel and automation scripts
Important inherited files:
```text
scripts/start-lnwjud-tunnel.ps1
scripts/start-lnwjud-tunnel.bat
scripts/lib/lnwjud-tunnel-lock.ps1
```

Tunnel profile paths, log names, launcher names, and scheduled-task/service identifiers also contain the old identity.

Risk: very high because these cross process and installation boundaries.

Recommendation: introduce NexusPilot scripts first while temporarily recognizing legacy lnwjud profiles/logs/launchers where safe.
## Category J — Tests and fixtures
A large fraction of references are intentional test fixtures.

Examples:
- temp directory prefixes
- expected installer names
- IPC channel expectations
- legacy migration fixtures
- release artifact assertions
- tunnel-profile examples

Risk: variable.

Rule: do not rename tests mechanically. First decide whether each assertion represents:
1. new NexusPilot behavior,
2. legacy compatibility that must stay,
3. historical upstream evidence,
4. an irrelevant temp-label that can change freely.
## Category K — Historical documentation and attribution
Files such as old plans, benchmarks, release notes, and upstream architecture documents describe lnwjud history.

Risk: legal/history accuracy rather than runtime risk.

Rules:
- Keep the original MIT license notice.
- Keep upstream attribution.
- Do not rewrite dated historical documents to pretend they were originally NexusPilot.
- Add NexusPilot migration notes around inherited historical material instead of erasing provenance.

## Recommended migration order

### Stage 1 — Visible branding only
Change current-user-facing product branding:
- current README introduction
- desktop visible labels
- current docs intended for NexusPilot users
- new logo/assets

Do not touch package namespaces, persisted paths, env vars, IPC, executable names, or historical docs yet.
### Stage 2 — Internal package namespace
Migrate `@lnwjud/*` to `@nexuspilot/*` in one controlled dependency-graph change.
Regenerate the lockfile and run full lint/typecheck/test/build immediately.

### Stage 3 — Compatibility and persistence scaffolding
Before outward runtime renames, add migration helpers and tests for inherited external state:
- define canonical NexusPilot environment-variable mapping
- define legacy `LNWJUD_*` fallback precedence
- inventory persisted directories, tunnel profiles, workspace metadata, and logs
- add dual-read / migration tests before changing defaults

Do not switch default persisted locations yet. First make the runtime capable of recognizing both identities safely.

### Stage 4 — Desktop internal API
Migrate:
```text
window.lnwjud -> window.nexusPilot
lnwjud:* IPC channels -> nexuspilot:*
```

Consider a temporary preload alias only if compatibility with mixed-version renderer/main processes is needed.

### Stage 5 — Product runtime identity
Change MCP product identity, CLI visible name, server metadata, and generated stdio launcher branding.
Keep explicit legacy recognition where existing tunnel profiles or clients could still reference old names.
### Stage 6 — Executables, installer, and persisted-state cutover
Rename the packaged application, generated stdio launcher, installer artifacts, portable artifacts, and desktop app identifier together.

At this stage, switch canonical external names to NexusPilot only after the Stage 3 compatibility layer is tested:
- `NEXUSPILOT_*` becomes canonical
- legacy `LNWJUD_*` remains bounded fallback
- NexusPilot data paths become canonical
- legacy persisted state is detected/imported without silent loss

Update packaging, updater, release evidence, CI, shortcut creation, packaged-boundary tests, and migration tests together.

### Stage 7 — Tunnel and native hosts
Rename tunnel scripts/profiles/logs and native providers only after the main runtime identity is stable.
Preserve bounded detection/import of legacy profiles when practical.
### Stage 8 — Documentation cleanup
Update current documentation and examples.
Leave dated upstream historical records intact unless specifically annotated as inherited material.

## Compatibility policy proposal
New NexusPilot names should be canonical.

Legacy lnwjud names should be supported only where they protect:
- existing user data
- installed tunnel profiles
- external environment configuration
- upgrade paths
- old launchers during transition

Legacy aliases should be documented, tested, and eventually removable rather than becoming permanent accidental API surface.

## Migration status
- Stage 1 — visible branding: complete
- Stage 2 — internal package namespace: complete (`@nexuspilot/*`, root package `nexuspilot`)
- Stage 3 — compatibility and persistence scaffolding: complete (NexusPilot-first env compatibility with bounded lnwjud fallback; persisted defaults intentionally unchanged)
- Stage 4 — desktop internal API / IPC migration: complete (`window.nexusPilot`, `nexuspilot:*`; temporary `window.lnwjud` preload alias retained)
- Stage 5 — product runtime identity: complete (MCP server/bridge identity is NexusPilot; canonical health identity added with bounded lnwjud endpoint/product recognition)
- Stage 6 — executables, installer, and persisted-state cutover: complete (NexusPilot canonical app/installer/launcher identity, migration-safe app-data selection, legacy stdio launcher alias retained)

## Immediate next implementation step
Stage 7 is complete. Stage 7A migrated tunnel runtime/profile/log identity to NexusPilot with bounded legacy adoption; tunnel lock/mutex names intentionally remain legacy for cross-version mutual exclusion. Stage 7B1 migrated macOS/Linux native hosts to canonical `nexuspilot-*` binaries with packaged legacy aliases and runtime fallback. Stage 7B2 reviewed Windows helpers and intentionally retains `lnwjud-windows-ocr.exe` because existing sparse AppX registrations bind identity to that executable name, and retains `lnwjud-windows-secret-migrator.exe` because it is a one-time legacy-secret compatibility helper. Rename either Windows helper only with an explicit tested OS-registration/data-migration handoff.

Final compatibility cleanup is classified in `docs/NEXUSPILOT_COMPATIBILITY_CLEANUP.md`. Current UI/CLI branding and fresh tunnel guidance are canonical NexusPilot, including canonical `start-nexuspilot-tunnel.ps1/.bat` launcher aliases. Remaining inherited identifiers are intentional compatibility, persisted protocol, Windows registration/data-migration boundaries, or historical evidence.

The following compatibility/runtime identities remain intentionally preserved:
- bounded `LNWJUD_*` environment fallbacks / dual-writes
- `.lnwjud` persisted workspace metadata and related serialized paths
- deprecated `window.lnwjud` preload alias
- legacy MCP identity endpoint/header recognition retained for older listeners
- legacy stdio and tunnel-script launcher aliases
- packaged legacy macOS/Linux native-host aliases
- Windows OCR and secret-migrator legacy executable identities
- tunnel lock/mutex and legacy profile readers
- historical documents / immutable regression fixtures

After each migration stage, run:
```bash
corepack pnpm@10.15.0 lint
corepack pnpm@10.15.0 typecheck
corepack pnpm@10.15.0 test
corepack pnpm@10.15.0 build
```
