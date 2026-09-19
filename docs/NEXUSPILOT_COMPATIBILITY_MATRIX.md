# NexusPilot Compatibility Matrix

## Goal
Stage 3 adds compatibility scaffolding before any external identity cutover.

Canonical future identity:
- environment prefix: `NEXUSPILOT_`
- product name: NexusPilot

Inherited compatibility identity:
- environment prefix: `LNWJUD_`
- legacy persisted data directory: `lnwjud` (fresh installs now use `nexuspilot`)
- workspace metadata directory: `.lnwjud`
- desktop IPC API: `window.lnwjud`
- IPC channels: `lnwjud:*`

During Stage 3, inherited persisted/runtime names remain authoritative unless a specific compatibility adapter is introduced and tested.
## Environment precedence

For migrated environment variables:

```text
NEXUSPILOT_<NAME>
        ↓ preferred
LNWJUD_<NAME>
        ↓ legacy fallback
unset/default
```

If both variables are present, NexusPilot wins.

The shared helper implementing this rule is:

```text
packages/shared/src/compat-env.ts
```
## Implemented in this checkpoint

### DATA_PATH
Supported:
- `NEXUSPILOT_DATA_PATH`
- `LNWJUD_DATA_PATH`

Precedence:
1. `NEXUSPILOT_DATA_PATH`
2. `LNWJUD_DATA_PATH`
3. existing platform default

Fresh installs now use the canonical `nexuspilot` platform data directory. Existing legacy-only installs continue using `lnwjud` in place; no automatic copy/move is performed.

### UNRESTRICTED
Supported:
- `NEXUSPILOT_UNRESTRICTED`
- `LNWJUD_UNRESTRICTED`

Precedence:
1. `NEXUSPILOT_UNRESTRICTED`
2. `LNWJUD_UNRESTRICTED`
3. existing persisted setting/default behavior
## Additional Stage 3 migrations

The following groups now use NexusPilot-first compatibility reads:
- workspace selection and reset flags
- MCP port and stdio policy variables

The following groups now also use NexusPilot-first compatibility reads:
- capability roots and helper paths
- checkpoint encryption key variables
- browser/CDP configuration

`CAPABILITY_ROOTS` is temporarily dual-written to both `NEXUSPILOT_CAPABILITY_ROOTS` and `LNWJUD_CAPABILITY_ROOTS` so inherited host/native consumers continue to work during migration.

Tunnel launcher compatibility now prefers:
- `NEXUSPILOT_PATH` over `LNWJUD_PATH`
- `NEXUSPILOT_TUNNEL_CLIENT_PATH` over `LNWJUD_TUNNEL_CLIENT_PATH`
- `NEXUSPILOT_TUNNEL_STOP` over `LNWJUD_TUNNEL_STOP`

Tunnel runtime aliases and fresh profile/log names are now canonical NexusPilot (`nexuspilot`, `nexuspilot.yaml`, `nexuspilot-tunnel.log`) with bounded adoption of existing `lnwjud` aliases/profiles/logs. Secret filenames and lock/mutex coordination remain legacy where required for safe cross-version interoperability.

Build/release scripts now use NexusPilot-first compatibility reads for runtime target/arch, tunnel target/arch, signing/notarization controls, release evidence/provenance settings, verification target/arch, and related release paths. Cross-process `SOURCE_DIRTY_AT_START` is temporarily dual-written under both prefixes for old/new release-script interoperability.

E2E-only configuration now uses NexusPilot-first compatibility reads and canonical `NEXUSPILOT_*` fixture variables. External MCP fixtures and Windows secret-migrator tests retain bounded legacy fallback where needed.

Stage 3 public/runtime environment compatibility is complete. The remaining `LNWJUD_*` references are intentional compatibility writes/fallbacks or internal child-process probe variables, including Windows PowerShell event/acceptance probes that are not public configuration surface.

Do not mechanically rename those internal probe variables; migrate them only with the child protocol that consumes them.
## Persisted paths

Stage 6A introduces compatibility-first app-data selection. Fresh installs use the canonical `nexuspilot` directory, while existing legacy-only installs continue using `lnwjud` in place. No automatic copy is performed.

```text
fresh install: <platform app data>/nexuspilot
legacy-only install: <platform app data>/lnwjud
workspace metadata: <workspace>/.lnwjud/ (unchanged for now)
tunnel runtime/profile/log: canonical NexusPilot with legacy in-place fallback; lock/mutex namespace remains legacy
legacy secret/checkpoint locations: unchanged
```

Reason: changing them before migration readers exist can silently split state between old and new installations.

Before changing any default path:
1. detect existing legacy state,
2. define copy/import/dual-read behavior,
3. define conflict precedence,
4. add tests for existing-user upgrades,
5. only then switch the canonical write location.
## Compatibility removal policy

Legacy `LNWJUD_*` fallback is temporary compatibility surface.

When a runtime uses only a legacy variable, user-facing diagnostics should emit a bounded deprecation notice. The low-level environment helper must not log directly, so libraries/tests remain deterministic and callers can choose the correct UI/logging channel.

A legacy alias may be removed only after:
- the NexusPilot replacement has shipped,
- migration behavior is documented,
- telemetry/support evidence shows the old name is no longer required, or a major-version policy explicitly removes it,
- tests for legacy import are updated accordingly.

Windows native-helper compatibility is intentionally asymmetric: macOS/Linux native hosts have canonical NexusPilot binary names plus legacy aliases, while `lnwjud-windows-ocr.exe` remains the active Windows OCR filename because existing sparse AppX registrations bind package identity to that exact executable. `lnwjud-windows-secret-migrator.exe` also remains legacy by design because it exists only to import legacy lnwjud secrets. Rename either Windows helper only after a tested OS-registration/data-migration handoff exists.

Historical upstream documentation may continue to contain lnwjud identifiers permanently.
