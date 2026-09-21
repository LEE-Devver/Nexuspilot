import { describe, expect, it } from 'vitest';
import { parseAgentMonitorSwarms, parseAgentObservations, parseAgentTelemetry } from '../src/preload/agent-monitor-parser.js';

const swarm = {
  swarmId: 'swarm-a',
  workspaceId: 'workspace-a',
  ownerClientId: 'chatgpt',
  ownerSessionId: 'session-a',
  state: 'running',
  maxConcurrency: 2,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:01.000Z',
  tasks: [{ id: 'design', dependsOn: [], state: 'running', createdAt: '2026-09-19T00:00:00.000Z', resultAvailable: false, outputTruncated: false }],
};

const observation = {
  id: 'process:claude-1',
  provider: 'claude_code',
  kind: 'managed_process',
  workspaceId: 'workspace-a',
  label: 'claude',
  state: 'running',
};

describe('preload Agent Monitor parsing', () => {
  it('keeps well-formed swarm and observation rows with their optional fields', () => {
    expect(parseAgentMonitorSwarms([{ ...swarm, tasks: [{ ...swarm.tasks[0], finishedAt: '2026-09-19T00:00:02.000Z', error: 'boom' }] }])).toEqual([
      { ...swarm, tasks: [{ ...swarm.tasks[0], finishedAt: '2026-09-19T00:00:02.000Z', error: 'boom' }] },
    ]);
    expect(parseAgentObservations([{ ...observation, parentId: 'swarm:swarm-a', currentActivity: 'agent task' }])).toEqual([
      { ...observation, parentId: 'swarm:swarm-a', currentActivity: 'agent task' },
    ]);
  });

  it('drops an unreadable swarm row instead of failing the whole dashboard snapshot', () => {
    const rows = parseAgentMonitorSwarms([
      { ...swarm, swarmId: 'swarm-future', state: 'paused_by_a_newer_version' },
      { ...swarm, swarmId: 'swarm-broken', maxConcurrency: 'two' },
      'not-a-swarm',
      swarm,
    ]);
    expect(rows.map((entry) => entry.swarmId)).toEqual(['swarm-a']);
  });

  it('drops only the unreadable task and keeps the rest of its swarm', () => {
    const rows = parseAgentMonitorSwarms([{
      ...swarm,
      tasks: [{ ...swarm.tasks[0], id: 'future', state: 'paused' }, swarm.tasks[0], { ...swarm.tasks[0], id: 'partial', resultAvailable: undefined }],
    }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tasks.map((task) => task.id)).toEqual(['design']);
  });

  it('parses measured telemetry and drops malformed telemetry without breaking the dashboard', () => {
    const telemetry = {
      mcpCalls: 10,
      completedCalls: 9,
      successes: 7,
      errors: 1,
      cancellations: 1,
      activeCalls: 1,
      averageLatencyMs: 25,
      p50LatencyMs: 20,
      p95LatencyMs: 90,
      maxLatencyMs: 120,
      taskLifecycleCalls: 3,
      deterministicRouteCalls: 2,
      dedicatedDryRunCalls: 1,
      agentTaskDuration: { count: 2, averageMs: 1500, p50Ms: 1000, p95Ms: 2000, maxMs: 2000 },
      providerProcessDuration: { count: 1, averageMs: 5000, p50Ms: 5000, p95Ms: 5000, maxMs: 5000 },
      topTools: [{ toolName: 'read_file', calls: 4, errors: 0, active: 1, averageLatencyMs: 10, p95LatencyMs: 20 }],
    };
    expect(parseAgentTelemetry(telemetry)).toEqual(telemetry);
    expect(parseAgentTelemetry({ ...telemetry, mcpCalls: 'ten' })).toBeUndefined();
    expect(parseAgentTelemetry(undefined)).toBeUndefined();
  });

  it('drops unreadable observations and non-array payloads', () => {
    expect(parseAgentObservations([
      { ...observation, id: 'process:unknown', provider: 'gemini_cli' },
      { ...observation, id: 'process:stateless', state: 'hibernating' },
      observation,
    ]).map((entry) => entry.id)).toEqual(['process:claude-1']);
    expect(parseAgentObservations(undefined)).toEqual([]);
    expect(parseAgentMonitorSwarms(null)).toEqual([]);
    expect(parseAgentMonitorSwarms('swarms')).toEqual([]);
  });

  it('accepts bounded telemetry and rejects malformed telemetry as unavailable', () => {
    const telemetry = {
      mcpCalls: 10, completedCalls: 9, successes: 8, errors: 1, cancellations: 0, activeCalls: 1,
      averageLatencyMs: 12, p50LatencyMs: 8, p95LatencyMs: 31, maxLatencyMs: 44,
      taskLifecycleCalls: 3, deterministicRouteCalls: 2, dedicatedDryRunCalls: 1,
      agentTaskDuration: { count: 2, averageMs: 1500, p50Ms: 1000, p95Ms: 2000, maxMs: 2000 },
      providerProcessDuration: { count: 1, averageMs: 5000, p50Ms: 5000, p95Ms: 5000, maxMs: 5000 },
      topTools: [{ toolName: 'read_file', calls: 4, errors: 0, active: 1, averageLatencyMs: 7, p95LatencyMs: 9 }],
    };
    expect(parseAgentTelemetry(telemetry)).toEqual(telemetry);
    expect(parseAgentTelemetry({ ...telemetry, mcpCalls: -1 })).toBeUndefined();
    expect(parseAgentTelemetry({ ...telemetry, agentTaskDuration: { count: 'two' } })).toBeUndefined();
    expect(parseAgentTelemetry(undefined)).toBeUndefined();
  });
});
