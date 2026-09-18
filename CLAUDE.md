# NexusPilot — Claude Code Handoff

## Project identity
This repository is **NexusPilot**.

NexusPilot is being developed as our own product, starting from the MIT-licensed upstream project:

```text
https://github.com/engasnm111/lnwjud
```

The upstream project is a foundation/reference, not the final product identity.
Do not treat this repository as a normal lnwjud maintenance checkout.

## Git baseline
- Upstream remote: `upstream`
- Upstream URL: `https://github.com/engasnm111/lnwjud.git`
- Imported baseline version: `5.2.2`
- Imported baseline commit: `43712ba`
- NexusPilot migration branch: `nexuspilot/foundation`
- Future `origin`: reserved for the NexusPilot repository

Preserve upstream Git history. Do not rewrite it.
## Licensing
The upstream project uses the MIT License.

Keep the original MIT copyright/license notice intact.
NexusPilot may add its own copyright and notices, but must not remove attribution required by the upstream license.

## Source-of-truth migration document
Read this before making migration/rebranding changes:

```text
docs/NEXUSPILOT_FORK_PLAN.md
```

That document defines:
- repository strategy
- migration order
- baseline verification
- rebranding scope
- NexusPilot-specific product direction

## Current state
The repository has been cloned from upstream and is intentionally still mostly named `lnwjud`.
Do not perform a blind repository-wide search/replace.
## Required migration strategy
Work in small, reviewable stages:

1. Reproduce the upstream baseline.
2. Run baseline install/lint/typecheck/test/build.
3. Inventory all `lnwjud` identifiers and classify them.
4. Rebrand visible product identity first.
5. Rename package namespaces, commands, environment variables, data paths, installers, and tunnel profiles in controlled stages.
6. Keep compatibility aliases where a hard rename could break migration.
7. Refactor architecture only after the renamed baseline remains green.

Every meaningful stage should leave the repository buildable or clearly document the blocker.

## Runtime prerequisite
The root package currently requires:

```text
Node.js >=24.0.0 <25
pnpm 10.15.0
```

The machine previously had Node.js `v23.9.0`.
Do not claim baseline verification passed until Node 24 is active and the required checks actually succeed.
## NexusPilot product direction
NexusPilot is not intended to be only a renamed fork.

After functional parity, development should move toward:
- local AI control gateway
- MCP gateway and child-MCP bridge
- multi-agent monitoring
- agent/task topology and activity timeline
- Codex/other local-agent delegation
- tool-call and context/token economy telemetry
- deterministic / zero-LLM routing where appropriate
- dry-run routing and execution previews
- secure permission profiles and audit trails
- Windows, macOS, and Linux capability providers

## Important upstream files
Some files such as `AGENTS.md` still contain lnwjud-specific upstream instructions.
Treat those as inherited implementation/policy context unless they conflict with this NexusPilot migration handoff or an explicit user instruction.

Do not erase useful upstream architecture, tests, security controls, or documentation merely to remove the old name.
## Before changing code
At the start of a new Claude Code session:

1. Read `CLAUDE.md`.
2. Read `docs/NEXUSPILOT_FORK_PLAN.md`.
3. Inspect `git status`, current branch, and remotes.
4. Inspect `package.json` and the relevant workspace package before editing.
5. Preserve existing upstream behavior unless the current NexusPilot task intentionally changes it.
6. Prefer tests and incremental commits over large mechanical rewrites.

## Immediate next task
The next foundation task is baseline verification under Node 24:

```bash
corepack pnpm@10.15.0 install --frozen-lockfile
corepack pnpm@10.15.0 lint
corepack pnpm@10.15.0 typecheck
corepack pnpm@10.15.0 test
corepack pnpm@10.15.0 build
```

After the baseline is green, produce an inventory of rename/rebrand surfaces before modifying them.
