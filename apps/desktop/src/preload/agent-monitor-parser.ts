import type {
  AgentMonitorSwarmSummary,
  AgentMonitorTaskSummary,
  AgentMonitorTelemetrySummary,
  AgentObservationProvider,
  AgentObservationState,
  AgentObservationSummary,
} from '@nexuspilot/ipc-contracts';

const swarmStates = new Set<AgentMonitorSwarmSummary['state']>([
  'queued', 'running', 'completed', 'failed', 'cancelled', 'termination_unverified',
]);
const taskStates = new Set<AgentMonitorTaskSummary['state']>([
  'blocked', 'queued', 'running', 'completed', 'failed', 'cancelled', 'termination_unverified',
]);
const observationProviders = new Set<AgentObservationProvider>(['codex', 'claude_code', 'managed_process']);
const observationKinds = new Set<AgentObservationSummary['kind']>(['swarm_task', 'managed_process']);
const observationStates = new Set<AgentObservationState>([
  'blocked', 'queued', 'starting', 'running', 'completed', 'exited', 'failed', 'cancelled', 'stopped',
  'timed_out', 'termination_unverified',
]);

/**
 * The Agent Monitor is an observational read model, so its parsers drop entries they cannot read
 * instead of rejecting the snapshot. These rows come from every client session and from swarm state
 * persisted by any app version, and the rest of the dashboard — workspaces, security posture,
 * tunnel, settings — must not go blank because one monitor row is unrecognised.
 */
export function parseAgentMonitorSwarms(value: unknown): readonly AgentMonitorSwarmSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const swarm = parseSwarm(entry);
    return swarm === undefined ? [] : [swarm];
  });
}

export function parseAgentObservations(value: unknown): readonly AgentObservationSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const observation = parseObservation(entry);
    return observation === undefined ? [] : [observation];
  });
}

function parseSwarm(value: unknown): AgentMonitorSwarmSummary | undefined {
  if (!isRecord(value) || !Array.isArray(value.tasks)) return undefined;
  const state = optionalMember(value.state, swarmStates);
  const swarmId = optionalString(value.swarmId);
  const workspaceId = optionalString(value.workspaceId);
  const ownerClientId = optionalString(value.ownerClientId);
  const ownerSessionId = optionalString(value.ownerSessionId);
  const maxConcurrency = optionalNumber(value.maxConcurrency);
  const createdAt = optionalString(value.createdAt);
  const updatedAt = optionalString(value.updatedAt);
  if (state === undefined || swarmId === undefined || workspaceId === undefined) return undefined;
  if (ownerClientId === undefined || ownerSessionId === undefined) return undefined;
  if (maxConcurrency === undefined || createdAt === undefined || updatedAt === undefined) return undefined;
  return {
    swarmId,
    workspaceId,
    ownerClientId,
    ownerSessionId,
    state,
    maxConcurrency,
    createdAt,
    updatedAt,
    tasks: value.tasks.flatMap((task) => {
      const parsed = parseTask(task);
      return parsed === undefined ? [] : [parsed];
    }),
  };
}

function parseTask(value: unknown): AgentMonitorTaskSummary | undefined {
  if (!isRecord(value)) return undefined;
  const id = optionalString(value.id);
  const state = optionalMember(value.state, taskStates);
  const createdAt = optionalString(value.createdAt);
  const dependsOn = Array.isArray(value.dependsOn) && value.dependsOn.every((entry) => typeof entry === 'string')
    ? value.dependsOn as readonly string[]
    : undefined;
  if (id === undefined || state === undefined || createdAt === undefined || dependsOn === undefined) return undefined;
  if (typeof value.resultAvailable !== 'boolean' || typeof value.outputTruncated !== 'boolean') return undefined;
  return {
    id,
    dependsOn,
    state,
    createdAt,
    ...optional('startedAt', value.startedAt),
    ...optional('finishedAt', value.finishedAt),
    resultAvailable: value.resultAvailable,
    outputTruncated: value.outputTruncated,
    ...optional('error', value.error),
  };
}

