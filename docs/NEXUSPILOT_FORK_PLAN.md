# NexusPilot Fork Plan

## Baseline
NexusPilot starts from the upstream MIT-licensed project `engasnm111/lnwjud`.

Upstream remote:
```text
upstream https://github.com/engasnm111/lnwjud.git
```

Baseline commit:
```text
43712ba Merge pull request #93 from engasnm111/dev
```

Upstream version at import: `5.2.2`.

The original MIT copyright and license notice must remain intact.
## Repository strategy
- `main`: clean integration branch for NexusPilot.
- `nexuspilot/foundation`: initial migration and rebranding work.
- `upstream`: original lnwjud repository.
- `origin`: reserved for the future NexusPilot Git remote.

Do not rewrite upstream history.
Prefer small commits grouped by subsystem so upstream fixes can still be reviewed or cherry-picked.

## Migration order
1. Establish a reproducible upstream baseline.
2. Install the exact supported runtime and run baseline checks.
3. Inventory all `lnwjud` identifiers and compatibility-sensitive paths.
4. Introduce NexusPilot branding without breaking runtime behavior.
5. Rename package namespaces and environment variables in controlled stages.
6. Refactor architecture only after tests pass under the new identity.
## Baseline verification
Required by the current root package:
- Node.js >=24.0.0 <25
- pnpm 10.15.0 through Corepack
- TypeScript 6.x

Run before rebranding:
```bash
corepack pnpm@10.15.0 install --frozen-lockfile
corepack pnpm@10.15.0 lint
corepack pnpm@10.15.0 typecheck
corepack pnpm@10.15.0 test
corepack pnpm@10.15.0 build
```

Baseline verified on macOS with Node.js `v24.21.0` using Homebrew `node@24`. Install, lint, typecheck, test, and build all pass. The system-wide linked Node version remains unchanged; NexusPilot commands prepend `/opt/homebrew/opt/node@24/bin` to PATH.
## Rebranding scope
Expected rename surfaces include:
- root package and workspace package namespaces
- desktop product/app identifiers
- CLI command names and launchers
- MCP server metadata
- installer and release artifact names
- environment variables
- local data/config directory names
- tunnel scripts and profile names
- documentation, screenshots, and logos

Compatibility aliases may be kept temporarily where migration risk is high.

## NexusPilot-specific direction
After parity is established, prioritize:
- multi-agent monitoring
- agent/task topology
- MCP routing and child-MCP observability
- context/token economy telemetry
- dry-run and deterministic routing paths
- cross-platform capability providers
