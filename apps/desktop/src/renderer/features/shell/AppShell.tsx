import type { ReactElement, ReactNode } from 'react';
import type { DashboardSnapshot, UiLocale, UpdateStatus } from '@nexuspilot/ipc-contracts';
import { createTranslator, type Translator } from '../../i18n/index.js';
import type { MessageKey } from '../../i18n/messages.js';

export type Screen = 'home' | 'projects' | 'tools' | 'git' | 'worklog' | 'live' | 'settings' | 'doctor';

interface AppShellProps {
  readonly locale: UiLocale;
  readonly appVersion: string;
  readonly hostPlatform: DashboardSnapshot['hostPlatform'];
  readonly mcpRunning: boolean;
  readonly desktopFullBypassOn: boolean;
  readonly stdioFullBypassOn: boolean;
  readonly updateStatus: UpdateStatus | null;
  readonly screen: Screen;
  readonly onNavigate: (screen: Screen) => void;
  readonly onLocaleChange: (locale: UiLocale) => void;
  readonly onUpdateAction: () => void;
  readonly children: ReactNode;
}

const localeItems: ReadonlyArray<{ readonly locale: UiLocale; readonly key: MessageKey }> = [
  { locale: 'th', key: 'language.th' },
  { locale: 'en', key: 'language.en' },
];

const navItems: ReadonlyArray<{ readonly screen: Screen; readonly key: MessageKey; readonly icon: string }> = [
  { screen: 'home', key: 'nav.home', icon: 'M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5z' },
  { screen: 'projects', key: 'nav.projects', icon: 'M3 6.5h7l2 2h9v10.75A1.75 1.75 0 0 1 19.25 21H4.75A1.75 1.75 0 0 1 3 19.25z' },
  { screen: 'tools', key: 'nav.tools', icon: 'M14.6 5.4a4 4 0 0 0-5.1 5.1L3.3 16.7a2.1 2.1 0 0 0 3 3l6.2-6.2a4 4 0 0 0 5.1-5.1l-2.7 2.7-2-2z' },
  { screen: 'git', key: 'nav.git', icon: 'M7 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4m0 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4m10-7a2 2 0 1 1 0 4 2 2 0 0 1 0-4M7 7v10m2-3h3a5 5 0 0 0 5-5V8' },
  { screen: 'worklog', key: 'nav.workLog', icon: 'M5 3h11l3 3v15H5zM8 9h8M8 13h8M8 17h5' },
  { screen: 'live', key: 'nav.live', icon: 'M4 18V9m5 9V5m5 13v-7m5 7V3' },
  { screen: 'settings', key: 'nav.settings', icon: 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6m8 3.8 1.3-2.1-2-3.4-2.5.1L15.5 4h-4L10 6.5l-2.6-.1-2 3.4L6.8 12l-1.3 2.1 2 3.4 2.5-.1 1.5 2.6h4l1.4-2.5 2.6.1 2-3.4z' },
  { screen: 'doctor', key: 'nav.doctor', icon: 'M4 12h4l2-5 4 10 2-5h4M5 4h14v16H5z' },
];

export function AppShell(props: AppShellProps): ReactElement {
  const t = createTranslator(props.locale);
  const platformLabel = desktopPlatformLabel();
  return (
    <div className="window-container" data-host-platform={props.hostPlatform}>
      <header className="custom-titlebar">
        <div className="titlebar-drag-region">
          <div className="titlebar-brand">
            <img src="./favicon.ico" alt="NexusPilot logo" className="titlebar-logo" />
            <span className="titlebar-title">{t('brand')}</span>
            <button
              type="button"
              className={`titlebar-version update-${props.updateStatus?.phase ?? 'idle'}`}
              onClick={props.onUpdateAction}
              title={props.updateStatus?.message ?? t('shell.checkUpdatesTitle')}
              aria-label={props.updateStatus?.canInstall === true
                ? t('shell.installUpdate', { version: props.updateStatus.availableVersion ?? '' })
                : t('shell.checkUpdates')}
              aria-busy={props.updateStatus?.phase === 'checking' || props.updateStatus?.phase === 'downloading'}
            >
              {versionBadgeText(props.appVersion, props.updateStatus, t)}
            </button>
          </div>

          <div className="titlebar-center">
            <div className="titlebar-status-indicator">
              <span className={`titlebar-dot ${props.mcpRunning ? 'active' : ''}`}></span>
              <span>{props.mcpRunning ? t('shell.mcpActive') : t('shell.mcpReady')}</span>
              {props.desktopFullBypassOn ? <strong className="pill-badge danger" role="status">{t('userConfig.desktopBypassOn')}</strong> : null}
              {props.stdioFullBypassOn ? <strong className="pill-badge danger" role="status">{t('userConfig.stdioBypassOn')}</strong> : null}
            </div>
          </div>
        </div>

        <div className="titlebar-actions">
          <div className="locale-switch" role="group" aria-label={t('settings.locale')}>
            {localeItems.map((item) => (
              <button
                key={item.locale}
                type="button"
                className={props.locale === item.locale ? 'active' : undefined}
                onClick={() => props.onLocaleChange(item.locale)}
              >
                {t(item.key)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main App Body */}
      <div className="app-shell">
        <aside className="sidebar" aria-label={t('shell.navigation')}>
          <div className="sidebar-brand">
            <strong>{t('brand')}</strong>
            <span>v{props.appVersion}</span>
          </div>
          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <button
                key={item.screen}
                type="button"
                className={props.screen === item.screen ? 'nav-item active' : 'nav-item'}
                onClick={() => props.onNavigate(item.screen)}
                aria-label={t(item.key)}
                title={t(item.key)}
                aria-current={props.screen === item.screen ? 'page' : undefined}
              >
                <svg className="nav-icon" aria-hidden="true" viewBox="0 0 24 24">
                  <path d={item.icon} />
                </svg>
                <span>{t(item.key)}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <span>Desktop Agent · {platformLabel}</span>
            <strong className={props.mcpRunning ? 'status-online' : 'status-offline'}>
              {props.mcpRunning ? t('footer.connected') : t('footer.disconnected')}
            </strong>
          </div>
        </aside>

        <div className="main-pane">
          <main className={`main-content screen-${props.screen}`}>{props.children}</main>
        </div>
      </div>
    </div>
  );
}
function desktopPlatformLabel(): string {
  if (typeof navigator === 'undefined') return 'Desktop';
  const platform = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (platform.includes('win')) return 'Windows';
  if (platform.includes('mac')) return 'macOS';
  if (platform.includes('linux')) return 'Linux';
  return 'Desktop';
}

function versionBadgeText(appVersion: string, status: UpdateStatus | null, t: Translator): string {
  if (status === null) return `v${appVersion}`;
  const next = status.availableVersion;
  if (status.phase === 'ready' && next !== null) return t('shell.updateReady', { version: next });
  if (status.phase === 'installing' && next !== null) return t('shell.updateInstalling', { version: next });
  if (status.phase === 'downloading') {
    const percent = status.progressPercent === null ? '' : ` ${Math.round(status.progressPercent)}%`;
    return `v${appVersion} ↓${percent}`;
  }
  if (status.phase === 'available' && next !== null) return `v${appVersion} → v${next}`;
  if (status.phase === 'checking') return t('shell.updateChecking', { version: appVersion });
  if (status.phase === 'error') return `v${appVersion} • !`;
  return `v${appVersion}`;
}
