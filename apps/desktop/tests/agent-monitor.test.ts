import { describe, expect, it } from 'vitest';
import { agentProviderForExecutable, buildAgentObservations, buildAgentTelemetry } from '../src/main/agent-monitor.js';

describe('provider-neutral Agent Monitor observations', () => {
  it('classifies Codex and Claude Code executables without treating unrelated processes as agents', () => {
    expect(agentProviderForExecutable('/usr/local/bin/codex')).toBe('codex');
    expect(agentProviderForExecutable('C:\\Tools\\codex.exe')).toBe('codex');
    expect(agentProviderForExecutable('/opt/homebrew/bin/claude')).toBe('claude_code');
    expect(agentProviderForExecutable('C:\\Tools\\claude-code.exe')).toBe('claude_code');
    expect(agentProviderForExecutable('/bin/bash')).toBeUndefined();
  });

  it('observes only owned provider processes and never copies their arguments or output', () => {
    const observations = buildAgentObservations([
      {
        id: 'process-claude',
        workspaceId: 'workspace-b',
        sessionId: null,
        executable: '/opt/homebrew/bin/claude',
        args: ['--dangerously-sensitive-prompt-should-not-be-copied'],
        state: 'running',
        startedAt: '2026-09-21T01:00:00.000Z',
        finishedAt: '2026-09-21T01:01:00.000Z',
        logSummary: 'sensitive output must not be copied',
      },
      {
        id: 'process-shell',
        workspaceId: 'workspace-b',
        sessionId: null,
        executable: '/bin/bash',
        args: [],
        state: 'running',
        logSummary: '',
      },
    ]);

    expect(observations).toEqual([
      expect.objectContaining({
        id: 'process:process-claude',
        provider: 'claude_code',
        kind: 'managed_process',
        label: 'claude',
        state: 'running',
        startedAt: '2026-09-21T01:00:00.000Z',
        updatedAt: '2026-09-21T01:01:00.000Z',
      }),
    ]);
    const serialized = JSON.stringify(observations);
    expect(serialized).not.toContain('dangerously-sensitive');
    expect(serialized).not.toContain('sensitive output');
  });

  it('builds measured telemetry from tracker and lifecycle timestamps without inventing token usage', () => {
    const telemetry = buildAgentTelemetry({
      calls: 6,
      completed: 5,
      successes: 4,
      errors: 1,
      cancellations: 0,
      active: 1,
      averageLatencyMs: 22,
      p50LatencyMs: 18,
      p95LatencyMs: 80,
      maxLatencyMs: 100,
      byTool: {
        read_file: { calls: 3, successes: 3, errors: 0, cancellations: 0, active: 1, averageLatencyMs: 10, p50LatencyMs: 8, p95LatencyMs: 20, maxLatencyMs: 20 },
        agent_swarm_run: { calls: 2, successes: 1, errors: 1, cancellations: 0, active: 0, averageLatencyMs: 40, p50LatencyMs: 20, p95LatencyMs: 60, maxLatencyMs: 60 },
        route_intent: { calls: 1, successes: 1, errors: 0, cancellations: 0, active: 0, averageLatencyMs: 2, p50LatencyMs: 2, p95LatencyMs: 2, maxLatencyMs: 2 },
        dry_run: { calls: 1, successes: 1, errors: 0, cancellations: 0, active: 0, averageLatencyMs: 1, p50LatencyMs: 1, p95LatencyMs: 1, maxLatencyMs: 1 },
      },
      batchPartialFailures: 0,
      taskLifecycleCalls: 2,
      recentErrorClasses: [{ code: 'FAILED', count: 1 }],
    }, [{
      swarmId: 'swarm-a',
      workspaceId: 'workspace-a',
      ownerClientId: 'chatgpt',
      ownerSessionId: 'session-a',
      state: 'completed',
      maxConcurrency: 1,
      createdAt: '2026-09-21T01:00:00.000Z',
      updatedAt: '2026-09-21T01:00:03.000Z',
      tasks: [{
        id: 'review',
        dependsOn: [],
        state: 'completed',
        createdAt: '2026-09-21T01:00:00.000Z',
        startedAt: '2026-09-21T01:00:01.000Z',
        finishedAt: '2026-09-21T01:00:03.000Z',
        resultAvailable: true,
        outputTruncated: false,
      }],
    }], [{
      id: 'process:claude',
      provider: 'claude_code',
      kind: 'managed_process',
      workspaceId: 'workspace-a',
      label: 'claude',
      state: 'exited',
      startedAt: '2026-09-21T01:00:00.000Z',
      updatedAt: '2026-09-21T01:00:05.000Z',
    }]);

    expect(telemetry).toMatchObject({
      mcpCalls: 6,
      completedCalls: 5,
      errors: 1,
      activeCalls: 1,
      taskLifecycleCalls: 2,
      deterministicRouteCalls: 1,
      dedicatedDryRunCalls: 1,
      agentTaskDuration: { count: 1, averageMs: 2000 },
      providerProcessDuration: { count: 1, averageMs: 5000 },
    });
    expect(telemetry.topTools[0]?.toolName).toBe('read_file');
    expect(JSON.stringify(telemetry)).not.toContain('token');
  });

  it('normalizes opt-in external agents without prompt/result fields and preserves parent links', () => {
    const observations = buildAgentObservations([], [
      {
        agentId: 'claude-parent',
        provider: 'claude_code',
        workspaceId: 'workspace-a',
        clientId: 'claude-code',
        sessionId: 'session-a',
        label: 'Claude main',
        state: 'running',
        currentActivity: 'reviewing',
        toolName: 'read_file',
        startedAt: '2026-09-21T02:00:00.000Z',
        updatedAt: '2026-09-21T02:00:01.000Z',
        expiresAt: '2026-09-21T02:02:01.000Z',
      },
      {
        agentId: 'claude-child',
        parentAgentId: 'claude-parent',
        provider: 'claude_code',
        workspaceId: 'workspace-a',
        label: 'Claude subagent',
        state: 'running',
        updatedAt: '2026-09-21T02:00:02.000Z',
        expiresAt: '2026-09-21T02:02:02.000Z',
      },
    ]);

    expect(observations).toContainEqual(expect.objectContaining({
      id: 'external:claude-parent',
      kind: 'external_agent',
      provider: 'claude_code',
      currentActivity: 'reviewing · tool: read_file',
    }));
    expect(observations).toContainEqual(expect.objectContaining({
      id: 'external:claude-child',
      parentId: 'external:claude-parent',
      kind: 'external_agent',
    }));
    const serialized = JSON.stringify(observations);
    expect(serialized).not.toContain('prompt');
    expect(serialized).not.toContain('result');
  });

  it('does not duplicate swarm tasks that dashboard.agentSwarms already carries', () => {
    expect(buildAgentObservations([]).some((observation) => observation.kind === 'swarm_task')).toBe(false);
  });



});
