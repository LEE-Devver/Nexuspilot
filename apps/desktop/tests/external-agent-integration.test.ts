import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExternalAgentProvider } from '@nexuspilot/ipc-contracts';
import { ExternalAgentIntegrationService } from '../src/main/external-agent-integration.js';
import { parseIntegrationRequest, parseIntegrationResult } from '../src/preload/external-agent-integration-parser.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(provider: ExternalAgentProvider): { root: string; file: string; hook: string; service: ExternalAgentIntegrationService } {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'np-integration-'))); roots.push(root);
  const hook = path.join(root, "repo with ' quote", 'scripts', 'agent-event-hook.mjs');
  mkdirSync(path.dirname(hook), { recursive: true }); writeFileSync(hook, '');
  const dir = path.join(root, provider === 'codex' ? '.codex' : '.claude'); mkdirSync(dir);
  return { root, hook, file: path.join(dir, provider === 'codex' ? 'hooks.json' : 'settings.json'),
    service: new ExternalAgentIntegrationService(hook, { home: root, env: {}, platform: 'darwin' }) };
}
function apply(service: ExternalAgentIntegrationService, provider: ExternalAgentProvider, action: 'setup' | 'remove'): ReturnType<ExternalAgentIntegrationService['execute']> {
  const preview = service.execute({ provider, action: action === 'setup' ? 'preview_setup' : 'preview_remove' });
  return service.execute({ provider, action, expectedRevision: preview.revision });
}

