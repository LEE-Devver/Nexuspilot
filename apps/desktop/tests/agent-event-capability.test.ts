import { chmod, lstat, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentEventIngressController } from '../src/main/agent-event-ingress-controller.js';
// The shipped standalone hook runs under Node, independently of Electron.
import { normalizeHookEvent, postAgentEvent, resolveRuntimeCapability } from '../../../scripts/agent-event-hook.mjs';

const roots: string[] = [];
const controllers: AgentEventIngressController[] = [];
afterEach(async () => {
  for (const controller of controllers.splice(0)) await controller.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(): Promise<{ directory: string; controller: AgentEventIngressController; ingest: ReturnType<typeof vi.fn> }> {
  const directory = await realpath(await mkdtemp('/tmp/np-events-')); roots.push(directory);
  const ingest = vi.fn(() => ({ accepted: true }));
  const controller = new AgentEventIngressController({ ingest } as never, directory); controllers.push(controller);
  return { directory, controller, ingest };
}
const input = { session_id: 'session', cwd: '/repo', hook_event_name: 'PostToolUse', tool_name: 'Read',
  prompt: 'private-prompt', tool_input: { password: 'private-input' }, tool_response: 'private-result',
  tool_output: 'private-output', transcript_path: '/private/transcript', last_assistant_message: 'private-message',
  stdout: 'private-stdout', stderr: 'private-stderr', credentials: 'private-credential', metadata: 'private-arbitrary' };

describe.skipIf(process.platform === 'win32')('memory-only runtime capability', () => {
  it('hands off through a private socket, rotates without reinstall, and revokes on shutdown', async () => {
    const { directory, controller, ingest } = await fixture();
    expect(await resolveRuntimeCapability({}, directory)).toBeNull();
    const first = await controller.start();
    expect((await lstat(directory)).mode & 0o777).toBe(0o700);
    expect((await lstat(path.join(directory, 'capability.sock'))).mode & 0o777).toBe(0o600);
    expect(await readdir(directory)).toEqual(['capability.sock']);
    const capability = await resolveRuntimeCapability({}, directory);
    expect(capability).toEqual({ endpoint: first.endpoint, token: first.token });
    const payload = normalizeHookEvent('codex', input, {});
    expect(await postAgentEvent(capability.endpoint, capability.token, payload)).toBe(true);
    expect(JSON.stringify(ingest.mock.calls)).not.toContain('private-');
    const rotated = controller.rotateToken();
    expect(rotated.token).not.toBe(first.token);
    expect(await postAgentEvent(first.endpoint, first.token, payload)).toBe(false);
    const refreshed = await resolveRuntimeCapability({}, directory);
    expect(await postAgentEvent(refreshed.endpoint, refreshed.token, payload)).toBe(true);
    await controller.stop();
    expect(await readdir(directory)).toEqual([]);
    expect(await resolveRuntimeCapability({}, directory)).toBeNull();
    expect(await postAgentEvent(refreshed.endpoint, refreshed.token, payload)).toBe(false);
    await controller.start();
    expect((await resolveRuntimeCapability({}, directory)).token).not.toBe(refreshed.token);
  });

  it('serializes concurrent start/stop so shutdown cannot leave a live capability behind', async () => {
    const { directory, controller } = await fixture();
    await Promise.all([controller.start(), controller.start(), controller.stop()]);
    expect(controller.status(false)).toMatchObject({ running: false, endpoint: null, token: null });
    expect(await readdir(directory)).toEqual([]);
    expect(await resolveRuntimeCapability({}, directory)).toBeNull();
  });

  it('rejects unsafe directory/socket permissions and never steals a live broker', async () => {
    const { directory, controller } = await fixture();
    await chmod(directory, 0o755);
    await expect(controller.start()).rejects.toThrow('0700');
    expect(controller.status(true).running).toBe(false);
    await chmod(directory, 0o700); await controller.start();
    await chmod(path.join(directory, 'capability.sock'), 0o666);
    expect(await resolveRuntimeCapability({}, directory)).toBeNull();
    await chmod(path.join(directory, 'capability.sock'), 0o600);
    const second = new AgentEventIngressController({ ingest: vi.fn() }, directory); controllers.push(second);
    await expect(second.start()).rejects.toThrow('already running');
    expect((await resolveRuntimeCapability({}, directory)).token).toBe(controller.status(true).token);
  });

  it('runs the actual CLI with explicit session credentials and fails open offline or on malformed input', async () => {
    const { controller, ingest } = await fixture();
    const status = await controller.start();
    async function run(endpoint: string, stdin: string): Promise<{ code: number | null; output: string }> {
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(new URL('../../../scripts/agent-event-hook.mjs', import.meta.url)), '--provider=claude_code'], {
          env: { ...process.env, NEXUSPILOT_AGENT_EVENT_ENDPOINT: endpoint, NEXUSPILOT_AGENT_EVENT_TOKEN: status.token! }, stdio: ['pipe', 'pipe', 'pipe'],
        });
        let output = ''; child.stdout.on('data', (chunk) => { output += String(chunk); }); child.stderr.on('data', (chunk) => { output += String(chunk); });
        child.on('error', reject); child.on('close', (code) => resolve({ code, output })); child.stdin.on('error', () => {}); child.stdin.end(stdin);
      });
    }
    expect(await run(status.endpoint!, JSON.stringify(input))).toEqual({ code: 0, output: '' });
    expect(ingest).toHaveBeenCalledOnce();
    expect(await run(status.endpoint!, '{bad json')).toEqual({ code: 0, output: '' });
    await controller.stop();
    expect(await run(status.endpoint!, JSON.stringify(input))).toEqual({ code: 0, output: '' });
  });
});

it('does not combine partial overrides with discovery or send credentials to non-loopback URLs', async () => {
  expect(await resolveRuntimeCapability({ NEXUSPILOT_AGENT_EVENT_TOKEN: 'partial' }, '/unused')).toBeNull();
  const fetch = vi.fn();
  for (const endpoint of ['https://example.com/v1/agent-events', 'http://localhost:42/v1/agent-events', 'http://127.0.0.1:42/other', 'http://u:p@127.0.0.1:42/v1/agent-events']) {
    expect(await postAgentEvent(endpoint, 'secret', {}, fetch)).toBe(false);
  }
  expect(fetch).not.toHaveBeenCalled();
});
