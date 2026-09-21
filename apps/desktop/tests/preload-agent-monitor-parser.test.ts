import { describe, expect, it } from 'vitest';
import { parseAgentMonitorSwarms, parseAgentObservations } from '../src/preload/agent-monitor-parser.js';

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
});
