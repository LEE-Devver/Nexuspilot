import path from 'node:path';
import type { AgentMonitorTelemetrySummary, AgentObservationSummary, DashboardSnapshot, ProcessSummary } from '@nexuspilot/ipc-contracts';
import type { ActivityTelemetrySnapshot } from '@nexuspilot/mcp-server';
import type { StoredExternalAgentObservation } from '@nexuspilot/storage';

/**
 * Swarm tasks are deliberately not observed here: dashboard.agentSwarms already carries every
 * field a swarm_task observation would duplicate, and nothing renders them. Add them back only
 * together with a consumer, so the snapshot does not pay IPC cost for an unrendered read model.
 */
export function buildAgentObservations(
  processes: readonly ProcessSummary[],
  externalAgents: readonly StoredExternalAgentObservation[] = [],
): readonly AgentObservationSummary[] {
  const observations: AgentObservationSummary[] = [];
  for (const processSummary of processes) {
    const provider = agentProviderForExecutable(processSummary.executable);
    if (provider === undefined) continue;
    observations.push({
      id: `process:${processSummary.id}`,
      provider,
      kind: 'managed_process',
      workspaceId: processSummary.workspaceId,
      clientId: 'desktop-renderer',
      ...(processSummary.sessionId === null ? {} : { sessionId: processSummary.sessionId }),
      label: path.win32.basename(processSummary.executable),
      state: processSummary.state,
      ...(processSummary.startedAt === undefined ? {} : { startedAt: processSummary.startedAt }),
      ...(processSummary.finishedAt !== undefined
        ? { updatedAt: processSummary.finishedAt }
        : processSummary.startedAt === undefined
          ? {}
          : { updatedAt: processSummary.startedAt }),
    });
  }

  for (const external of externalAgents) {
    observations.push({
      id: `external:${external.agentId}`,
      ...(external.parentAgentId === undefined ? {} : { parentId: `external:${external.parentAgentId}` }),
      provider: external.provider,
      kind: 'external_agent',
      workspaceId: external.workspaceId,
      ...(external.clientId === undefined ? {} : { clientId: external.clientId }),
      ...(external.sessionId === undefined ? {} : { sessionId: external.sessionId }),
      label: external.label,
      state: external.state,
      ...(external.startedAt === undefined ? {} : { startedAt: external.startedAt }),
      updatedAt: external.updatedAt,
      ...(external.currentActivity === undefined
        ? external.toolName === undefined ? {} : { currentActivity: `tool: ${external.toolName}` }
        : external.toolName === undefined
          ? { currentActivity: external.currentActivity }
          : { currentActivity: `${external.currentActivity} · tool: ${external.toolName}` }),
    });
  }

  return observations;
}

export function agentProviderForExecutable(executable: string): AgentObservationSummary['provider'] | undefined {
  const name = path.win32.basename(executable).toLowerCase().replace(/\.exe$/u, '');
  if (name === 'codex' || name.startsWith('codex-')) return 'codex';
  if (name === 'claude' || name === 'claude-code' || name.startsWith('claude-')) return 'claude_code';
  return undefined;
}


export function buildAgentTelemetry(
  activity: ActivityTelemetrySnapshot,
  swarms: NonNullable<DashboardSnapshot['agentSwarms']>,
  observations: NonNullable<DashboardSnapshot['agentObservations']>,
): AgentMonitorTelemetrySummary {
  const taskDurations = swarms.flatMap((swarm) => swarm.tasks)
    .map((task) => measuredDuration(task.startedAt, task.finishedAt))
    .filter((duration): duration is number => duration !== undefined);
  const processDurations = observations
    .filter((observation) => observation.kind === 'managed_process')
    .map((observation) => measuredDuration(observation.startedAt, observation.updatedAt))
    .filter((duration): duration is number => duration !== undefined);

  const topTools = Object.entries(activity.byTool)
    .map(([toolName, telemetry]) => ({
      toolName,
      calls: telemetry.calls,
      errors: telemetry.errors,
      active: telemetry.active,
      averageLatencyMs: telemetry.averageLatencyMs,
      p95LatencyMs: telemetry.p95LatencyMs,
    }))
    .sort((left, right) => right.calls - left.calls || right.errors - left.errors || left.toolName.localeCompare(right.toolName))
    .slice(0, 8);

  return {
    mcpCalls: activity.calls,
    completedCalls: activity.completed,
    successes: activity.successes,
    errors: activity.errors,
    cancellations: activity.cancellations,
    activeCalls: activity.active,
    averageLatencyMs: activity.averageLatencyMs,
    p50LatencyMs: activity.p50LatencyMs,
    p95LatencyMs: activity.p95LatencyMs,
    maxLatencyMs: activity.maxLatencyMs,
    taskLifecycleCalls: activity.taskLifecycleCalls,
    deterministicRouteCalls: activity.byTool.route_intent?.calls ?? 0,
    dedicatedDryRunCalls: activity.byTool.dry_run?.calls ?? 0,
    agentTaskDuration: durationStats(taskDurations),
    providerProcessDuration: durationStats(processDurations),
    topTools,
  };
}

function measuredDuration(startedAt: string | undefined, finishedAt: string | undefined): number | undefined {
  if (startedAt === undefined || finishedAt === undefined || startedAt === finishedAt) return undefined;
  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return undefined;
  return finished - started;
}

function durationStats(values: readonly number[]): AgentMonitorTelemetrySummary['agentTaskDuration'] {
  if (values.length === 0) return { count: 0, averageMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    averageMs: Number((total / sorted.length).toFixed(2)),
    p50Ms: durationPercentile(sorted, 0.5),
    p95Ms: durationPercentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

function durationPercentile(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? 0;
}
