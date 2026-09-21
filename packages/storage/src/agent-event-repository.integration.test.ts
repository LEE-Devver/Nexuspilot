import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteDatabase } from './database.js';
import { SqliteAgentEventRepository } from './agent-event-repository.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ database: SqliteDatabase; repository: SqliteAgentEventRepository }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nexuspilot-agent-events-'));
  roots.push(root);
  const database = new SqliteDatabase(path.join(root, 'state.sqlite'));
  return { database, repository: new SqliteAgentEventRepository(database) };
}

describe('SqliteAgentEventRepository', () => {
  it('upserts metadata-only external observations and lists only unexpired rows', async () => {
    const { database, repository } = await fixture();
    try {
      repository.upsertObservation({
        agentId: 'claude-main',
        provider: 'claude_code',
        workspaceId: 'workspace-a',
        label: 'Claude main',
        state: 'running',
        currentActivity: 'reviewing code',
        startedAt: '2026-09-21T00:00:00.000Z',
        updatedAt: '2026-09-21T00:00:10.000Z',
        expiresAt: '2026-09-21T00:02:10.000Z',
      });
      repository.upsertObservation({
        agentId: 'expired',
        provider: 'codex',
        workspaceId: 'workspace-a',
        label: 'Old worker',
        state: 'running',
        updatedAt: '2026-09-20T23:00:00.000Z',
        expiresAt: '2026-09-20T23:02:00.000Z',
      });

      expect(repository.listCurrent('2026-09-21T00:01:00.000Z')).toEqual([
        expect.objectContaining({ agentId: 'claude-main', provider: 'claude_code', currentActivity: 'reviewing code' }),
      ]);
      expect(repository.removeExpired('2026-09-21T00:01:00.000Z')).toBe(1);
    } finally {
      database.close();
    }
  });

  it('stores bounded event history separately from current observations', async () => {
    const { database, repository } = await fixture();
    try {
      repository.appendEvent({
        eventId: 'event-1',
        agentId: 'claude-main',
        eventType: 'tool_started',
        provider: 'claude_code',
        workspaceId: 'workspace-a',
        state: 'running',
        currentActivity: 'editing',
        toolName: 'edit_file',
        timestamp: '2026-09-21T00:00:01.000Z',
      });
      repository.appendEvent({
        eventId: 'event-2',
        agentId: 'claude-main',
        eventType: 'tool_completed',
        provider: 'claude_code',
        workspaceId: 'workspace-a',
        state: 'running',
        timestamp: '2026-09-21T00:00:02.000Z',
      });

      expect(repository.listRecentEvents()).toEqual([
        expect.objectContaining({ eventId: 'event-2', eventType: 'tool_completed' }),
        expect.objectContaining({ eventId: 'event-1', toolName: 'edit_file' }),
      ]);
      expect(repository.pruneEvents('2026-09-21T00:00:02.000Z')).toBe(1);
    } finally {
      database.close();
    }
  });
});
