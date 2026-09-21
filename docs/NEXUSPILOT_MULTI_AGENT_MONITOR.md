# NexusPilot Multi-Agent Monitor

## Goal

NexusPilot should show what local AI workers are doing across clients without weakening the ownership and permission boundaries of the MCP tools that created the work.

The monitor is a host-local observability surface, not a second execution API.

## Phase 8A — host read model

Phase 8A reuses the existing Codex-backed Agent Swarm runtime rather than creating another task engine.

Data flow:

```text
ChatGPT / MCP clients
        |
        v
AgentSwarmService
        |
        v
SqliteAgentSwarmRepository
        |
        +---- owner-scoped MCP reads (unchanged)
        |
        +---- host-only monitorSnapshot()
                    |
                    v
              Desktop Dashboard
                    |
                    v
               Agent Monitor
```

The Desktop monitor may see recent swarm metadata across client sessions because the local host owns the database. It must not expose prompt bodies or task result bodies.

Exposed monitor metadata:

- swarm ID
- workspace ID
- owner client ID
- owner session ID
- swarm state
- maximum concurrency
- created/updated timestamps
- task IDs
- task dependency edges
- task states
- task timestamps
- result-available/truncated flags
- bounded error text

Not exposed:

- prompt plaintext
- prompt digest/length
- result text
- authorization tokens
- secrets/credentials

## Security boundary

Existing MCP operations `status`, `result`, `list`, and `cancel` remain owner/session scoped.

The cross-session read model is only wired into the trusted Desktop Dashboard. It is not added to the public MCP tool registry.

This lets an operator answer “how many agents are running and what are they doing?” without allowing one remote chat to inspect another chat's result content.

## Phase 8A UI

The Control Center shows a read-only Agent Monitor panel with:

- active swarm count
- running task count
- dependency-blocked task count
- distinct client-session count
- recent swarm owner/workspace/state
- task nodes and dependency labels

The initial view intentionally has no cancel, retry, edit, or result-view controls.

## Phase 8B — provider-neutral runtime observations

Phase 8B adds a provider-neutral observation model without forcing every provider into the AgentSwarm execution model.

Current sources:

- Codex Agent Swarm metadata remains in the dedicated swarm read model.
- NexusPilot-owned/tracked `codex` processes are normalized as provider `codex`.
- NexusPilot-owned/tracked `claude` / `claude-code` processes are normalized as provider `claude_code`.
- Unrelated managed processes are not classified as AI workers.
- Arbitrary external OS processes are not scanned silently.

Security/performance rules:

- process arguments are never copied into the monitor observation,
- process stdout/log summaries are never copied into the observation,
- swarm monitor SQL projects metadata only and does not read prompt or result bodies,
- malformed/future monitor rows are dropped by the preload parser instead of breaking the whole dashboard,
- an indexed recent-swarm query bounds host-monitor cost.

Current provider-neutral fields:

```text
id
parentId?
provider
kind
workspaceId
clientId?
sessionId?
label
state
startedAt?
updatedAt?
currentActivity?
```

The Control Center now also shows provider workers tracked by NexusPilot. External Claude Code/Codex sessions started outside NexusPilot remain intentionally undiscovered until an explicit opt-in discovery/event protocol exists.

## Next phases

## Phase 8C — topology and timeline

Phase 8C adds safe topology/timeline projections over the Phase 8A–8B metadata.

Implemented:

- swarm group nodes and task nodes,
- task dependency edges,
- provider-worker nodes for NexusPilot-managed Codex/Claude Code processes,
- timestamped swarm/task/process timeline events,
- provider/workspace/state filters shared by topology and timeline,
- managed-process start/finish timestamps carried through IPC,
- no synthetic finished event when a task/provider has no verified finish timestamp.

The Control Center exposes `Overview`, `Topology`, and `Timeline` monitor views. Overview remains the default, while Topology/Timeline render bounded recent metadata only.

Still intentionally deferred:

- cross-provider parent/child relationships for external providers until they expose trustworthy parent IDs,
- exact current tool/action unless a provider emits it explicitly,
- duration/token metrics that would require guessing missing timestamps or usage data,
- silent OS-wide external process discovery.

### Phase 8D — telemetry

Phase 8D is implemented as measured-only telemetry over existing trusted runtime evidence.

Implemented:

- MCP/tool call totals, success/error/cancellation/active counts from `ActivityTracker`,
- average/P50/P95/max MCP latency,
- top tools by observed call count with error/active/P95 latency,
- agent task duration from verified task `startedAt`/`finishedAt`,
- NexusPilot-managed provider-process duration from verified process timestamps,
- task lifecycle call count,
- deterministic route count when `route_intent` is actually invoked,
- dedicated dry-run count when `dry_run` is actually invoked,
- a `Telemetry` tab in Agent Monitor,
- preload validation that drops malformed telemetry instead of breaking the dashboard.

Not implemented by design:

- token/context usage without an authoritative provider source,
- inferred tool activity from logs or command text,
- fabricated duration when a verified finish timestamp is missing.

The Telemetry UI explicitly states that token/context usage stays hidden until trustworthy provider evidence is available.

Provider token counts must be reported only when trustworthy provider evidence exists. Do not invent estimates and label them as exact.

## Phase 9A — Agent Event Protocol registry

Phase 9A adds a persistent metadata-only registry for opt-in external providers. See `docs/NEXUSPILOT_AGENT_EVENT_PROTOCOL.md`.

Implemented:

- stable external `agentId` and optional `parentAgentId`,
- provider/workspace/client/session/label/state/current activity/tool metadata,
- host-authoritative timestamps,
- TTL-based active leases and terminal retention,
- bounded 24-hour event history,
- current registry merged into provider-neutral Agent Monitor observations,
- external parent/child topology independent of event arrival order,
- no prompt/result/process-output body fields in the protocol.

Phase 9A intentionally exposes no external listener.

## Phase 9B — authenticated loopback ingress

Phase 9B implements the opt-in transport for external provider events.

Implemented:

- disabled by default and controlled by a persisted Desktop setting,
- loopback-only binding on `127.0.0.1` with an ephemeral port,
- in-memory 32-byte capability token exposed only to the trusted Desktop UI,
- Bearer authentication with timing-safe token comparison,
- token rotation and immediate revocation when the ingress stops,
- `POST /v1/agent-events` as the only accepted transport route,
- strict provider/event/state/schema validation with arbitrary fields rejected,
- `application/json` enforcement and a 16 KiB request-body limit,
- bounded 120 requests/minute host-local rate limiting,
- Settings UI for explicit enable/disable plus endpoint/token copy actions,
- Desktop shutdown cleanup so the listener and token do not outlive the app session.

The ingress forwards only validated protocol metadata into `AgentEventService`; it does not accept prompt/result bodies, command arguments, stdout/stderr, credentials, tokens, or arbitrary provider metadata.

External provider adapters/hooks remain separate follow-up work. The transport is ready for opt-in Claude Code/Codex integration without silently scanning OS processes.

## Design rule

Execution ownership and monitoring visibility are separate concepts:

```text
remote client permissions != local host observability
```

A host-local monitor may aggregate safe metadata, but remote MCP callers keep their existing owner-scoped access.
