import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteAgentEventRepository, SqliteDatabase } from '@nexuspilot/storage';
import { AgentEventService } from './agent-event-service.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(now: Date): Promise<{ database: SqliteDatabase; service: AgentEventService; repository: SqliteAgentEventRepository }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nexuspilot-agent-event-service-'));
  roots.push(root);
  const database = new SqliteDatabase(path.join(root, 'state.sqlite'));
  const repository = new SqliteAgentEventRepository(database);
  return { database, repository, service: new AgentEventService(repository, () => now) };
}

describe('AgentEventService', () => {
  it('ingests provider metadata with host timestamps and a bounded lease', async () => {
    const now = new Date('2026-09-21T00:00:00.000Z');
    const { database, service, repository } = await fixture(now);
    try {
      const receipt = service.ingest({
        agentId: 'claude-main',
        provider: 'claude_code',
        workspaceId: 'workspace-a',
        clientId: 'claude-code',
        sessionId: 'session-a',
        label: 'Claude main',
        eventType: 'started',
        currentActivity: 'reviewing code',
        toolName: 'read_file',
        ttlSeconds: 180,
      });

      expect(receipt).toMatchObject({
        agentId: 'claude-main',
        state: 'running',
        receivedAt: '2026-09-21T00:00:00.000Z',
        expiresAt: '2026-09-21T00:03:00.000Z',
      });
      expect(service.monitorSnapshot()).toEqual([
        expect.objectContaining({
          agentId: 'claude-main',
          provider: 'claude_code',
          currentActivity: 'reviewing code',
          toolName: 'read_file',
          startedAt: '2026-09-21T00:00:00.000Z',
        }),
      ]);
      expect(repository.listRecentEvents()[0]).toMatchObject({
        agentId: 'claude-main',
        eventType: 'started',
        state: 'running',
      });
    } finally {
      database.close();
    }
  });

  it('keeps terminal agents visible briefly and rejects oversized/unbounded metadata', async () => {
    const now = new Date('2026-09-21T00:00:00.000Z');
    const { database, service } = await fixture(now);
    try {
      const receipt = service.ingest({
        agentId: 'codex-review',
        provider: 'codex',
        workspaceId: 'workspace-a',
        label: 'Codex review',
        eventType: 'completed',
      });
      expect(receipt.state).toBe('completed');
      expect(receipt.expiresAt).toBe('2026-09-21T00:15:00.000Z');
      expect(() => service.ingest({
        agentId: 'x'.repeat(161),
        provider: 'codex',
        workspaceId: 'workspace-a',
        label: 'bad',
        eventType: 'heartbeat',
      })).toThrow('agentId');
      expect(() => service.ingest({
        agentId: 'ok',
        provider: 'codex',
        workspaceId: 'workspace-a',
        label: 'bad ttl',
        eventType: 'heartbeat',
        ttlSeconds: 5,
      })).toThrow('ttlSeconds');
    } finally {
      database.close();
    }
  });

  it('does not define prompt or result body fields in the protocol payload', async () => {
    const now = new Date('2026-09-21T00:00:00.000Z');
    const { database, service } = await fixture(now);
    try {
      const receipt = service.ingest({
        agentId: 'claude-safe',
        provider: 'claude_code',
        workspaceId: 'workspace-a',
        label: 'Claude safe',
        eventType: 'updated',
        currentActivity: 'running tests',
      });
      expect(JSON.stringify(receipt)).not.toContain('prompt');
      expect(JSON.stringify(receipt)).not.toContain('result');
    } finally {
      database.close();
    }
  });
});
