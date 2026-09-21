import type { DashboardSnapshot } from '@nexuspilot/ipc-contracts';

export interface AgentTopologyNode {
  readonly id: string;
  readonly label: string;
  readonly provider: 'codex' | 'claude_code' | 'managed_process';
  readonly kind: 'swarm' | 'swarm_task' | 'managed_process' | 'external_agent';
  readonly state: string;
  readonly workspaceId: string;
  readonly parentId?: string;
}

export interface AgentTopologyEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: 'contains' | 'dependency' | 'parent';
}

export interface AgentTopology {
  readonly nodes: readonly AgentTopologyNode[];
  readonly edges: readonly AgentTopologyEdge[];
}

export interface AgentTimelineEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly provider: 'codex' | 'claude_code' | 'managed_process';
  readonly workspaceId: string;
  readonly label: string;
  readonly state: string;
  readonly event: 'created' | 'started' | 'finished' | 'observed';
}

export function buildAgentTopology(dashboard: DashboardSnapshot): AgentTopology {
  const nodes: AgentTopologyNode[] = [];
  const edges: AgentTopologyEdge[] = [];
  const swarms = dashboard.agentSwarms ?? [];
  const observations = dashboard.agentObservations ?? [];

  for (const swarm of swarms) {
    const swarmNodeId = `swarm:${swarm.swarmId}`;
    nodes.push({
      id: swarmNodeId,
      label: swarm.swarmId,
      provider: 'codex',
      kind: 'swarm',
      state: swarm.state,
      workspaceId: swarm.workspaceId,
    });

    for (const task of swarm.tasks) {
      const taskNodeId = `${swarmNodeId}:task:${task.id}`;
      nodes.push({
        id: taskNodeId,
        label: task.id,
        provider: 'codex',
        kind: 'swarm_task',
        state: task.state,
        workspaceId: swarm.workspaceId,
        parentId: swarmNodeId,
      });
      edges.push({ from: swarmNodeId, to: taskNodeId, kind: 'contains' });
      for (const dependency of task.dependsOn) {
        edges.push({
          from: `${swarmNodeId}:task:${dependency}`,
          to: taskNodeId,
          kind: 'dependency',
        });
      }
    }
  }

  const monitorObservations = observations.filter(
    (observation) => observation.kind === 'managed_process' || observation.kind === 'external_agent',
  );
  for (const observation of monitorObservations) {
    nodes.push({
      id: observation.id,
      label: observation.label,
      provider: observation.provider,
      kind: observation.kind,
      state: observation.state,
      workspaceId: observation.workspaceId,
      ...(observation.parentId === undefined ? {} : { parentId: observation.parentId }),
    });
  }
  const allNodeIds = new Set(nodes.map((node) => node.id));
  for (const observation of monitorObservations) {
    if (observation.parentId !== undefined && allNodeIds.has(observation.parentId)) {
      edges.push({ from: observation.parentId, to: observation.id, kind: 'parent' });
    }
  }

  return { nodes, edges };
}

export function buildAgentTimeline(dashboard: DashboardSnapshot): readonly AgentTimelineEvent[] {
  const events: AgentTimelineEvent[] = [];

  for (const swarm of dashboard.agentSwarms ?? []) {
    events.push({
      id: `swarm:${swarm.swarmId}:created`,
      timestamp: swarm.createdAt,
      provider: 'codex',
      workspaceId: swarm.workspaceId,
      label: swarm.swarmId,
      state: swarm.state,
      event: 'created',
    });

    for (const task of swarm.tasks) {
      events.push({
        id: `swarm:${swarm.swarmId}:task:${task.id}:created`,
        timestamp: task.createdAt,
        provider: 'codex',
        workspaceId: swarm.workspaceId,
        label: task.id,
        state: task.state,
        event: 'created',
      });
      if (task.startedAt !== undefined) {
        events.push({
          id: `swarm:${swarm.swarmId}:task:${task.id}:started`,
          timestamp: task.startedAt,
          provider: 'codex',
          workspaceId: swarm.workspaceId,
          label: task.id,
          state: task.state,
          event: 'started',
        });
      }
      if (task.finishedAt !== undefined) {
        events.push({
          id: `swarm:${swarm.swarmId}:task:${task.id}:finished`,
          timestamp: task.finishedAt,
          provider: 'codex',
          workspaceId: swarm.workspaceId,
          label: task.id,
          state: task.state,
          event: 'finished',
        });
      }
    }
  }

  for (const observation of dashboard.agentObservations ?? []) {
    if (observation.kind !== 'managed_process' && observation.kind !== 'external_agent') continue;
    if (observation.startedAt !== undefined) {
      events.push({
        id: `${observation.id}:started`,
        timestamp: observation.startedAt,
        provider: observation.provider,
        workspaceId: observation.workspaceId,
        label: observation.label,
        state: observation.state,
        event: 'started',
      });
    }
    if (observation.updatedAt !== undefined && observation.updatedAt !== observation.startedAt) {
      events.push({
        id: `${observation.id}:observed`,
        timestamp: observation.updatedAt,
        provider: observation.provider,
        workspaceId: observation.workspaceId,
        label: observation.label,
        state: observation.state,
        event: observation.state === 'running' || observation.state === 'starting' ? 'observed' : 'finished',
      });
    }
  }

  return events.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}


export interface AgentMonitorFilter {
  readonly provider?: AgentTopologyNode['provider'];
  readonly workspaceId?: string;
  readonly state?: string;
}

export function filterAgentTopology(topology: AgentTopology, filter: AgentMonitorFilter): AgentTopology {
  const nodes = topology.nodes.filter((node) => matchesAgentFilter(node.provider, node.workspaceId, node.state, filter));
  const visible = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: topology.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to)),
  };
}

export function filterAgentTimeline(
  timeline: readonly AgentTimelineEvent[],
  filter: AgentMonitorFilter,
): readonly AgentTimelineEvent[] {
  return timeline.filter((event) => matchesAgentFilter(event.provider, event.workspaceId, event.state, filter));
}

function matchesAgentFilter(
  provider: AgentTopologyNode['provider'],
  workspaceId: string,
  state: string,
  filter: AgentMonitorFilter,
): boolean {
  if (filter.provider !== undefined && provider !== filter.provider) return false;
  if (filter.workspaceId !== undefined && workspaceId !== filter.workspaceId) return false;
  if (filter.state !== undefined && state !== filter.state) return false;
  return true;
}
