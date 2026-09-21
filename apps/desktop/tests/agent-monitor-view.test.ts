import { describe, expect, it } from 'vitest';
import type { DashboardSnapshot } from '@nexuspilot/ipc-contracts';
import { buildAgentTimeline, buildAgentTopology, filterAgentTimeline, filterAgentTopology } from '../src/renderer/features/home/agent-monitor-view.js';

const dashboard = {
  agentSwarms: [{
    swarmId: 'swarm-a',
    workspaceId: 'workspace-a',
    ownerClientId: 'chatgpt',
    ownerSessionId: 'session-a',
    state: 'running',
    maxConcurrency: 2,
    createdAt: '2026-09-21T01:00:00.000Z',
    updatedAt: '2026-09-21T01:00:04.000Z',
    tasks: [
      {
        id: 'design',
        dependsOn: [],
        state: 'completed',
        createdAt: '2026-09-21T01:00:00.000Z',
        startedAt: '2026-09-21T01:00:01.000Z',
        finishedAt: '2026-09-21T01:00:02.000Z',
        resultAvailable: true,
        outputTruncated: false,
      },
      {
        id: 'review',
        dependsOn: ['design'],
        state: 'running',
        createdAt: '2026-09-21T01:00:00.000Z',
        startedAt: '2026-09-21T01:00:03.000Z',
        resultAvailable: false,
        outputTruncated: false,
      },
    ],
  }],
  agentObservations: [{
    id: 'process:claude-1',
    provider: 'claude_code',
    kind: 'managed_process',
    workspaceId: 'workspace-b',
    label: 'claude',
    state: 'running',
    startedAt: '2026-09-21T01:00:04.000Z',
    updatedAt: '2026-09-21T01:00:05.000Z',
  }],
} as DashboardSnapshot;

describe('Agent Monitor topology and timeline', () => {
  it('builds swarm containment and task dependency edges plus provider worker nodes', () => {
    const topology = buildAgentTopology(dashboard);
    expect(topology.nodes.map((node) => [node.id, node.kind])).toEqual([
      ['swarm:swarm-a', 'swarm'],
      ['swarm:swarm-a:task:design', 'swarm_task'],
      ['swarm:swarm-a:task:review', 'swarm_task'],
      ['process:claude-1', 'managed_process'],
    ]);
    expect(topology.edges).toContainEqual({
      from: 'swarm:swarm-a:task:design',
      to: 'swarm:swarm-a:task:review',
      kind: 'dependency',
    });
  });

  it('orders timestamped swarm/task/process events newest first without inventing missing events', () => {
    const timeline = buildAgentTimeline(dashboard);
    expect(timeline[0]).toMatchObject({
      id: 'process:claude-1:observed',
      provider: 'claude_code',
      timestamp: '2026-09-21T01:00:05.000Z',
      event: 'observed',
    });
    expect(timeline.map((event) => event.id)).toContain('swarm:swarm-a:task:design:finished');
    expect(timeline.map((event) => event.id)).toContain('swarm:swarm-a:task:review:started');
    expect(timeline.some((event) => event.id.includes('finished') && event.label === 'review')).toBe(false);
  });

  it('filters topology and timeline consistently by provider, workspace, and state', () => {
    const topology = buildAgentTopology(dashboard);
    const timeline = buildAgentTimeline(dashboard);

    expect(filterAgentTopology(topology, { provider: 'claude_code' }).nodes.map((node) => node.id)).toEqual(['process:claude-1']);
    expect(filterAgentTimeline(timeline, { provider: 'claude_code' }).every((event) => event.provider === 'claude_code')).toBe(true);

    const runningCodex = filterAgentTopology(topology, { provider: 'codex', workspaceId: 'workspace-a', state: 'running' });
    expect(runningCodex.nodes.map((node) => node.label)).toEqual(['swarm-a', 'review']);
    expect(runningCodex.edges).toEqual([{ from: 'swarm:swarm-a', to: 'swarm:swarm-a:task:review', kind: 'contains' }]);
  });
});
