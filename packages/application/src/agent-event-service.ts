import { randomUUID } from 'node:crypto';
import {
  SqliteAgentEventRepository,
  type StoredExternalAgentEventType,
  type StoredExternalAgentObservation,
  type StoredExternalAgentProvider,
  type StoredExternalAgentState,
} from '@nexuspilot/storage';

const MAX_ID_LENGTH = 160;
const MAX_LABEL_LENGTH = 160;
const MAX_ACTIVITY_LENGTH = 512;
const MAX_TOOL_NAME_LENGTH = 160;
const DEFAULT_TTL_SECONDS = 120;
const MAX_TTL_SECONDS = 3600;
const TERMINAL_RETENTION_SECONDS = 900;
const EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;
const TERMINAL_STATES = new Set<StoredExternalAgentState>([
  'completed', 'exited', 'failed', 'cancelled', 'stopped', 'timed_out', 'termination_unverified',
]);

export interface AgentEventInput {
  readonly agentId: string;
  readonly parentAgentId?: string;
  readonly provider: StoredExternalAgentProvider;
  readonly workspaceId: string;
  readonly clientId?: string;
  readonly sessionId?: string;
  readonly label: string;
  readonly eventType: StoredExternalAgentEventType;
  readonly state?: StoredExternalAgentState;
  readonly currentActivity?: string;
  readonly toolName?: string;
  readonly ttlSeconds?: number;
}

export interface AgentEventReceipt {
  readonly eventId: string;
  readonly agentId: string;
  readonly state: StoredExternalAgentState;
  readonly receivedAt: string;
  readonly expiresAt: string;
}

export class AgentEventService {
  public constructor(
    private readonly repository: SqliteAgentEventRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public ingest(input: AgentEventInput): AgentEventReceipt {
    const received = this.now();
    const receivedAt = received.toISOString();
    const state = normalizedState(input.eventType, input.state);
    const terminal = TERMINAL_STATES.has(state);
    const ttlSeconds = terminal ? TERMINAL_RETENTION_SECONDS : boundedTtl(input.ttlSeconds);
    const expiresAt = new Date(received.getTime() + ttlSeconds * 1000).toISOString();
    const agentId = requiredText('agentId', input.agentId, MAX_ID_LENGTH);
    const workspaceId = requiredText('workspaceId', input.workspaceId, MAX_ID_LENGTH);
    const label = requiredText('label', input.label, MAX_LABEL_LENGTH);
    const parentAgentId = optionalText('parentAgentId', input.parentAgentId, MAX_ID_LENGTH);
    const clientId = optionalText('clientId', input.clientId, MAX_ID_LENGTH);
    const sessionId = optionalText('sessionId', input.sessionId, MAX_ID_LENGTH);
    const currentActivity = optionalText('currentActivity', input.currentActivity, MAX_ACTIVITY_LENGTH);
    const toolName = optionalText('toolName', input.toolName, MAX_TOOL_NAME_LENGTH);
    const eventId = randomUUID();

    const observation: StoredExternalAgentObservation = {
      agentId,
      ...(parentAgentId === undefined ? {} : { parentAgentId }),
      provider: input.provider,
      workspaceId,
      ...(clientId === undefined ? {} : { clientId }),
      ...(sessionId === undefined ? {} : { sessionId }),
      label,
      state,
      ...(currentActivity === undefined ? {} : { currentActivity }),
      ...(toolName === undefined ? {} : { toolName }),
      ...(input.eventType === 'started' || input.eventType === 'spawned' ? { startedAt: receivedAt } : {}),
      updatedAt: receivedAt,
      expiresAt,
    };
    this.repository.upsertObservation(observation);
    this.repository.appendEvent({
      eventId,
      agentId,
      eventType: input.eventType,
      provider: input.provider,
      workspaceId,
      state,
      ...(currentActivity === undefined ? {} : { currentActivity }),
      ...(toolName === undefined ? {} : { toolName }),
      timestamp: receivedAt,
    });
    this.repository.removeExpired(receivedAt);
    this.repository.pruneEvents(new Date(received.getTime() - EVENT_RETENTION_MS).toISOString());
    return { eventId, agentId, state, receivedAt, expiresAt };
  }

  public monitorSnapshot(limit = 50): readonly StoredExternalAgentObservation[] {
    const nowIso = this.now().toISOString();
    this.repository.removeExpired(nowIso);
    return this.repository.listCurrent(nowIso, limit);
  }
}

function normalizedState(eventType: StoredExternalAgentEventType, state: StoredExternalAgentState | undefined): StoredExternalAgentState {
  if (state !== undefined) return state;
  if (eventType === 'registered') return 'starting';
  if (eventType === 'started' || eventType === 'spawned' || eventType === 'updated' || eventType === 'heartbeat' || eventType === 'tool_started' || eventType === 'tool_completed') return 'running';
  if (eventType === 'completed') return 'completed';
  if (eventType === 'failed') return 'failed';
  return 'stopped';
}

function boundedTtl(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(value) || value < 30 || value > MAX_TTL_SECONDS) throw new Error('ttlSeconds must be an integer between 30 and 3600');
  return value;
}

function requiredText(name: string, value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) throw new Error(`${name} must contain 1-${maxLength} characters`);
  return normalized;
}

function optionalText(name: string, value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) throw new Error(`${name} must contain 1-${maxLength} characters when provided`);
  return normalized;
}
