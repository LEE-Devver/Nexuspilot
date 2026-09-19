# NexusPilot Compatibility Cleanup Matrix

## Purpose

This document is the removal gate for inherited `lnwjud` identities after Rebrand Stages 1–7.

Do not remove a legacy identity merely because NexusPilot has a canonical replacement. Remove it only when upgrade behavior is explicit, tested, and safe for existing installations.

## Classification

### Migrate now

These identifiers are presentation-only or developer-facing text and do not encode persisted state or external compatibility:

- CLI usage/help text: show `nexuspilot`
- current NexusPilot UI copy: say NexusPilot instead of lnwjud
- current tunnel setup copy: refer to `nexuspilot.yaml` for fresh setup
- active documentation for current product behavior

Removal rule: no compatibility reader is required because these values are not machine-consumed identities.

### Keep until a major compatibility removal

These identities are externally observable or consumed by older clients/installations:

- `window.lnwjud` preload alias
- legacy MCP identity endpoint/header recognition
- `LNWJUD_*` public configuration fallbacks
- legacy STDIO launcher aliases
- packaged `lnwjud-macos-host` / `lnwjud-linux-host` aliases
- legacy tunnel runtime/profile readers
- legacy tunnel lock/mutex namespace
- scheduler labels already installed under `com.lnwjud.*`

Removal criteria:

1. NexusPilot replacement has shipped for at least one stable compatibility window.
2. Upgrade tests cover a machine containing only the legacy identity.
3. No current release or documented integration still emits the legacy identity as canonical.
4. Removal is announced as a breaking change or performed in a major-version cleanup.
5. Recovery/rollback behavior is documented.

### Persisted protocol: migrate only with dual-read or import

These paths/prefixes contain user/project state or are serialized into databases/artifacts:

- `.lnwjud/project-profile.json`
- `.lnwjud/sandbox/*`
- `.lnwjud/worktrees/*`
- `.lnwjud-recovery`
- `.lnwjud-trash`
- checkpoint ciphertext prefix `lnwjud:checkpoint:v1:`
- stored goal/evidence markers using `lnwjud:...`
- provider/runtime provenance filenames beginning with `.lnwjud-`

Required migration shape:

```text
read canonical
    ↓ missing
read legacy
    ↓ found
use legacy safely
    ↓ optional explicit migration
write canonical
```

Never rename these with a repository-wide replacement. Each format needs a versioned reader and conflict precedence.

### Windows compatibility freeze

Keep these exact executable identities for now:

- `lnwjud-windows-ocr.exe`
  - existing sparse AppX registrations bind package identity to this executable name
  - a rename requires dual registration or an explicit registration migration
- `lnwjud-windows-secret-migrator.exe`
  - this helper exists specifically to import legacy lnwjud secrets
  - keeping the legacy name communicates its bounded compatibility role

### Historical-only

The following may permanently retain upstream naming when they are immutable records rather than current product guidance:

- historical release notes
- old migration plans
- regression fixtures whose purpose is to reproduce an old identity
- third-party/upstream attribution and license references
- archived screenshots/evidence

## Current canonical identities

```text
Product                NexusPilot
CLI                    nexuspilot
MCP server             nexuspilot
Desktop API            window.nexusPilot
IPC namespace          nexuspilot:*
App data (fresh)       nexuspilot
Tunnel runtime alias   nexuspilot
Tunnel profile         nexuspilot.yaml
Tunnel log             nexuspilot-tunnel.log
macOS native host      nexuspilot-macos-host
Linux native host      nexuspilot-linux-host
```

## Final cleanup policy

A grep result containing `lnwjud` is not automatically a bug.

For every remaining occurrence, ask in this order:

1. Is it user-facing current branding? Migrate now.
2. Is it a compatibility reader/alias for an older installation? Keep and test it.
3. Is it persisted state or a serialized protocol? Version/migrate it deliberately.
4. Is it historical evidence/attribution? Preserve it.
5. Is it neither? Remove or rename it in a focused change.

The repository is considered rebrand-complete when all remaining inherited identities fall into one of the documented compatibility or historical categories above.
