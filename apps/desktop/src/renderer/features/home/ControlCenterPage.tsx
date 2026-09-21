import { useEffect, useState, type ReactElement } from 'react';
import type { DashboardSnapshot, IncidentClassification, UiLocale, WorkspaceSummary } from '@nexuspilot/ipc-contracts';
import { formatDateTime } from '../../date-time.js';
import { createTranslator } from '../../i18n/index.js';
import { tunnelRuntimeCredentialAvailable } from '../../tunnel-auth-readiness.js';
import { tunnelAuthPresentation } from '../../tunnel-auth-presentation.js';
import { settleWorkspaceAdd, type AddWorkspaceAction } from '../workspaces/workspace-add.js';
import { buildAgentTimeline, buildAgentTopology, filterAgentTimeline, filterAgentTopology, type AgentTimelineEvent, type AgentTopology } from './agent-monitor-view.js';

interface ControlCenterPageProps {
  readonly dashboard: DashboardSnapshot;
  readonly workspaces: readonly WorkspaceSummary[];
  readonly locale: UiLocale;
  readonly mcpBusy: boolean;
  readonly tunnelBusy: boolean;
  readonly onRefresh: () => Promise<void>;
  readonly onStopMcp: () => Promise<void>;
  readonly onRestartMcp: () => Promise<void>;
  readonly onSelectWorkspace: (workspaceId: string) => Promise<void>;
  readonly onSetWorkspaceActive: (workspaceId: string, active: boolean) => Promise<void>;
  readonly onAddWorkspace: AddWorkspaceAction;
  readonly onStartTunnel: () => Promise<void>;
  readonly onStopTunnel: () => Promise<void>;
  readonly onOpenTunnelSetup: () => void;
  readonly onCaptureIncident: () => Promise<void>;
  readonly incidentBusy: boolean;
  readonly incidentClassification: IncidentClassification | null;
  readonly incidentCapturedAt: string | null;
  readonly incidentNotice: string | null;
}

