#!/usr/bin/env node
/* global process, fetch, AbortController, setTimeout, clearTimeout, Buffer */
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
  if (!endpoint || !token || !payload) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
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

async function main() {
  const providerArg = process.argv.find((arg) => arg.startsWith('--provider='));
  const provider = providerArg?.slice('--provider='.length) ?? process.env.NEXUSPILOT_AGENT_PROVIDER;
  const endpoint = process.env.NEXUSPILOT_AGENT_EVENT_ENDPOINT;
  const token = process.env.NEXUSPILOT_AGENT_EVENT_TOKEN;
  if (!endpoint || !token || (provider !== 'codex' && provider !== 'claude_code')) return;
  const input = await readStdin();
  const payload = normalizeHookEvent(provider, input);
  if (!payload) return;
  await postAgentEvent(endpoint, token, payload);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
