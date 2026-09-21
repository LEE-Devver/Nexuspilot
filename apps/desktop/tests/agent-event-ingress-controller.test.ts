import { describe, expect, it, vi } from 'vitest';
import type { AgentEventInput, AgentEventReceipt } from '@nexuspilot/application';
import { AgentEventIngressController } from '../src/main/agent-event-ingress-controller.js';

function serviceFixture(): { ingest: ReturnType<typeof vi.fn<(input: AgentEventInput) => AgentEventReceipt>> } {
  return {
    ingest: vi.fn((input: AgentEventInput): AgentEventReceipt => ({
      eventId: 'event-1',
      agentId: input.agentId,
      state: input.state ?? 'running',
      receivedAt: '2026-09-21T00:00:00.000Z',
      expiresAt: '2026-09-21T00:02:00.000Z',
    })),
  };
}

describe('AgentEventIngressController', () => {
  it('binds only a loopback ephemeral endpoint and requires bearer authentication', async () => {
    const service = serviceFixture();
    const controller = new AgentEventIngressController(service);
    try {
      const status = await controller.start();
      expect(status.running).toBe(true);
      expect(status.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1\/agent-events$/);
      expect(status.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);

      const unauthorized = await fetch(status.endpoint!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(unauthorized.status).toBe(401);
      expect(service.ingest).not.toHaveBeenCalled();

      const accepted = await fetch(status.endpoint!, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${status.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          agentId: 'claude-main',
          provider: 'claude_code',
          workspaceId: 'workspace-a',
          label: 'Claude main',
          eventType: 'started',
          currentActivity: 'reviewing code',
        }),
      });
      expect(accepted.status).toBe(202);
      expect(await accepted.json()).toMatchObject({ agentId: 'claude-main', eventId: 'event-1' });
      expect(service.ingest).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'claude-main',
        provider: 'claude_code',
        eventType: 'started',
      }));
    } finally {
      await controller.close();
    }
  });

  it('rejects arbitrary fields and oversized bodies before they reach the event service', async () => {
    const service = serviceFixture();
    const controller = new AgentEventIngressController(service);
    try {
      const status = await controller.start();
      const headers = { authorization: `Bearer ${status.token}`, 'content-type': 'application/json' };

      const arbitrary = await fetch(status.endpoint!, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agentId: 'claude-main',
          provider: 'claude_code',
          workspaceId: 'workspace-a',
          label: 'Claude',
          eventType: 'updated',
          prompt: 'must never be accepted',
        }),
      });
      expect(arbitrary.status).toBe(400);

      const oversized = await fetch(status.endpoint!, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agentId: 'claude-main',
          provider: 'claude_code',
          workspaceId: 'workspace-a',
          label: 'Claude',
          eventType: 'updated',
          currentActivity: 'x'.repeat(20_000),
        }),
      });
      expect(oversized.status).toBe(413);
      expect(service.ingest).not.toHaveBeenCalled();
    } finally {
      await controller.close();
    }
  });

  it('rotates and revokes the ephemeral capability token', async () => {
    const service = serviceFixture();
    const controller = new AgentEventIngressController(service);
    const first = await controller.start();
    const oldToken = first.token!;
    const rotated = controller.rotateToken();
    expect(rotated.token).not.toBe(oldToken);

    const oldResponse = await fetch(rotated.endpoint!, {
      method: 'POST',
      headers: { authorization: `Bearer ${oldToken}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(oldResponse.status).toBe(401);

    const stopped = await controller.stop();
    expect(stopped).toEqual({ enabled: false, running: false, endpoint: null, token: null });
  });

  it('rejects unsupported methods, content types, providers, and event types', async () => {
    const service = serviceFixture();
    const controller = new AgentEventIngressController(service);
    try {
      const status = await controller.start();
      const auth = { authorization: `Bearer ${status.token}` };
      expect((await fetch(status.endpoint!, { method: 'GET', headers: auth })).status).toBe(404);
      expect((await fetch(status.endpoint!, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'text/plain' },
        body: '{}',
      })).status).toBe(415);
      expect((await fetch(status.endpoint!, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: 'bad',
          provider: 'unknown',
          workspaceId: 'workspace-a',
          label: 'bad',
          eventType: 'started',
        }),
      })).status).toBe(400);
      expect((await fetch(status.endpoint!, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: 'bad',
          provider: 'codex',
          workspaceId: 'workspace-a',
          label: 'bad',
          eventType: 'arbitrary_event',
        }),
      })).status).toBe(400);
      expect(service.ingest).not.toHaveBeenCalled();
    } finally {
      await controller.close();
    }
  });
});
