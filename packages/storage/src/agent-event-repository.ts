import type { SqliteDatabase } from './database.js';

export type StoredExternalAgentProvider = 'codex' | 'claude_code';
export type StoredExternalAgentState = 'starting' | 'running' | 'completed' | 'exited' | 'failed' | 'cancelled' | 'stopped' | 'timed_out' | 'termination_unverified';
export type StoredExternalAgentEventType = 'registered' | 'started' | 'updated' | 'heartbeat' | 'spawned' | 'tool_started' | 'tool_completed' | 'completed' | 'failed' | 'disconnected';

export interface StoredExternalAgentObservation {
  readonly agentId: string;
  readonly parentAgentId?: string;
  readonly provider: StoredExternalAgentProvider;
  readonly workspaceId: string;
  readonly clientId?: string;
  readonly sessionId?: string;
  readonly label: string;
  readonly state: StoredExternalAgentState;
  readonly currentActivity?: string;
  readonly toolName?: string;
  readonly startedAt?: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

export interface StoredExternalAgentEvent {
  readonly eventId: string;
  readonly agentId: string;
  readonly eventType: StoredExternalAgentEventType;
  readonly provider: StoredExternalAgentProvider;
  readonly workspaceId: string;
  readonly state: StoredExternalAgentState;
  readonly currentActivity?: string;
  readonly toolName?: string;
  readonly timestamp: string;
}

interface ObservationRow {
  agent_id: string;
  parent_agent_id: string | null;
  provider: StoredExternalAgentProvider;
  workspace_id: string;
  client_id: string | null;
  session_id: string | null;
  label: string;
  state: StoredExternalAgentState;
  current_activity: string | null;
  tool_name: string | null;
  started_at: string | null;
  updated_at: string;
  expires_at: string;
}

export class SqliteAgentEventRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public upsertObservation(value: StoredExternalAgentObservation): void {
    this.database.connection.prepare(`
      INSERT INTO agent_external_observations (
        agent_id, parent_agent_id, provider, workspace_id, client_id, session_id, label,
        state, current_activity, tool_name, started_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        parent_agent_id = excluded.parent_agent_id,
        provider = excluded.provider,
        workspace_id = excluded.workspace_id,
        client_id = excluded.client_id,
        session_id = excluded.session_id,
        label = excluded.label,
        state = excluded.state,
        current_activity = excluded.current_activity,
        tool_name = excluded.tool_name,
        started_at = COALESCE(agent_external_observations.started_at, excluded.started_at),
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
    `).run(
      value.agentId, value.parentAgentId ?? null, value.provider, value.workspaceId,
      value.clientId ?? null, value.sessionId ?? null, value.label, value.state,
      value.currentActivity ?? null, value.toolName ?? null, value.startedAt ?? null,
      value.updatedAt, value.expiresAt,
    );
  }

  public appendEvent(value: StoredExternalAgentEvent): void {
    this.database.connection.prepare(`
      INSERT OR IGNORE INTO agent_external_events (
        event_id, agent_id, event_type, provider, workspace_id, state,
        current_activity, tool_name, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      value.eventId, value.agentId, value.eventType, value.provider, value.workspaceId,
      value.state, value.currentActivity ?? null, value.toolName ?? null, value.timestamp,
    );
  }

  public listCurrent(nowIso: string, limit = 50): readonly StoredExternalAgentObservation[] {
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = this.database.connection.prepare(`
      SELECT * FROM agent_external_observations
      WHERE expires_at >= ?
      ORDER BY updated_at DESC, agent_id ASC
      LIMIT ?
    `).all(nowIso, boundedLimit) as unknown as ObservationRow[];
    return rows.map(fromObservationRow);
  }

  public removeExpired(nowIso: string): number {
    return Number(this.database.connection.prepare(
      'DELETE FROM agent_external_observations WHERE expires_at < ?',
    ).run(nowIso).changes);
  }

  public pruneEvents(beforeIso: string): number {
    return Number(this.database.connection.prepare(
      'DELETE FROM agent_external_events WHERE timestamp < ?',
    ).run(beforeIso).changes);
  }

  public listRecentEvents(limit = 100): readonly StoredExternalAgentEvent[] {
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.database.connection.prepare(`
      SELECT event_id, agent_id, event_type, provider, workspace_id, state, current_activity, tool_name, timestamp
      FROM agent_external_events
      ORDER BY timestamp DESC, event_id DESC
      LIMIT ?
    `).all(boundedLimit) as unknown as Array<{
      event_id: string;
      agent_id: string;
      event_type: StoredExternalAgentEventType;
      provider: StoredExternalAgentProvider;
      workspace_id: string;
      state: StoredExternalAgentState;
      current_activity: string | null;
      tool_name: string | null;
      timestamp: string;
    }>;
    return rows.map((row) => ({
      eventId: row.event_id,
      agentId: row.agent_id,
      eventType: row.event_type,
      provider: row.provider,
      workspaceId: row.workspace_id,
      state: row.state,
      ...(row.current_activity === null ? {} : { currentActivity: row.current_activity }),
      ...(row.tool_name === null ? {} : { toolName: row.tool_name }),
      timestamp: row.timestamp,
    }));
  }
}

function fromObservationRow(row: ObservationRow): StoredExternalAgentObservation {
  return {
    agentId: row.agent_id,
    ...(row.parent_agent_id === null ? {} : { parentAgentId: row.parent_agent_id }),
    provider: row.provider,
    workspaceId: row.workspace_id,
    ...(row.client_id === null ? {} : { clientId: row.client_id }),
    ...(row.session_id === null ? {} : { sessionId: row.session_id }),
    label: row.label,
    state: row.state,
    ...(row.current_activity === null ? {} : { currentActivity: row.current_activity }),
    ...(row.tool_name === null ? {} : { toolName: row.tool_name }),
    ...(row.started_at === null ? {} : { startedAt: row.started_at }),
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}
