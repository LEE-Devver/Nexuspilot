import { runIntegrationAction } from './external-agent-integration-state.js';
import { useEffect, useState, type ReactElement } from 'react';
import type { ExternalAgentIntegrationResult, ExternalAgentProvider } from '@nexuspilot/ipc-contracts';

const LABELS = { not_configured: 'Not configured', configured: 'Configured', differs: 'Configuration differs', unavailable: 'Unsupported / configuration location unavailable' };

export function ExternalAgentIntegrations(): ReactElement {
  return <section aria-label="External Agent Integrations">
    <h3>External Agent Integrations</h3>
    <p className="hint">Setup installs metadata-only hooks. Enable Agent Event ingress above to receive events. Tokens stay in memory; setup does not enable monitoring.</p>
    <IntegrationCard provider="codex" name="Codex" />
    <IntegrationCard provider="claude_code" name="Claude Code" />
  </section>;
}

function IntegrationCard({ provider, name }: { readonly provider: ExternalAgentProvider; readonly name: string }): ReactElement {
  const [status, setStatus] = useState<ExternalAgentIntegrationResult | null>(null);
  const [preview, setPreview] = useState<{ result: ExternalAgentIntegrationResult; action: 'setup' | 'remove' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void window.nexusPilot.externalAgentIntegration({ provider, action: 'inspect' })
      .then((result) => { if (active) setStatus(result); })
      .catch(() => { if (active) setError('Unable to inspect integration. Retry using Refresh status.'); });
    return (): void => { active = false; };
  }, [provider]);

  async function act(action: 'inspect' | 'preview_setup' | 'preview_remove' | 'setup' | 'remove'): Promise<void> {
    setBusy(true); setError(null); setNotice(null);
    try {
      const { result, status: refreshed } = await runIntegrationAction(window.nexusPilot, { provider, action,
        ...(action === 'setup' || action === 'remove' ? { expectedRevision: preview?.result.revision ?? '' } : {}) });
      if (result.status === 'unavailable') { setStatus(result); setPreview(null); return; }
      if (action.startsWith('preview_')) {
        setStatus(result);
        if (result.changes) setPreview({ result, action: action === 'preview_remove' ? 'remove' : 'setup' });
        else { setPreview(null); setNotice('Already up to date; no files changed.'); }
      } else {
        setPreview(null);
        setStatus(refreshed);
        if (action !== 'inspect') setNotice(result.backupPath ? `Saved. Backup: ${result.backupPath}` : 'Saved.');
      }
    } catch { setError('Unable to update integration. Refresh status and retry; check configuration access.'); }
    finally { setBusy(false); }
  }

  return <article className="settings-card" aria-label={`${name} integration`}>
    <h4>{name}</h4>
    <p role="status">{status ? LABELS[status.status] : 'Checking configuration…'}</p>
    {status ? <><p className="hint">{status.message}</p><p><code>{status.configPath}</code></p></> : null}
    <button type="button" className="btn-secondary" disabled={busy} onClick={() => { void act('inspect'); }}>Refresh status</button>
    <button type="button" className="btn-secondary" disabled={busy || !status || status.status === 'unavailable'} onClick={() => { void act('preview_setup'); }}>
      {status?.status === 'differs' ? `Repair ${name} Integration` : `Setup ${name} Integration`}
    </button>
    <button type="button" className="btn-secondary" disabled={busy || !status || status.status === 'unavailable' || status.status === 'not_configured'} onClick={() => { void act('preview_remove'); }}>Remove {name} Integration</button>
    {preview ? <div aria-label={`${name} integration preview`}>
      <p>{preview.action === 'setup' ? 'Install hooks' : 'Remove NexusPilot hooks'}: <code>{preview.result.configPath}</code></p>
      <p>{preview.result.createsFile ? 'Creates a new file.' : preview.result.modifiesEntry ? 'Modifies existing NexusPilot entries.' : 'Adds NexusPilot entries.'} Unrelated settings and hooks are preserved.</p>
      <p>Backup: <code>{preview.result.backupPath ?? 'Not needed (new file)'}</code></p>
      <p>Events: {preview.result.events.join(', ')}</p>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{preview.result.command}</pre>
      <button type="button" className="btn-primary" disabled={busy} onClick={() => { void act(preview.action); }}>{preview.action === 'setup' ? 'Confirm setup' : 'Confirm removal'}</button>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => setPreview(null)}>Cancel</button>
    </div> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </article>;
}
