# NexusPilot Compatibility Matrix

## Goal
Stage 3 adds compatibility scaffolding before any external identity cutover.

Canonical future identity:
- environment prefix: `NEXUSPILOT_`
- product name: NexusPilot

Inherited compatibility identity:
- environment prefix: `LNWJUD_`
- persisted/default data directory: `lnwjud`
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

Important: the platform default directory is still named `lnwjud`. This checkpoint does not move existing data.

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

Tunnel profile names, runtime aliases, secret filenames, and persisted tunnel state intentionally remain on the inherited lnwjud identity until the later runtime/persistence cutover.

Build/release scripts now use NexusPilot-first compatibility reads for runtime target/arch, tunnel target/arch, signing/notarization controls, release evidence/provenance settings, verification target/arch, and related release paths. Cross-process `SOURCE_DIRTY_AT_START` is temporarily dual-written under both prefixes for old/new release-script interoperability.

E2E-only configuration now uses NexusPilot-first compatibility reads and canonical `NEXUSPILOT_*` fixture variables. External MCP fixtures and Windows secret-migrator tests retain bounded legacy fallback where needed.

Stage 3 public/runtime environment compatibility is complete. The remaining `LNWJUD_*` references are intentional compatibility writes/fallbacks or internal child-process probe variables, including Windows PowerShell event/acceptance probes that are not public configuration surface.

Do not mechanically rename those internal probe variables; migrate them only with the child protocol that consumes them.
## Persisted paths

These stay unchanged in Stage 3:

```text
<platform app data>/lnwjud
<workspace>/.lnwjud/
lnwjud tunnel/profile/log names
legacy secret/checkpoint locations
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

Historical upstream documentation may continue to contain lnwjud identifiers permanently.
