#!/usr/bin/env node
/* global process, fetch, AbortController, setTimeout, clearTimeout, Buffer, URL */
import { lstat } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const MAX_STDIN_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 1500;

export function normalizeHookEvent(provider, input, env = process.env) {
  if (provider !== 'codex' && provider !== 'claude_code') return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const eventName = text(input.hook_event_name) ?? text(input.hookEventName);
  const sessionId = text(input.session_id) ?? text(input.sessionId);
  if (!eventName || !sessionId) return null;

  const cwd = text(input.cwd) ?? process.cwd();
  const workspaceId = text(env.NEXUSPILOT_WORKSPACE_ID) ?? `external:${sha256(cwd).slice(0, 24)}`;
  const subagentId = text(input.agent_id) ?? text(input.agentId);
  const isSubagent = eventName === 'SubagentStart' || eventName === 'SubagentStop';
  const rootAgentId = `${provider}:${sessionId}`;
  const agentId = isSubagent && subagentId ? `${rootAgentId}:${subagentId}` : rootAgentId;
  const toolName = text(input.tool_name) ?? text(input.toolName);
  const mapped = mapEvent(eventName);
  if (!mapped) return null;

  return {
    agentId,
    ...(isSubagent && subagentId ? { parentAgentId: rootAgentId } : {}),
    provider,
    workspaceId,
    sessionId,
    label: isSubagent ? `${providerLabel(provider)} subagent` : `${providerLabel(provider)} session`,
    eventType: mapped.eventType,
    state: mapped.state,
    ...(mapped.activity ? { currentActivity: mapped.activity } : {}),
    ...(toolName && (eventName === 'PreToolUse' || eventName === 'PostToolUse') ? { toolName } : {}),
  };
}

function mapEvent(name) {
  switch (name) {
    case 'SessionStart': return { eventType: 'started', state: 'running', activity: 'session started' };
    case 'SessionEnd': return { eventType: 'completed', state: 'completed', activity: 'session ended' };
    case 'SubagentStart': return { eventType: 'spawned', state: 'running', activity: 'subagent started' };
    case 'SubagentStop': return { eventType: 'completed', state: 'completed', activity: 'subagent stopped' };
    case 'PreToolUse': return { eventType: 'tool_started', state: 'running', activity: 'tool running' };
    case 'PostToolUse': return { eventType: 'tool_completed', state: 'running', activity: 'tool completed' };
    case 'Interrupt': return { eventType: 'updated', state: 'running', activity: 'turn interrupted' };
    case 'Stop': return { eventType: 'updated', state: 'running', activity: 'turn stopped' };
    case 'UserPromptSubmit': return { eventType: 'heartbeat', state: 'running', activity: 'active' };
    default: return null;
  }
}

export async function postAgentEvent(endpoint, token, payload, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!validEndpoint(endpoint) || !token || !payload) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return response.status === 202;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_STDIN_BYTES) return null;
    chunks.push(buffer);
  }
  if (size === 0) return null;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function providerLabel(provider) {
  return provider === 'codex' ? 'Codex' : 'Claude Code';
}

function validEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port !== ''
      && url.pathname === '/v1/agent-events' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export async function resolveRuntimeCapability(env = process.env, directory = process.getuid ? `/tmp/nexuspilot-events-${process.getuid()}` : null) {
  // Never mix explicit and discovered credentials, or fall back after a partial override.
  if (env.NEXUSPILOT_AGENT_EVENT_ENDPOINT || env.NEXUSPILOT_AGENT_EVENT_TOKEN) {
    return validEndpoint(env.NEXUSPILOT_AGENT_EVENT_ENDPOINT) && env.NEXUSPILOT_AGENT_EVENT_TOKEN
      ? { endpoint: env.NEXUSPILOT_AGENT_EVENT_ENDPOINT, token: env.NEXUSPILOT_AGENT_EVENT_TOKEN } : null;
  }
  if (!directory || process.platform === 'win32') return null;
  try {
    const dir = await lstat(directory);
    const file = await lstat(`${directory}/capability.sock`);
    if (!dir.isDirectory() || !file.isSocket() || dir.uid !== process.getuid() || file.uid !== process.getuid()
      || (dir.mode & 0o077) !== 0 || (file.mode & 0o077) !== 0) return null;
    return await new Promise((resolve) => {
      const socket = createConnection(`${directory}/capability.sock`);
      let data = '';
      const finish = (value) => { socket.destroy(); resolve(value); };
      socket.setTimeout(300, () => finish(null));
      socket.on('error', () => finish(null));
      socket.on('data', (chunk) => { data += chunk.toString(); if (data.length > 4096) finish(null); });
      socket.on('end', () => {
        try {
          const value = JSON.parse(data);
          finish(validEndpoint(value.endpoint) && typeof value.token === 'string' && value.token.length <= 256 ? value : null);
        } catch { finish(null); }
      });
    });
  } catch { return null; }
}

async function main() {
  const providerArg = process.argv.find((arg) => arg.startsWith('--provider='));
  const provider = providerArg?.slice('--provider='.length) ?? process.env.NEXUSPILOT_AGENT_PROVIDER;
  if (provider !== 'codex' && provider !== 'claude_code') return;
  const capability = await resolveRuntimeCapability();
  if (!capability) return;
  const input = await readStdin();
  const payload = normalizeHookEvent(provider, input);
  if (payload) await postAgentEvent(capability.endpoint, capability.token, payload);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Bound the entire hook, including stalled stdin. Never emit provider-visible output.
  const deadline = setTimeout(() => process.exit(0), 2500);
  try { await main(); } catch { /* Monitoring must never affect provider execution. */ }
  finally { clearTimeout(deadline); process.stdin.destroy(); }
}
