import path from 'node:path';
import type { AgentObservationSummary, ProcessSummary } from '@nexuspilot/ipc-contracts';

/**
 * Swarm tasks are deliberately not observed here: dashboard.agentSwarms already carries every
 * field a swarm_task observation would duplicate, and nothing renders them. Add them back only
 * together with a consumer, so the snapshot does not pay IPC cost for an unrendered read model.
 */
export function buildAgentObservations(processes: readonly ProcessSummary[]): readonly AgentObservationSummary[] {
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

  return observations;
}

export function agentProviderForExecutable(executable: string): AgentObservationSummary['provider'] | undefined {
  const name = path.win32.basename(executable).toLowerCase().replace(/\.exe$/u, '');
  if (name === 'codex' || name.startsWith('codex-')) return 'codex';
  if (name === 'claude' || name === 'claude-code' || name.startsWith('claude-')) return 'claude_code';
  return undefined;
}
