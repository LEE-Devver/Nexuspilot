import { describe, expect, it, vi } from 'vitest';
import { normalizeHookEvent, postAgentEvent } from '../../scripts/agent-event-hook.mjs';

describe('agent-event hook adapter', () => {
  it('maps Codex session and tool hooks without forwarding tool input', () => {
    const started = normalizeHookEvent('codex', {
      session_id: 'thr_123',
      cwd: '/repo',
      hook_event_name: 'SessionStart',
      transcript_path: '/secret/transcript.jsonl',
    }, {});
    expect(started).toMatchObject({
      agentId: 'codex:thr_123',
      provider: 'codex',
      sessionId: 'thr_123',
      eventType: 'started',
      state: 'running',
      label: 'Codex session',
    });
    expect(started?.workspaceId).toMatch(/^external:[a-f0-9]{24}$/);
    expect(started).not.toHaveProperty('transcript_path');

    const tool = normalizeHookEvent('codex', {
      session_id: 'thr_123',
      cwd: '/repo',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'echo super-secret' },
    }, { NEXUSPILOT_WORKSPACE_ID: 'workspace-a' });
    expect(tool).toMatchObject({
      workspaceId: 'workspace-a',
      eventType: 'tool_started',
      toolName: 'Bash',
    });
    expect(JSON.stringify(tool)).not.toContain('super-secret');
  });

  it('maps subagents to a stable parent/child topology', () => {
    const child = normalizeHookEvent('codex', {
      session_id: 'thr_123',
      cwd: '/repo',
      hook_event_name: 'SubagentStart',
      agent_id: 'agent-7',
      agent_type: 'reviewer',
    }, {});
    expect(child).toMatchObject({
      agentId: 'codex:thr_123:agent-7',
      parentAgentId: 'codex:thr_123',
      eventType: 'spawned',
      label: 'Codex subagent',
    });

    const stopped = normalizeHookEvent('claude_code', {
      session_id: 'session-9',
      cwd: '/repo',
      hook_event_name: 'SubagentStop',
      agent_id: 'child-2',
      last_assistant_message: 'must never leave hook payload',
    }, {});
    expect(stopped).toMatchObject({
      agentId: 'claude_code:session-9:child-2',
      parentAgentId: 'claude_code:session-9',
      eventType: 'completed',
      state: 'completed',
    });
    expect(JSON.stringify(stopped)).not.toContain('must never leave');
  });

  it('keeps Stop non-terminal and SessionEnd terminal', () => {
    expect(normalizeHookEvent('codex', {
      session_id: 'thr_1', cwd: '/repo', hook_event_name: 'Stop',
    }, {})).toMatchObject({ eventType: 'updated', state: 'running' });
    expect(normalizeHookEvent('codex', {
      session_id: 'thr_1', cwd: '/repo', hook_event_name: 'SessionEnd',
    }, {})).toMatchObject({ eventType: 'completed', state: 'completed' });
  });

  it('posts only to the configured ingress with bearer authentication', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    const ok = await postAgentEvent('http://127.0.0.1:1234/v1/agent-events', 'token-1', {
      agentId: 'codex:1',
    }, fetchImpl as typeof fetch, 100);
    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/v1/agent-events',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer token-1',
          'content-type': 'application/json',
        },
      }),
    );
  });

  it('fails open when the ingress is unavailable', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    await expect(postAgentEvent('http://127.0.0.1:1/v1/agent-events', 'token', {
      agentId: 'codex:1',
    }, fetchImpl as typeof fetch, 50)).resolves.toBe(false);
  });
});
