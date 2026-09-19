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

## Next phases

### Phase 8B — provider-neutral agent runtime observations

Introduce a provider-neutral observation model so NexusPilot can monitor work originating from:

- Codex agent swarms
- Claude Code sessions/subagents
- local shell/process workers
- future child MCP agent providers

Do not force every provider into the AgentSwarm execution model. Normalize observations at the monitor layer.

Suggested provider-neutral fields:

```text
agentId
parentAgentId?
provider
workspaceId?
clientId?
sessionId?
role?
state
startedAt
updatedAt
currentActivity?
toolName?
processId?
tokensIn?
tokensOut?
```

### Phase 8C — topology and timeline

Add:

- parent/child topology
- task graph edges
- current tool/action
- activity timeline
- filters by provider, workspace, session, state
- duration and concurrency metrics

### Phase 8D — telemetry

Add bounded telemetry for:

- tool-call counts and latency
- task duration
- context/token estimates when the provider exposes them
- deterministic/zero-LLM route hits
- dry-run versus real execution

Provider token counts must be reported only when trustworthy provider evidence exists. Do not invent estimates and label them as exact.

## Design rule

Execution ownership and monitoring visibility are separate concepts:

```text
remote client permissions != local host observability
```

A host-local monitor may aggregate safe metadata, but remote MCP callers keep their existing owner-scoped access.
