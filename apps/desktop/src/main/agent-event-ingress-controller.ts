import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AgentEventInput, AgentEventReceipt } from '@nexuspilot/application';

const HOST = '127.0.0.1';
const EVENT_PATH = '/v1/agent-events';
const MAX_BODY_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 120;
const ALLOWED_KEYS = new Set([
  'agentId', 'parentAgentId', 'provider', 'workspaceId', 'clientId', 'sessionId',
  'label', 'eventType', 'state', 'currentActivity', 'toolName', 'ttlSeconds',
]);
const PROVIDERS = new Set(['codex', 'claude_code']);
const EVENT_TYPES = new Set([
  'registered', 'started', 'updated', 'heartbeat', 'spawned',
  'tool_started', 'tool_completed', 'completed', 'failed', 'disconnected',
]);
const STATES = new Set([
  'starting', 'running', 'completed', 'exited', 'failed', 'cancelled',
  'stopped', 'timed_out', 'termination_unverified',
]);

export interface AgentEventIngressPort {
  ingest(input: AgentEventInput): AgentEventReceipt;
}

export interface AgentEventIngressStatus {
  readonly enabled: boolean;
  readonly running: boolean;
  readonly endpoint: string | null;
  readonly token: string | null;
}

export class AgentEventIngressController {
  private server: Server | null = null;
  private endpoint: string | null = null;
  private tokenValue: string | null = null;
  private readonly requestTimes: number[] = [];

  public constructor(private readonly service: AgentEventIngressPort) {}

  public status(enabled: boolean): AgentEventIngressStatus {
    return {
      enabled,
      running: this.server !== null && this.endpoint !== null && this.tokenValue !== null,
      endpoint: this.endpoint,
      token: this.tokenValue,
    };
  }

  public async start(): Promise<AgentEventIngressStatus> {
    if (this.server !== null) return this.status(true);
    this.tokenValue = randomBytes(32).toString('base64url');
    const server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    server.on('clientError', (_error, socket) => {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      server.once('error', onError);
      server.listen({ host: HOST, port: 0, exclusive: true }, () => {
        server.off('error', onError);
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      server.close();
      this.tokenValue = null;
      throw new Error('Agent Event ingress could not resolve its loopback port');
    }
    this.server = server;
    this.endpoint = `http://${HOST}:${address.port}${EVENT_PATH}`;
    return this.status(true);
  }

  public async stop(): Promise<AgentEventIngressStatus> {
    const server = this.server;
    this.server = null;
    this.endpoint = null;
    this.tokenValue = null;
    this.requestTimes.length = 0;
    if (server !== null) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    return this.status(false);
  }

  public rotateToken(): AgentEventIngressStatus {
    if (this.server === null) throw new Error('Agent Event ingress is not running');
    this.tokenValue = randomBytes(32).toString('base64url');
    return this.status(true);
  }

  public async close(): Promise<void> {
    await this.stop();
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (request.socket.remoteAddress !== HOST && request.socket.remoteAddress !== `::ffff:${HOST}`) {
        return sendJson(response, 403, { error: 'loopback_only' });
      }
      if (request.method !== 'POST' || request.url !== EVENT_PATH) {
        return sendJson(response, 404, { error: 'not_found' });
      }
      if (!this.authorized(request.headers.authorization)) {
        return sendJson(response, 401, { error: 'unauthorized' });
      }
      if (!this.consumeRateLimit(Date.now())) {
        return sendJson(response, 429, { error: 'rate_limited' });
      }
      const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
      if (contentType !== 'application/json') {
        return sendJson(response, 415, { error: 'application_json_required' });
      }
      const body = await readBoundedBody(request, MAX_BODY_BYTES);
      const parsed: unknown = JSON.parse(body);
      const input = parseAgentEventInput(parsed);
      const receipt = this.service.ingest(input);
      return sendJson(response, 202, receipt);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'invalid_request';
      return sendJson(response, message === 'request_body_too_large' ? 413 : 400, { error: message });
    }
  }

  private authorized(header: string | undefined): boolean {
    if (this.tokenValue === null || header === undefined || !header.startsWith('Bearer ')) return false;
    const provided = header.slice('Bearer '.length).trim();
    if (provided.length === 0) return false;
    const expectedDigest = createHash('sha256').update(this.tokenValue).digest();
    const providedDigest = createHash('sha256').update(provided).digest();
    return timingSafeEqual(expectedDigest, providedDigest);
  }

  private consumeRateLimit(now: number): boolean {
    while (this.requestTimes.length > 0 && (this.requestTimes[0] ?? now) <= now - RATE_WINDOW_MS) this.requestTimes.shift();
    if (this.requestTimes.length >= RATE_MAX_REQUESTS) return false;
    this.requestTimes.push(now);
    return true;
  }
}

function parseAgentEventInput(value: unknown): AgentEventInput {
  if (!isRecord(value) || Object.keys(value).some((key) => !ALLOWED_KEYS.has(key))) throw new Error('invalid_agent_event');
  const provider = value.provider;
  const eventType = value.eventType;
  const state = value.state;
  if (typeof provider !== 'string' || !PROVIDERS.has(provider)) throw new Error('invalid_provider');
  if (typeof eventType !== 'string' || !EVENT_TYPES.has(eventType)) throw new Error('invalid_event_type');
  if (state !== undefined && (typeof state !== 'string' || !STATES.has(state))) throw new Error('invalid_state');
  const normalizedState = state === undefined ? undefined : state as Exclude<AgentEventInput['state'], undefined>;
  const parentAgentId = optionalString(value.parentAgentId, 'parentAgentId');
  const clientId = optionalString(value.clientId, 'clientId');
  const sessionId = optionalString(value.sessionId, 'sessionId');
  const currentActivity = optionalString(value.currentActivity, 'currentActivity');
  const toolName = optionalString(value.toolName, 'toolName');
  const ttlSeconds = value.ttlSeconds === undefined ? undefined : integer(value.ttlSeconds, 'ttlSeconds');
  const input: AgentEventInput = {
    agentId: requiredString(value.agentId, 'agentId'),
    provider: provider as AgentEventInput['provider'],
    workspaceId: requiredString(value.workspaceId, 'workspaceId'),
    label: requiredString(value.label, 'label'),
    eventType: eventType as AgentEventInput['eventType'],
    ...(parentAgentId === undefined ? {} : { parentAgentId }),
    ...(clientId === undefined ? {} : { clientId }),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(normalizedState === undefined ? {} : { state: normalizedState }),
    ...(currentActivity === undefined ? {} : { currentActivity }),
    ...(toolName === undefined ? {} : { toolName }),
    ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
  };
  return input;
}

async function readBoundedBody(request: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > limit) throw new Error('request_body_too_large');
    chunks.push(buffer);
  }
  if (size === 0) throw new Error('empty_request_body');
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`invalid_${name}`);
  return value;
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`invalid_${name}`);
  return value;
}

function integer(value: unknown, name: string): number {
  if (!Number.isInteger(value)) throw new Error(`invalid_${name}`);
  return value as number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
