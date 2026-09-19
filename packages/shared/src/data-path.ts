import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readCompatEnv } from './compat-env.js';

export interface DataPathEnvironment {
  readonly [key: string]: string | undefined;
  readonly NEXUSPILOT_DATA_PATH?: string;
  readonly LNWJUD_DATA_PATH?: string;
  readonly APPDATA?: string;
  readonly USERPROFILE?: string;
  readonly HOME?: string;
  readonly XDG_DATA_HOME?: string;
}

/** Resolve the per-user lnwjud data directory without embedding a developer profile path. */
export function resolveLnwjudDataPath(
  environment: DataPathEnvironment = process.env,
  electronAppData?: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const configured = absolutePathOrUndefined(readCompatEnv('DATA_PATH', environment).value, pathApi);
  if (configured !== undefined) return configured;

  const home = absolutePathOrUndefined(environment.HOME, pathApi)
    ?? absolutePathOrUndefined(os.homedir(), pathApi);
  if (platform === 'win32') {
    const appData = firstAbsolutePath(
      pathApi,
      environment.APPDATA,
      electronAppData,
      environment.USERPROFILE ? pathApi.join(environment.USERPROFILE, 'AppData', 'Roaming') : undefined,
      home ? pathApi.join(home, 'AppData', 'Roaming') : undefined,
      pathApi.join(os.homedir(), 'AppData', 'Roaming'),
    );
    return pathApi.join(appData, 'lnwjud');
  }

  if (platform === 'darwin') {
    const appData = firstAbsolutePath(
      pathApi,
      electronAppData,
      home ? pathApi.join(home, 'Library', 'Application Support') : undefined,
      pathApi.join(os.homedir(), 'Library', 'Application Support'),
    );
    return pathApi.join(appData, 'lnwjud');
  }

  const appData = firstAbsolutePath(
    pathApi,
    electronAppData,
    environment.XDG_DATA_HOME,
    home ? pathApi.join(home, '.local', 'share') : undefined,
    pathApi.join(os.homedir(), '.local', 'share'),
  );
  return pathApi.join(appData, 'lnwjud');
}

function absolutePathOrUndefined(value: string | undefined, pathApi: typeof path.win32 | typeof path.posix): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0 || !pathApi.isAbsolute(trimmed)) return undefined;
  return pathApi.normalize(trimmed);
}

function firstAbsolutePath(pathApi: typeof path.win32 | typeof path.posix, ...values: readonly (string | undefined)[]): string {
  for (const value of values) {
    const absolute = absolutePathOrUndefined(value, pathApi);
    if (absolute !== undefined) return absolute;
  }
  throw new Error('Unable to resolve an absolute lnwjud data directory');
}
export interface DataPathSelection {
  readonly selected: string;
  readonly canonical: string;
  readonly legacy: string;
  readonly source: 'explicit' | 'canonical-existing' | 'legacy-existing' | 'canonical-new';
}

/**
 * Resolve the NexusPilot data directory without copying state automatically.
 *
 * Explicit NEXUSPILOT_DATA_PATH / LNWJUD_DATA_PATH wins first.
 * Otherwise:
 * - use canonical nexuspilot state when it already exists,
 * - fall back to legacy lnwjud state when only that exists,
 * - use canonical nexuspilot for a fresh install.
 */
export function resolveNexusPilotDataPath(
  environment: DataPathEnvironment = process.env,
  electronAppData?: string,
  platform: NodeJS.Platform = process.platform,
  pathExists: (candidate: string) => boolean = existsSync,
): string {
  return selectNexusPilotDataPath(environment, electronAppData, platform, pathExists).selected;
}
export function selectNexusPilotDataPath(
  environment: DataPathEnvironment = process.env,
  electronAppData?: string,
  platform: NodeJS.Platform = process.platform,
  pathExists: (candidate: string) => boolean = existsSync,
): DataPathSelection {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const configured = absolutePathOrUndefined(readCompatEnv('DATA_PATH', environment).value, pathApi);
  const { canonical, legacy } = defaultDataPathCandidates(environment, electronAppData, platform);

  if (configured !== undefined) {
    return { selected: configured, canonical, legacy, source: 'explicit' };
  }
  if (pathExists(canonical)) {
    return { selected: canonical, canonical, legacy, source: 'canonical-existing' };
  }
  if (pathExists(legacy)) {
    return { selected: legacy, canonical, legacy, source: 'legacy-existing' };
  }
  return { selected: canonical, canonical, legacy, source: 'canonical-new' };
}

function defaultDataPathCandidates(
  environment: DataPathEnvironment,
  electronAppData: string | undefined,
  platform: NodeJS.Platform,
): { canonical: string; legacy: string } {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const home = absolutePathOrUndefined(environment.HOME, pathApi)
    ?? absolutePathOrUndefined(os.homedir(), pathApi);

  if (platform === 'win32') {
    const appData = firstAbsolutePath(
      pathApi,
      environment.APPDATA,
      electronAppData,
      environment.USERPROFILE ? pathApi.join(environment.USERPROFILE, 'AppData', 'Roaming') : undefined,
      home ? pathApi.join(home, 'AppData', 'Roaming') : undefined,
      pathApi.join(os.homedir(), 'AppData', 'Roaming'),
    );
    return {
      canonical: pathApi.join(appData, 'nexuspilot'),
      legacy: pathApi.join(appData, 'lnwjud'),
    };
  }

  if (platform === 'darwin') {
    const appData = firstAbsolutePath(
      pathApi,
      electronAppData,
      home ? pathApi.join(home, 'Library', 'Application Support') : undefined,
      pathApi.join(os.homedir(), 'Library', 'Application Support'),
    );
    return {
      canonical: pathApi.join(appData, 'nexuspilot'),
      legacy: pathApi.join(appData, 'lnwjud'),
    };
  }
  const appData = firstAbsolutePath(
    pathApi,
    electronAppData,
    environment.XDG_DATA_HOME,
    home ? pathApi.join(home, '.local', 'share') : undefined,
    pathApi.join(os.homedir(), '.local', 'share'),
  );
  return {
    canonical: pathApi.join(appData, 'nexuspilot'),
    legacy: pathApi.join(appData, 'lnwjud'),
  };
}