function parseObservation(value: unknown): AgentObservationSummary | undefined {
  if (!isRecord(value)) return undefined;
  const id = optionalString(value.id);
  const provider = optionalMember(value.provider, observationProviders);
  const kind = optionalMember(value.kind, observationKinds);
  const workspaceId = optionalString(value.workspaceId);
  const label = optionalString(value.label);
  const state = optionalMember(value.state, observationStates);
  if (id === undefined || provider === undefined || kind === undefined) return undefined;
  if (workspaceId === undefined || label === undefined || state === undefined) return undefined;
  return {
    id,
    ...optional('parentId', value.parentId),
    provider,
    kind,
    workspaceId,
    ...optional('clientId', value.clientId),
    ...optional('sessionId', value.sessionId),
    label,
    state,
    ...optional('startedAt', value.startedAt),
    ...optional('updatedAt', value.updatedAt),
    ...optional('currentActivity', value.currentActivity),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalMember<T extends string>(value: unknown, allowed: ReadonlySet<T>): T | undefined {
  return typeof value === 'string' && allowed.has(value as T) ? value as T : undefined;
}

function optional<K extends string>(field: K, value: unknown): Record<K, string> | Record<string, never> {
  return typeof value === 'string' ? { [field]: value } as Record<K, string> : {};
}


export function parseAgentTelemetry(value: unknown): AgentMonitorTelemetrySummary | undefined {
  if (!isRecord(value)) return undefined;
  const scalarFields = [
    'mcpCalls', 'completedCalls', 'successes', 'errors', 'cancellations', 'activeCalls',
    'averageLatencyMs', 'p50LatencyMs', 'p95LatencyMs', 'maxLatencyMs',
    'taskLifecycleCalls', 'deterministicRouteCalls', 'dedicatedDryRunCalls',
  ] as const;
  const scalarValues = Object.fromEntries(scalarFields.map((field) => [field, nonNegativeNumber(value[field])]));
  if (Object.values(scalarValues).some((entry) => entry === undefined)) return undefined;
  const agentTaskDuration = parseDurationStats(value.agentTaskDuration);
  const providerProcessDuration = parseDurationStats(value.providerProcessDuration);
  if (agentTaskDuration === undefined || providerProcessDuration === undefined || !Array.isArray(value.topTools)) return undefined;

  const topTools = value.topTools.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const toolName = optionalString(entry.toolName);
    const calls = nonNegativeNumber(entry.calls);
    const errors = nonNegativeNumber(entry.errors);
    const active = nonNegativeNumber(entry.active);
    const averageLatencyMs = nonNegativeNumber(entry.averageLatencyMs);
    const p95LatencyMs = nonNegativeNumber(entry.p95LatencyMs);
    if (toolName === undefined || calls === undefined || errors === undefined || active === undefined) return [];
    if (averageLatencyMs === undefined || p95LatencyMs === undefined) return [];
    return [{ toolName, calls, errors, active, averageLatencyMs, p95LatencyMs }];
  }).slice(0, 8);

  return {
    mcpCalls: scalarValues.mcpCalls!,
    completedCalls: scalarValues.completedCalls!,
    successes: scalarValues.successes!,
    errors: scalarValues.errors!,
    cancellations: scalarValues.cancellations!,
    activeCalls: scalarValues.activeCalls!,
    averageLatencyMs: scalarValues.averageLatencyMs!,
    p50LatencyMs: scalarValues.p50LatencyMs!,
    p95LatencyMs: scalarValues.p95LatencyMs!,
    maxLatencyMs: scalarValues.maxLatencyMs!,
    taskLifecycleCalls: scalarValues.taskLifecycleCalls!,
    deterministicRouteCalls: scalarValues.deterministicRouteCalls!,
    dedicatedDryRunCalls: scalarValues.dedicatedDryRunCalls!,
    agentTaskDuration,
    providerProcessDuration,
    topTools,
  };
}

function parseDurationStats(value: unknown): AgentMonitorTelemetrySummary['agentTaskDuration'] | undefined {
  if (!isRecord(value)) return undefined;
  const count = nonNegativeNumber(value.count);
  const averageMs = nonNegativeNumber(value.averageMs);
  const p50Ms = nonNegativeNumber(value.p50Ms);
  const p95Ms = nonNegativeNumber(value.p95Ms);
  const maxMs = nonNegativeNumber(value.maxMs);
  if (count === undefined || averageMs === undefined || p50Ms === undefined || p95Ms === undefined || maxMs === undefined) return undefined;
  return { count, averageMs, p50Ms, p95Ms, maxMs };
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