export function ControlCenterPage(props: ControlCenterPageProps): ReactElement {
  const t = createTranslator(props.locale);
  const { dashboard } = props;
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [projectPath, setProjectPath] = useState('');
  const [selectedId, setSelectedId] = useState(dashboard.selectedWorkspace?.id ?? '');
  const [projectBusyId, setProjectBusyId] = useState<string | null>(null);
  const [agentMonitorView, setAgentMonitorView] = useState<'overview' | 'topology' | 'timeline' | 'telemetry'>('overview');
  const [agentProviderFilter, setAgentProviderFilter] = useState<'all' | 'codex' | 'claude_code'>('all');
  const [agentWorkspaceFilter, setAgentWorkspaceFilter] = useState('all');
  const [agentStateFilter, setAgentStateFilter] = useState('all');
  const activeWorkspaceIds = new Set(dashboard.activeWorkspaces.map((workspace) => workspace.id));
  const activeProjects = props.workspaces.filter((workspace) => activeWorkspaceIds.has(workspace.id));
  const agentSwarms = dashboard.agentSwarms ?? [];
  const agentObservations = dashboard.agentObservations ?? [];
  const observedAgentProcesses = agentObservations.filter((observation) => observation.kind === 'managed_process');
  const activeAgentSwarms = agentSwarms.filter((swarm) => swarm.state === 'queued' || swarm.state === 'running');
  const monitoredTasks = agentSwarms.flatMap((swarm) => swarm.tasks);
  const runningAgentTasks = monitoredTasks.filter((task) => task.state === 'running').length;
  const blockedAgentTasks = monitoredTasks.filter((task) => task.state === 'blocked').length;
  const agentTopology = buildAgentTopology(dashboard);
  const agentTimeline = buildAgentTimeline(dashboard);
  const agentMonitorFilter = {
    ...(agentProviderFilter === 'all' ? {} : { provider: agentProviderFilter }),
    ...(agentWorkspaceFilter === 'all' ? {} : { workspaceId: agentWorkspaceFilter }),
    ...(agentStateFilter === 'all' ? {} : { state: agentStateFilter }),
  };
  const filteredAgentTopology = filterAgentTopology(agentTopology, agentMonitorFilter);
  const filteredAgentTimeline = filterAgentTimeline(agentTimeline, agentMonitorFilter);
  const tunnelCredentialAvailable = tunnelRuntimeCredentialAvailable(dashboard.tunnel);
  const tunnelPresentation = tunnelAuthPresentation(dashboard.tunnel);
  const remoteMcp = dashboard.remoteMcp ?? {
    state: 'stopped' as const, provider: 'ngrok' as const, installed: false, automaticInstallAvailable: false, automaticInstallMethod: null, hasAuthtoken: false, ngrokPath: null,
    localMcpUrl: dashboard.mcp.url, localGatewayUrl: null, publicMcpUrl: null, pairingCode: null, pairingCodeExpiresAt: null,
    oauthProtected: true, oauthConnected: false, pairingRequired: false, autoStartEnabled: false, message: null,
  };
  const remoteMcpOnline = remoteMcp.state === 'running';
  const [secureTunnelExpanded, setSecureTunnelExpanded] = useState(!remoteMcpOnline);

  useEffect(() => {
    setSecureTunnelExpanded(!remoteMcpOnline);
  }, [remoteMcpOnline]);

  useEffect(() => {
    setSelectedId(dashboard.selectedWorkspace?.id ?? '');
  }, [dashboard.selectedWorkspace?.id]);

  const agentLabel = dashboard.agentState === 'busy'
    ? t('agent.busy')
    : dashboard.agentState === 'idle'
      ? t('agent.ready')
      : t('agent.stopped');

  const tunnelMessage = dashboard.tunnel.state === 'starting' ? null : dashboard.tunnel.message;
  const tunnelMessageIsError = dashboard.tunnel.state === 'error';

  const tunnelLabel = dashboard.tunnel.state === 'running'
    ? dashboard.tunnel.source === 'external'
      ? (!tunnelCredentialAvailable || !dashboard.tunnel.profileExists ? t(tunnelPresentation.incompleteExternalKey) : t(tunnelPresentation.runningExternalKey))
      : t(tunnelPresentation.runningKey)
    : dashboard.tunnel.state === 'starting'
      ? t(tunnelPresentation.startingKey)
      : dashboard.tunnel.state === 'error'
        ? t(tunnelPresentation.errorKey)
        : t(tunnelPresentation.stoppedKey);

  const desktopBypassOn = dashboard.permissionProfile === 'full' && dashboard.settings?.desktopFullBypassAll === true;
  const stdioBypassOn = dashboard.stdioPermissionProfile === 'full' && dashboard.settings?.stdioFullBypassAll === true;
  const stdioBroad = dashboard.stdioPermissionProfile === 'full' && !dashboard.stdioStrictRoots;
  const broadAccess = dashboard.unrestricted || dashboard.allowAiDelete || stdioBroad || desktopBypassOn || stdioBypassOn;
  const onOff = (enabled: boolean): string => enabled ? t('security.enabled') : t('security.disabled');
  const workspaceScope = dashboard.stdioStrictRoots
    ? `${dashboard.stdioAllowedRoots.length} ${t('security.allowedRoots')}`
    : t('security.machineRoots');

  async function copyText(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    setCopyStatus(t('mcp.copied'));
  }

  async function changeProjectActive(workspaceId: string, active: boolean): Promise<void> {
    setProjectBusyId(workspaceId);
    try {
      await props.onSetWorkspaceActive(workspaceId, active);
    } finally {
      setProjectBusyId(null);
    }
  }

  async function addCurrentProject(): Promise<void> {
    setProjectPath(await settleWorkspaceAdd(projectPath, props.onAddWorkspace));
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h1>{t('home.title')}</h1>
          <p className="page-subtitle">{t('home.subtitle')}</p>
        </div>
        <div className="heading-actions">
          <button type="button" onClick={() => { void props.onRefresh(); }}>{t('action.refresh')}</button>
          <details className="agent-actions-menu">
            <summary aria-label={props.locale === 'th' ? 'จัดการ Desktop Agent' : 'Desktop Agent actions'}>•••</summary>
            <div className="agent-actions-popover">
              <button type="button" disabled={props.incidentBusy} onClick={() => { void props.onCaptureIncident(); }}>{t('live.captureIncident')}</button>
              <button type="button" disabled={props.mcpBusy || dashboard.selectedWorkspace === null} onClick={() => { void props.onRestartMcp(); }}>
                {props.locale === 'th' ? 'รีสตาร์ท Desktop Agent' : 'Restart Desktop Agent'}
              </button>
              <button type="button" disabled={props.mcpBusy || !dashboard.mcp.running} onClick={() => { void props.onStopMcp(); }}>
                {props.locale === 'th' ? 'หยุด Desktop Agent' : 'Stop Desktop Agent'}
              </button>
            </div>
          </details>
        </div>
      </div>
      {!props.incidentBusy && props.incidentNotice === null && props.incidentClassification === null ? null : <p role="status" className="hint">{props.incidentBusy ? t('live.incident.capturing') : props.incidentNotice ?? `${incidentLabel(t, props.incidentClassification!)} · ${formatDateTime(props.incidentCapturedAt, '—', props.locale)}`}</p>}

      <section className="panel agent-status-panel" aria-label={agentLabel}>
        <div className={`agent-orb ${dashboard.agentState}`} data-testid="agent-state" />
        <div>
          <strong data-testid="mcp-status">{agentLabel}</strong>
          <p>
            {t('agent.mode')}
            {dashboard.unrestricted ? ` • ${t('badge.unrestricted')}` : ''}
          </p>
        </div>
      </section>

      <section className="panel agent-monitor-panel" aria-label="Agent Monitor" data-testid="agent-monitor">
        <div className="agent-monitor-header">
          <div>
            <h2>Agent Monitor</h2>
            <p className="hint">{props.locale === 'th'
              ? 'ดู Agent swarm และ task dependency จากทุก client session บน NexusPilot เครื่องนี้ โดยไม่แสดง prompt หรือ result body'
              : 'Read-only swarm and task dependency view across client sessions on this NexusPilot host. Prompt and result bodies are never shown.'}</p>
          </div>
          <span className={`connection-count-chip ${activeAgentSwarms.length > 0 ? 'is-online' : ''}`}>
            {activeAgentSwarms.length} {props.locale === 'th' ? 'กำลังทำงาน' : 'active'}
          </span>
        </div>
        <div className="agent-monitor-tabs" role="tablist" aria-label={props.locale === 'th' ? 'มุมมอง Agent Monitor' : 'Agent Monitor views'}>
          {(['overview', 'topology', 'timeline', 'telemetry'] as const).map((view) => (
            <button
              type="button"
              role="tab"
              aria-selected={agentMonitorView === view}
              className={`agent-monitor-tab ${agentMonitorView === view ? 'is-active' : ''}`}
              key={view}
              onClick={() => setAgentMonitorView(view)}
            >
              {agentMonitorViewLabel(view, props.locale)}
            </button>
          ))}
        </div>
        <div className="agent-monitor-filters">
          <label>
            <span>{props.locale === 'th' ? 'Provider' : 'Provider'}</span>
            <select value={agentProviderFilter} onChange={(event) => setAgentProviderFilter(event.target.value as 'all' | 'codex' | 'claude_code')}>
              <option value="all">{props.locale === 'th' ? 'ทั้งหมด' : 'All'}</option>
              <option value="codex">Codex</option>
              <option value="claude_code">Claude Code</option>
            </select>
          </label>
          <label>
            <span>{props.locale === 'th' ? 'Workspace' : 'Workspace'}</span>
            <select value={agentWorkspaceFilter} onChange={(event) => setAgentWorkspaceFilter(event.target.value)}>
              <option value="all">{props.locale === 'th' ? 'ทั้งหมด' : 'All'}</option>
              {props.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.displayName}</option>)}
            </select>
          </label>
          <label>
            <span>{props.locale === 'th' ? 'สถานะ' : 'State'}</span>
            <select value={agentStateFilter} onChange={(event) => setAgentStateFilter(event.target.value)}>
              <option value="all">{props.locale === 'th' ? 'ทั้งหมด' : 'All'}</option>
              <option value="running">running</option>
              <option value="queued">queued</option>
              <option value="blocked">blocked</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="termination_unverified">termination unverified</option>
            </select>
          </label>
        </div>
        <div className="agent-monitor-metrics">
          <AgentMonitorMetric label={props.locale === 'th' ? 'Swarm ล่าสุด' : 'Recent swarms'} value={String(agentSwarms.length)} />
          <AgentMonitorMetric label={props.locale === 'th' ? 'Task กำลังรัน' : 'Running tasks'} value={String(runningAgentTasks)} active={runningAgentTasks > 0} />
          <AgentMonitorMetric label={props.locale === 'th' ? 'Task รอ dependency' : 'Blocked tasks'} value={String(blockedAgentTasks)} />
          <AgentMonitorMetric label={props.locale === 'th' ? 'Client sessions' : 'Client sessions'} value={String(new Set(agentSwarms.map((swarm) => `${swarm.ownerClientId}:${swarm.ownerSessionId}`)).size)} />
        </div>
        {agentSwarms.length === 0 ? (
          <div className="agent-monitor-empty">
            {props.locale === 'th' ? 'ยังไม่มี Agent swarm — เมื่อมีการ delegate งานผ่าน agent_swarm_run รายการจะขึ้นที่นี่' : 'No agent swarms yet. Delegated agent_swarm_run work will appear here.'}
          </div>
        ) : (
          <div className="agent-monitor-swarms">
            {agentSwarms.slice(0, 5).map((swarm) => {
              const workspace = props.workspaces.find((candidate) => candidate.id === swarm.workspaceId);
              return (
                <article className="agent-monitor-swarm" key={swarm.swarmId} data-swarm-state={swarm.state}>
                  <div className="agent-monitor-swarm-heading">
                    <div>
                      <strong>{workspace?.displayName ?? swarm.workspaceId}</strong>
                      <span>{shortAgentIdentity(swarm.ownerClientId, swarm.ownerSessionId)}</span>
                    </div>
                    <span className={`agent-monitor-state state-${swarm.state}`}>{swarm.state.replaceAll('_', ' ')}</span>
                  </div>
                  <div className="agent-monitor-task-graph" aria-label={props.locale === 'th' ? 'Task dependency graph' : 'Task dependency graph'}>
                    {swarm.tasks.map((task) => (
                      <div className={`agent-monitor-task task-${task.state}`} key={task.id}>
                        <div className="agent-monitor-task-main">
                          <strong>{task.id}</strong>
                          <span>{task.state.replaceAll('_', ' ')}</span>
                        </div>
                        <div className="agent-monitor-task-meta">
                          {task.dependsOn.length === 0
                            ? (props.locale === 'th' ? 'เริ่มได้ทันที' : 'root task')
                            : `${props.locale === 'th' ? 'รอ' : 'depends on'}: ${task.dependsOn.join(', ')}`}
                          {task.resultAvailable ? ` • ${props.locale === 'th' ? 'มีผลลัพธ์' : 'result ready'}` : ''}
                          {task.outputTruncated ? ' • truncated' : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="agent-monitor-workers">
          <div className="settings-mini-heading">
            <strong>{props.locale === 'th' ? 'Provider workers ที่ NexusPilot ติดตาม' : 'Provider workers tracked by NexusPilot'}</strong>
            <span>{observedAgentProcesses.length}</span>
          </div>
          {observedAgentProcesses.length === 0 ? (
            <p className="hint">{props.locale === 'th'
              ? 'ยังไม่มี Claude Code / Codex process ที่ถูกเริ่มและติดตามโดย NexusPilot'
              : 'No Claude Code or Codex process is currently owned and tracked by NexusPilot.'}</p>
          ) : (
            <div className="agent-monitor-worker-list">
              {observedAgentProcesses.map((worker) => {
                const workspace = props.workspaces.find((candidate) => candidate.id === worker.workspaceId);
                return (
                  <div className="agent-monitor-worker" key={worker.id}>
                    <span className={`agent-provider provider-${worker.provider}`}>{agentProviderLabel(worker.provider)}</span>
                    <strong>{worker.label}</strong>
                    <span>{workspace?.displayName ?? worker.workspaceId}</span>
                    <span>{worker.state.replaceAll('_', ' ')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {agentMonitorView === 'topology' ? (
          <AgentTopologyView
            topology={filteredAgentTopology}
            workspaces={props.workspaces}
            locale={props.locale}
          />
        ) : null}
        {agentMonitorView === 'timeline' ? (
          <AgentTimelineView
            timeline={filteredAgentTimeline}
            workspaces={props.workspaces}
            locale={props.locale}
          />
        ) : null}
        {agentMonitorView === 'telemetry' ? (
          <AgentTelemetryView telemetry={dashboard.agentTelemetry} locale={props.locale} />
        ) : null}
      </section>

      <section className={`panel security-overview ${broadAccess ? 'security-risk-broad' : 'security-risk-restricted'}`} aria-label={t('security.title')}>
        <div className="security-overview-header">
          <div>
            <h2>{t('security.title')}</h2>
            <p className="hint">{t('security.strictHint')}</p>
          </div>
          <span className={`security-summary-chip ${broadAccess ? 'broad' : 'restricted'}`} data-testid="security-summary">
            {broadAccess ? t('security.summaryBroad') : t('security.summaryRestricted')}
          </span>
        </div>
        <div className="security-overview-grid">
          <SecurityMetric label={t('security.desktopProfile')} value={dashboard.permissionProfile.toUpperCase()} />
          <SecurityMetric label="Desktop Full Bypass" value={desktopBypassOn ? 'FULL BYPASS ON' : 'OFF'} state={desktopBypassOn ? 'warn' : 'safe'} />
          <SecurityMetric label={t('security.stdioProfile')} value={dashboard.stdioPermissionProfile.toUpperCase()} />
          <SecurityMetric label="STDIO Full Bypass" value={stdioBypassOn ? 'FULL BYPASS ON' : 'OFF'} state={stdioBypassOn ? 'warn' : 'safe'} />
          <SecurityMetric label={t('security.strictRoots')} value={onOff(dashboard.stdioStrictRoots)} state={dashboard.stdioStrictRoots ? 'safe' : 'warn'} />
          <SecurityMetric label={t('security.aiDelete')} value={onOff(dashboard.allowAiDelete)} state={dashboard.allowAiDelete ? 'warn' : 'safe'} />
          <SecurityMetric label={t('security.unrestricted')} value={onOff(dashboard.unrestricted)} state={dashboard.unrestricted ? 'warn' : 'safe'} />
          <SecurityMetric label={t('security.workspaceScope')} value={workspaceScope} state={dashboard.stdioStrictRoots ? 'safe' : 'warn'} />
          <SecurityMetric label={t('security.tunnelAccess')} value={tunnelLabel} state={dashboard.tunnel.state === 'running' ? 'active' : 'neutral'} />
          <SecurityMetric label="Remote MCP OAuth" value={remoteMcp.state === 'running' ? 'ONLINE' : remoteMcp.oauthConnected ? (remoteMcp.autoStartEnabled ? 'LINKED · AUTO' : 'LINKED') : remoteMcp.installed && remoteMcp.hasAuthtoken ? 'READY' : 'SETUP'} state={remoteMcp.state === 'running' || remoteMcp.oauthConnected ? 'active' : 'neutral'} />
          <SecurityMetric label={t('security.registeredWorkspaces')} value={String(props.workspaces.length)} />
        </div>
        {stdioBroad ? <div className="security-warning" role="status">⚠ {t('security.warningBroad')}</div> : null}
      </section>

      <div className="home-grid">
        <section className="panel">
          <h2>{t('mcp.localUrl')}</h2>
          <code data-testid="mcp-endpoint" className="endpoint">
            {dashboard.connectionModes.httpUrl ?? '—'}
          </code>
          {dashboard.mcp.lastStartError === null || dashboard.mcp.lastStartError === undefined ? null : <p className="hint error-text" role="alert">MCP start error: {dashboard.mcp.lastStartError}</p>}
          <div className="inline-actions">
            <button
              type="button"
              disabled={dashboard.connectionModes.httpUrl === null}
              onClick={() => {
                if (dashboard.connectionModes.httpUrl !== null) void copyText(dashboard.connectionModes.httpUrl);
              }}
            >
              {t('mcp.copy')}
            </button>
            {copyStatus === null ? null : <span data-testid="mcp-copy-status" role="status">{copyStatus}</span>}
          </div>
          <p className="hint">{t('mcp.stdioCommand')}</p>
          <code className="endpoint">{dashboard.connectionModes.stdioCommand}</code>
        </section>

        <section className="panel chatgpt-connection-panel" aria-label={props.locale === 'th' ? 'การเชื่อมต่อ ChatGPT' : 'ChatGPT Connection'}>
          <div className="section-heading">
            <div>
              <h2>{props.locale === 'th' ? 'การเชื่อมต่อ ChatGPT' : 'ChatGPT Connection'}</h2>
              <p className="hint">{props.locale === 'th' ? 'ใช้ Remote MCP OAuth เป็นวิธีหลักสำหรับผู้ใช้ทั่วไป ส่วน Secure MCP Tunnel อยู่ในตัวเลือกขั้นสูงด้านล่าง' : 'Remote MCP OAuth is the primary connection for most users. Secure MCP Tunnel remains available below as an advanced option.'}</p>
            </div>
            <span className={`connection-count-chip ${remoteMcpOnline || dashboard.tunnel.state === 'running' ? 'is-online' : ''}`}>{remoteMcpOnline || dashboard.tunnel.state === 'running' ? (props.locale === 'th' ? 'เชื่อมต่ออยู่' : 'Connected') : (props.locale === 'th' ? 'ยังไม่เชื่อมต่อ' : 'Not connected')}</span>
          </div>

          <div className="home-remote-mcp-block chatgpt-primary-connection">
            <div className="settings-mini-heading"><strong>Remote MCP · OAuth</strong><span>{remoteMcp.state === 'running' ? 'ONLINE' : remoteMcp.oauthConnected ? (remoteMcp.autoStartEnabled ? 'LINKED · AUTO' : 'LINKED') : remoteMcp.state.toUpperCase()}</span></div>
            <code className="endpoint">{remoteMcp.publicMcpUrl ?? '—'}</code>
            <div className="inline-actions">
              <button type="button" disabled={remoteMcp.publicMcpUrl === null} onClick={() => { if (remoteMcp.publicMcpUrl !== null) void copyText(remoteMcp.publicMcpUrl); }}>{props.locale === 'th' ? 'Copy Public /mcp' : 'Copy public /mcp'}</button>
              <button type="button" onClick={props.onOpenTunnelSetup}>{props.locale === 'th' ? 'ตั้งค่า ChatGPT' : 'Configure ChatGPT'}</button>
            </div>
            {remoteMcp.oauthConnected ? <div className="home-remote-mcp-status is-connected">{props.locale === 'th' ? (remoteMcp.autoStartEnabled ? '✓ ChatGPT เชื่อมแล้ว · Remote MCP จะ Start อัตโนมัติเมื่อเปิด NexusPilot' : '✓ ChatGPT เชื่อมแล้ว · การอนุญาตถูกจำไว้ แต่ Auto-start ปิดอยู่') : (remoteMcp.autoStartEnabled ? '✓ ChatGPT connected · Remote MCP will auto-start with NexusPilot.' : '✓ ChatGPT connected · authorization is remembered, but auto-start is off.')}</div> : null}
            {remoteMcp.pairingCode === null ? null : <div className="home-remote-mcp-status is-pairing"><strong className="remote-mcp-pairing-line"><span>{props.locale === 'th' ? 'PIN สำรอง OAuth client อื่น' : 'Fallback PIN for another OAuth client'}:</span><span className="remote-mcp-pairing-pin" aria-label={`${props.locale === 'th' ? 'Fallback pairing PIN' : 'Fallback pairing PIN'} ${remoteMcp.pairingCode}`}>{remoteMcp.pairingCode}</span></strong></div>}
          </div>

          <details
            className={`connection-method-stack home-connection-method chatgpt-advanced-connection ${remoteMcpOnline ? 'is-secondary' : ''}`}
            open={secureTunnelExpanded}
            onToggle={(event) => setSecureTunnelExpanded(event.currentTarget.open)}
          >
            <summary className="connection-method-summary">
              <div className="connection-method-summary-copy">
                <span className="connection-method-kicker">{props.locale === 'th' ? 'ตัวเลือกขั้นสูง' : 'Advanced option'}</span>
                <strong>{t(tunnelPresentation.titleKey)}</strong>
                <span>{props.locale === 'th' ? 'ใช้เมื่อองค์กรหรือการตั้งค่าของคุณต้องการ Secure MCP Tunnel โดยเฉพาะ' : 'Use only when your organization or setup specifically requires Secure MCP Tunnel.'}</span>
              </div>
              <div className="connection-method-summary-status">
                <span className={`connection-method-live-dot ${dashboard.tunnel.state === 'running' ? 'is-online' : ''}`} aria-hidden="true" />
                <span>{tunnelLabel}</span>
                <span className="connection-method-chevron" aria-hidden="true">⌄</span>
              </div>
            </summary>
            <div className="connection-method-panel chatgpt-tunnel-panel">
              <p data-testid="tunnel-status">{tunnelLabel}</p>
              {tunnelPresentation.isOAuth && dashboard.tunnel.auth?.accountLabel ? <p className="hint">{props.locale === 'th' ? 'บัญชี OAuth' : 'OAuth account'}: {dashboard.tunnel.auth.accountLabel}</p> : null}
              {tunnelMessage ? <p className={tunnelMessageIsError ? 'hint error-text' : 'hint'} role={tunnelMessageIsError ? 'alert' : undefined}>{tunnelMessage}</p> : null}
              {!tunnelCredentialAvailable ? <p className="hint">{t(tunnelPresentation.needCredentialKey)}</p> : null}
              {!dashboard.tunnel.profileExists ? <p className="hint">{t('tunnel.needProfile')}</p> : null}
              {tunnelCredentialAvailable && dashboard.tunnel.profileExists ? null : (
                <div className="guided-tunnel-home-entry">
                  <p className="hint">{tunnelPresentation.isOAuth ? (props.locale === 'th' ? 'ตรวจ OAuth session และการเชื่อมต่อในหน้าตั้งค่า' : 'Review the OAuth session and connection in Settings.') : t('guidedTunnel.dismissedHint')}</p>
                  <button type="button" className="btn-save-gold" onClick={props.onOpenTunnelSetup}>{tunnelPresentation.isOAuth ? (props.locale === 'th' ? 'เปิดการตั้งค่าการเชื่อมต่อ' : 'Open connection settings') : t('guidedTunnel.openGuide')}</button>
                </div>
              )}
              <div className="inline-actions">
                <button type="button" disabled={props.tunnelBusy || !tunnelCredentialAvailable || dashboard.tunnel.state === 'running'} onClick={() => { void props.onStartTunnel(); }}>
                  {t(tunnelPresentation.startKey)}
                </button>
                <button type="button" disabled={props.tunnelBusy || dashboard.tunnel.state === 'stopped'} onClick={() => { void props.onStopTunnel(); }}>
                  {t(tunnelPresentation.stopKey)}
                </button>
              </div>
            </div>
          </details>
        </section>
      </div>

      <div className="home-grid">
        <section className="panel active-projects-panel">
          <div className="project-picker-heading">
            <div>
              <h2>{props.locale === 'th' ? 'โปรเจกต์ที่ใช้งานพร้อมกัน' : 'Active Projects'}</h2>
              <p className="hint">{props.locale === 'th' ? 'เลือกหลายโปรเจกต์สำหรับหลายแชทได้พร้อมกัน โดยโปรเจกต์หลัก (Primary) จะใช้เมื่อ tool call ไม่ได้ระบุ workspaceId' : 'Enable multiple projects for parallel chats. Primary is used only when a tool call does not specify workspaceId.'}</p>
            </div>
            <span className="active-project-count">{dashboard.activeWorkspaces.length}/{props.workspaces.length} {props.locale === 'th' ? 'กำลังใช้งาน' : 'active'}</span>
          </div>

          {props.workspaces.length === 0 ? (
            <div className="active-project-empty">{props.locale === 'th' ? 'ยังไม่มีโปรเจกต์ เพิ่มโฟลเดอร์โปรเจกต์ด้านล่างเพื่อเริ่มใช้งาน' : 'No projects yet. Add a project folder below to get started.'}</div>
          ) : (
            <div className="active-project-picker" role="group" aria-label={props.locale === 'th' ? 'โปรเจกต์ที่ใช้งานพร้อมกัน' : 'Active projects'}>
              {props.workspaces.map((workspace) => {
                const active = activeWorkspaceIds.has(workspace.id);
                const primary = dashboard.selectedWorkspace?.id === workspace.id;
                const lastActive = active && dashboard.activeWorkspaces.length <= 1;
                const busy = projectBusyId !== null;
                const title = lastActive
                  ? (props.locale === 'th' ? 'ต้องมี Active Project อย่างน้อย 1 โปรเจกต์' : 'At least one Active Project is required')
                  : workspace.realRootPath;
                return (
                  <label
                    key={workspace.id}
                    className={`active-project-option ${active ? 'is-active' : ''} ${primary ? 'is-primary' : ''} ${lastActive ? 'is-locked' : ''}`}
                    title={title}
                  >
                    <input
                      className="active-project-checkbox"
                      type="checkbox"
                      checked={active}
                      disabled={busy || lastActive}
                      onChange={(event) => { void changeProjectActive(workspace.id, event.target.checked); }}
                    />
                    <span className="active-project-check" aria-hidden="true">{active ? '✓' : ''}</span>
                    <span className="active-project-copy">
                      <strong>{workspace.displayName}</strong>
                      <small>{workspace.realRootPath}</small>
                    </span>
                    <span className="active-project-state">
                      {primary ? <em className="primary-project-badge">PRIMARY</em> : active ? <em className="active-project-badge">ACTIVE</em> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="primary-project-control">
            <div className="primary-project-copy">
              <strong>{props.locale === 'th' ? 'โปรเจกต์หลัก (Primary)' : 'Primary project'}</strong>
              <small>{props.locale === 'th' ? 'ใช้เป็นค่าเริ่มต้นเท่านั้น โปรเจกต์อื่นที่เปิด Active ยังทำงานพร้อมกันได้' : 'Used only as the default; other active projects remain available in parallel.'}</small>
            </div>
            <div className="form-row primary-project-row">
              <select
                aria-label={props.locale === 'th' ? 'โปรเจกต์หลัก' : 'Primary project'}
                value={selectedId}
                disabled={activeProjects.length === 0}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {activeProjects.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.displayName}</option>)}
              </select>
              <button type="button" disabled={selectedId.length === 0 || selectedId === dashboard.selectedWorkspace?.id} onClick={() => { void props.onSelectWorkspace(selectedId); }}>
                {t('project.setMain')}
              </button>
            </div>
          </div>

          <div className="add-project-control">
            <label className="field-label" htmlFor="add-project-path">{t('project.add')}</label>
            <p className="hint">{t('project.addHint')}</p>
            <div className="form-row">
              <input
                id="add-project-path"
                value={projectPath}
                onChange={(event) => setProjectPath(event.target.value)}
                placeholder="D:\\projects\\app"
              />
              <button
                type="button"
                disabled={projectPath.trim().length === 0}
                onClick={() => { void addCurrentProject(); }}
              >
                {t('project.add')}
              </button>
            </div>
          </div>
        </section>

        <section className="info-cards" aria-label="Status cards">
          <article className="info-card">
            <p>{t('info.workspace')}</p>
            <strong data-testid="workspace-real-root">{dashboard.selectedWorkspace?.realRootPath ?? '—'}</strong>
          </article>
          <article className="info-card">
            <p>{t('info.activeProject')}</p>
            <strong>{dashboard.activeWorkspaces.length === 0 ? '—' : dashboard.activeWorkspaces.map((workspace) => workspace.displayName).join(', ')}</strong>
            <span data-testid="workspace-id" hidden>{dashboard.selectedWorkspace?.id ?? ''}</span>
          </article>
        </section>
      </div>

    </div>
  );
}

function agentMonitorViewLabel(view: 'overview' | 'topology' | 'timeline' | 'telemetry', locale: UiLocale): string {
  if (view === 'overview') return locale === 'th' ? 'ภาพรวม' : 'Overview';
  if (view === 'topology') return 'Topology';
  if (view === 'timeline') return 'Timeline';
  return 'Telemetry';
}

function AgentTelemetryView(props: {
  readonly telemetry: DashboardSnapshot['agentTelemetry'];
  readonly locale: UiLocale;
}): ReactElement {
  const telemetry = props.telemetry;
  if (telemetry === undefined) {
    return <div className="agent-monitor-detail agent-monitor-empty" data-testid="agent-telemetry">{props.locale === 'th' ? 'ยังไม่มีข้อมูล telemetry' : 'Telemetry is not available yet.'}</div>;
  }
  return (
    <div className="agent-monitor-detail agent-telemetry-view" data-testid="agent-telemetry">
      <div className="settings-mini-heading">
        <strong>{props.locale === 'th' ? 'Telemetry ที่วัดได้จริง' : 'Measured telemetry'}</strong>
        <span>{telemetry.mcpCalls} MCP calls</span>
      </div>
      <div className="agent-telemetry-grid">
        <AgentMonitorMetric label="MCP calls" value={String(telemetry.mcpCalls)} active={telemetry.activeCalls > 0} />
        <AgentMonitorMetric label={props.locale === 'th' ? 'สำเร็จ' : 'Successes'} value={String(telemetry.successes)} />
        <AgentMonitorMetric label={props.locale === 'th' ? 'ผิดพลาด' : 'Errors'} value={String(telemetry.errors)} />
        <AgentMonitorMetric label="P95 latency" value={formatDurationMs(telemetry.p95LatencyMs)} />
        <AgentMonitorMetric label={props.locale === 'th' ? 'Agent task avg' : 'Agent task avg'} value={formatDurationMs(telemetry.agentTaskDuration.averageMs)} />
        <AgentMonitorMetric label={props.locale === 'th' ? 'Provider process avg' : 'Provider process avg'} value={formatDurationMs(telemetry.providerProcessDuration.averageMs)} />
        <AgentMonitorMetric label="Task lifecycle calls" value={String(telemetry.taskLifecycleCalls)} />
        <AgentMonitorMetric label="Deterministic route / dry-run" value={`${telemetry.deterministicRouteCalls} / ${telemetry.dedicatedDryRunCalls}`} />
      </div>
      <div className="agent-telemetry-tools">
        <div className="settings-mini-heading">
          <strong>{props.locale === 'th' ? 'Tools ที่ถูกเรียกมากสุด' : 'Top tools'}</strong>
          <span>{telemetry.topTools.length}</span>
        </div>
        {telemetry.topTools.length === 0 ? (
          <p className="hint">{props.locale === 'th' ? 'ยังไม่มี tool telemetry' : 'No tool telemetry yet.'}</p>
        ) : (
          telemetry.topTools.map((tool) => (
            <div className="agent-telemetry-tool" key={tool.toolName}>
              <code>{tool.toolName}</code>
              <span>{tool.calls} calls</span>
              <span>{tool.errors} errors</span>
              <span>P95 {formatDurationMs(tool.p95LatencyMs)}</span>
            </div>
          ))
        )}
      </div>
      <p className="hint">{props.locale === 'th'
        ? 'ยังไม่แสดง token/context usage จนกว่าจะมีข้อมูลจาก provider ที่เชื่อถือได้'
        : 'Token/context usage stays hidden until an authoritative provider source is available.'}</p>
    </div>
  );
}

function formatDurationMs(value: number): string {
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

function AgentTopologyView(props: {
  readonly topology: AgentTopology;
  readonly workspaces: readonly WorkspaceSummary[];
  readonly locale: UiLocale;
}): ReactElement {
  const labelById = new Map(props.topology.nodes.map((node) => [node.id, node.label]));
  const dependencyEdges = props.topology.edges.filter((edge) => edge.kind === 'dependency' || edge.kind === 'parent');
  return (
    <div className="agent-monitor-detail agent-topology-view" data-testid="agent-topology">
      <div className="settings-mini-heading">
        <strong>{props.locale === 'th' ? 'โครงสร้าง Agent / Task' : 'Agent / Task topology'}</strong>
        <span>{props.topology.nodes.length} nodes · {dependencyEdges.length} edges</span>
      </div>
      {props.topology.nodes.length === 0 ? (
        <p className="hint">{props.locale === 'th' ? 'ยังไม่มี topology ให้แสดง' : 'No topology is available yet.'}</p>
      ) : (
        <div className="agent-topology-grid">
          {props.topology.nodes.slice(0, 30).map((node) => (
            <article className={`agent-topology-node node-${node.kind} state-${node.state}`} key={node.id}>
              <div className="agent-monitor-task-main">
                <strong>{node.label}</strong>
                <span>{node.state.replaceAll('_', ' ')}</span>
              </div>
              <div className="agent-monitor-task-meta">
                {agentProviderLabel(node.provider)} · {workspaceDisplayName(props.workspaces, node.workspaceId)}
              </div>
              {node.parentId === undefined ? null : (
                <div className="agent-monitor-task-meta">
                  ↳ {props.locale === 'th' ? 'อยู่ใต้' : 'parent'}: {labelById.get(node.parentId) ?? node.parentId}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {dependencyEdges.length === 0 ? null : (
        <div className="agent-topology-edges">
          {dependencyEdges.slice(0, 40).map((edge, index) => (
            <div className="agent-topology-edge" key={`${edge.kind}:${edge.from}:${edge.to}:${index}`}>
              <span>{edge.kind === 'dependency' ? (props.locale === 'th' ? 'dependency' : 'depends') : 'parent'}</span>
              <strong>{labelById.get(edge.from) ?? edge.from}</strong>
              <span>→</span>
              <strong>{labelById.get(edge.to) ?? edge.to}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentTimelineView(props: {
  readonly timeline: readonly AgentTimelineEvent[];
  readonly workspaces: readonly WorkspaceSummary[];
  readonly locale: UiLocale;
}): ReactElement {
  return (
    <div className="agent-monitor-detail agent-timeline-view" data-testid="agent-timeline">
      <div className="settings-mini-heading">
        <strong>{props.locale === 'th' ? 'Timeline ล่าสุด' : 'Recent timeline'}</strong>
        <span>{props.timeline.length}</span>
      </div>
      {props.timeline.length === 0 ? (
        <p className="hint">{props.locale === 'th' ? 'ยังไม่มี event ที่มี timestamp' : 'No timestamped agent events yet.'}</p>
      ) : (
        <div className="agent-timeline-list">
          {props.timeline.slice(0, 30).map((event) => (
            <div className="agent-timeline-row" key={event.id}>
              <time dateTime={event.timestamp}>{formatDateTime(event.timestamp, '—', props.locale)}</time>
              <span className={`agent-provider provider-${event.provider}`}>{agentProviderLabel(event.provider)}</span>
              <strong>{event.label}</strong>
              <span>{event.event}</span>
              <span>{event.state.replaceAll('_', ' ')}</span>
              <span>{workspaceDisplayName(props.workspaces, event.workspaceId)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function workspaceDisplayName(workspaces: readonly WorkspaceSummary[], workspaceId: string): string {
  return workspaces.find((workspace) => workspace.id === workspaceId)?.displayName ?? workspaceId;
}

function AgentMonitorMetric(props: { readonly label: string; readonly value: string; readonly active?: boolean }): ReactElement {
  return (
    <article className={`agent-monitor-metric ${props.active === true ? 'is-active' : ''}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function agentProviderLabel(provider: NonNullable<DashboardSnapshot['agentObservations']>[number]['provider']): string {
  if (provider === 'claude_code') return 'CLAUDE CODE';
  if (provider === 'codex') return 'CODEX';
  return 'PROCESS';
}

function shortAgentIdentity(clientId: string, sessionId: string): string {
  const shortSession = sessionId.length > 12 ? `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}` : sessionId;
  return `${clientId} · ${shortSession}`;
}

function SecurityMetric(props: { readonly label: string; readonly value: string; readonly state?: 'safe' | 'warn' | 'active' | 'neutral' }): ReactElement {
  return (
    <article className={`security-metric ${props.state ?? 'neutral'}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function incidentLabel(t: ReturnType<typeof createTranslator>, classification: IncidentClassification): string {
  if (classification === 'local_tool_failed') return t('live.incident.localToolFailed');
  if (classification === 'tunnel_disconnected') return t('live.incident.tunnelDisconnected');
  if (classification === 'remote_turn_stopped') return t('live.incident.remoteTurnStopped');
  return t('live.incident.healthyOrInconclusive');
}
