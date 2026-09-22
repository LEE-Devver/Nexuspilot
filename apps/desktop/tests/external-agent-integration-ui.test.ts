import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { ExternalAgentIntegrationResult } from '@nexuspilot/ipc-contracts';
import { runIntegrationAction } from '../src/renderer/features/settings/external-agent-integration-state.js';

const result: ExternalAgentIntegrationResult = { provider: 'codex', status: 'configured', configPath: '/home/.codex/hooks.json',
  command: 'node hook.mjs', events: ['Stop'], revision: 'a'.repeat(64), createsFile: false, modifiesEntry: false,
  changes: false, backupPath: null, message: 'test' };

describe('integration Settings actions', () => {
  it.each(['setup', 'remove'] as const)('refreshes verified status after %s', async (action) => {
    const verified = { ...result, status: action === 'remove' ? 'not_configured' as const : 'configured' as const };
    const api = { externalAgentIntegration: vi.fn().mockResolvedValueOnce(result).mockResolvedValueOnce(verified) };
    expect(await runIntegrationAction(api, { provider: 'codex', action, expectedRevision: result.revision })).toEqual({ result, status: verified });
    expect(api.externalAgentIntegration.mock.calls[1]).toEqual([{ provider: 'codex', action: 'inspect' }]);
  });
  it('keeps preview read-only and retains useful service errors', async () => {
    const api = { externalAgentIntegration: vi.fn().mockResolvedValue(result) };
    await runIntegrationAction(api, { provider: 'codex', action: 'preview_setup' });
    expect(api.externalAgentIntegration).toHaveBeenCalledOnce();
    const unavailable = { ...result, status: 'unavailable' as const, message: 'Invalid JSON; not changed' };
    api.externalAgentIntegration.mockReset().mockResolvedValue(unavailable);
    expect((await runIntegrationAction(api, { provider: 'codex', action: 'setup', expectedRevision: result.revision })).status).toEqual(unavailable);
    expect(api.externalAgentIntegration).toHaveBeenCalledOnce();
  });
  it('contains IPC errors in the card and always releases busy state', async () => {
    const api = { externalAgentIntegration: vi.fn().mockRejectedValue(new Error('IPC failed')) };
    await expect(runIntegrationAction(api, { provider: 'codex', action: 'inspect' })).rejects.toThrow('IPC failed');
    const source = readFileSync(new URL('../src/renderer/features/settings/ExternalAgentIntegrations.tsx', import.meta.url), 'utf8');
    expect(source).toContain('catch { setError(');
    expect(source).toContain('finally { setBusy(false); }');
    expect(source).toContain('.catch(() => { if (active) setError(');
    expect(source).toContain('Confirm setup');
    expect(source).toContain('Confirm removal');
  });
});