describe.each(['codex', 'claude_code'] as const)('%s Desktop integration', (provider) => {
  it('previews without writes, installs once, verifies status, and removes repeatedly', () => {
    const { service, file } = fixture(provider);
    const preview = service.execute({ provider, action: 'preview_setup' });
    expect(preview).toMatchObject({ status: 'not_configured', createsFile: true, backupPath: null, changes: true });
    expect(readdirSync(path.dirname(file))).toEqual([]);
    expect(preview.events.includes('Interrupt')).toBe(provider === 'codex');
    expect(apply(service, provider, 'setup').status).toBe('configured');
    const written = readFileSync(file, 'utf8');
    expect(apply(service, provider, 'setup')).toMatchObject({ status: 'configured', changes: false, backupPath: null });
    expect(readFileSync(file, 'utf8')).toBe(written);
    expect(readdirSync(path.dirname(file))).toHaveLength(1);
    expect(apply(service, provider, 'remove').status).toBe('not_configured');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ hooks: {} });
    expect(apply(service, provider, 'remove')).toMatchObject({ status: 'not_configured', changes: false });
  });

  it('backs up exact bytes and preserves unrelated hooks/settings, including a mixed group', () => {
    const { service, file } = fixture(provider);
    const original = '{ "model" : "keep me", "permissions": {"allow": ["Read"]}, "hooks": {"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"user-hook"}]}]} }\n';
    writeFileSync(file, original);
    const installed = apply(service, provider, 'setup');
    expect(installed.status).toBe('configured');
    expect(readFileSync(installed.backupPath!, 'utf8')).toBe(original);
    if (process.platform !== 'win32') expect(statSync(installed.backupPath!).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, 'utf8')).toContain('"model" : "keep me", "permissions": {"allow": ["Read"]}');
    const json = JSON.parse(readFileSync(file, 'utf8'));
    json.hooks.SessionStart[0].hooks.push({ type: 'command', command: 'also-user-owned' });
    writeFileSync(file, JSON.stringify(json));
    expect(apply(service, provider, 'remove').status).toBe('not_configured');
    const removed = JSON.parse(readFileSync(file, 'utf8'));
    expect(removed.hooks.PreToolUse).toEqual([{ matcher: 'Bash', hooks: [{ type: 'command', command: 'user-hook' }] }]);
    expect(removed.hooks.SessionStart).toEqual([{ hooks: [{ type: 'command', command: 'also-user-owned' }] }]);
    expect(removed.permissions).toEqual({ allow: ['Read'] });
  });

  it('detects command drift, duplicates and option changes and repairs explicitly', () => {
    const { service, file, root } = fixture(provider);
    apply(service, provider, 'setup');
    const nextHook = path.join(root, 'moved-hook.mjs'); writeFileSync(nextHook, '');
    const moved = new ExternalAgentIntegrationService(nextHook, { home: root, env: {}, platform: 'darwin' });
    expect(moved.execute({ provider, action: 'inspect' }).status).toBe('differs');
    expect(JSON.parse(readFileSync(file, 'utf8')).hooks.SessionStart[0].hooks[0].command).toBe(service.execute({ provider, action: 'inspect' }).command);
    expect(apply(moved, provider, 'setup').status).toBe('configured');
    const json = JSON.parse(readFileSync(file, 'utf8'));
    json.hooks.Stop.push(json.hooks.Stop[0]);
    json.hooks.SessionStart[0].hooks[0].async = false;
    writeFileSync(file, JSON.stringify(json));
    expect(moved.execute({ provider, action: 'inspect' }).status).toBe('differs');
    expect(apply(moved, provider, 'setup').status).toBe('configured');
  });

  it.each(['{ broken secret-value', '{"hooks":[]}', '{"hooks":{"Stop":[{}]}}', '{"hooks":{},"hooks":{}}', '{"permissions":{"x":1,"x":2}}', '{"hooks":{},"large":1e400}'])('fails closed for malformed/ambiguous config: %s', (raw) => {
    const { service, file } = fixture(provider); writeFileSync(file, raw);
    const result = apply(service, provider, 'setup');
    expect(result.status).toBe('unavailable'); expect(result.message).not.toContain('secret-value');
    expect(readFileSync(file, 'utf8')).toBe(raw); expect(readdirSync(path.dirname(file))).toHaveLength(1);
  });

  it('rejects changed previews and symlinks, and does not change user disableAllHooks', () => {
    const { service, file, root } = fixture(provider);
    const preview = service.execute({ provider, action: 'preview_setup' });
    writeFileSync(file, '{"model":"changed"}');
    expect(service.execute({ provider, action: 'setup', expectedRevision: preview.revision }).status).toBe('unavailable');
    expect(readFileSync(file, 'utf8')).toBe('{"model":"changed"}');
    writeFileSync(file, '{"disableAllHooks":true}');
    expect(apply(service, provider, 'setup').status).toBe('unavailable');
    expect(readFileSync(file, 'utf8')).toBe('{"disableAllHooks":true}');
    if (process.platform !== 'win32') {
      const target = path.join(root, 'target'); writeFileSync(target, '{}'); rmSync(file); symlinkSync(target, file);
      expect(apply(service, provider, 'setup').status).toBe('unavailable'); expect(readFileSync(target, 'utf8')).toBe('{}');
    }
  });

  it('persists no runtime credentials and honors explicit config locations', () => {
    const { hook, root } = fixture(provider);
    const dir = path.join(root, 'custom');
    const service = new ExternalAgentIntegrationService(hook, { home: root, platform: 'darwin', env: {
      CODEX_HOME: dir, CLAUDE_CONFIG_DIR: dir, NEXUSPILOT_AGENT_EVENT_TOKEN: 'never-persist-this',
      NEXUSPILOT_AGENT_EVENT_ENDPOINT: 'http://127.0.0.1:1234/v1/agent-events',
    } });
    const result = apply(service, provider, 'setup'); expect(result.status).toBe('configured');
    const contents = readFileSync(result.configPath, 'utf8');
    for (const forbidden of ['never-persist-this', '127.0.0.1', 'NEXUSPILOT_AGENT_EVENT_', 'capability.sock']) expect(contents).not.toContain(forbidden);
    expect(result.configPath.startsWith(dir)).toBe(true);
  });
});

it('reports Windows automatic handoff unavailable without writing config', () => {
  const { hook, root, file } = fixture('codex');
  const result = new ExternalAgentIntegrationService(hook, { home: root, env: {}, platform: 'win32' }).execute({ provider: 'codex', action: 'preview_setup' });
  expect(result.status).toBe('unavailable'); expect(readdirSync(path.dirname(file))).toEqual([]);
});

it('validates the Desktop contract and strips unexpected response fields', () => {
  const { service } = fixture('codex');
  const result = service.execute({ provider: 'codex', action: 'inspect' });
  expect(parseIntegrationResult({ ...result, token: 'do-not-expose' })).toEqual(result);
  for (const status of ['not_configured', 'configured', 'differs', 'unavailable']) expect(parseIntegrationResult({ ...result, status }).status).toBe(status);
  expect(() => parseIntegrationResult({ ...result, status: 'future' })).toThrow();
  expect(() => parseIntegrationRequest({ provider: 'codex', action: 'setup' })).toThrow();
  expect(() => parseIntegrationRequest({ provider: 'codex', action: 'inspect', configPath: '/evil' })).toThrow();
  expect(parseIntegrationRequest({ provider: 'claude_code', action: 'preview_remove' })).toEqual({ provider: 'claude_code', action: 'preview_remove' });
});
