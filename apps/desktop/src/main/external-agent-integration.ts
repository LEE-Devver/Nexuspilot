import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ExternalAgentIntegrationRequest, ExternalAgentIntegrationResult, ExternalAgentProvider } from '@nexuspilot/ipc-contracts';

const EVENTS = ['SessionStart', 'SessionEnd', 'SubagentStart', 'SubagentStop', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];
const MARKER = '--nexuspilot-integration=v1';
type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }

/** Only the trusted Desktop host calls this service. No public MCP mutations. */
export class ExternalAgentIntegrationService {
  public constructor(private readonly hookPath: string, private readonly options: {
    home?: string; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform;
  } = {}) {}

  public execute(request: ExternalAgentIntegrationRequest): ExternalAgentIntegrationResult {
    const provider = request.provider;
    const events = provider === 'codex' ? [...EVENTS, 'Interrupt'] : [...EVENTS];
    const env = this.options.env ?? process.env;
    const home = this.options.home ?? homedir();
    const directory = provider === 'codex' ? env.CODEX_HOME ?? path.join(home, '.codex') : env.CLAUDE_CONFIG_DIR ?? path.join(home, '.claude');
    const configPath = path.join(directory, provider === 'codex' ? 'hooks.json' : 'settings.json');
    const command = `node ${quote(this.hookPath)} --provider=${provider} ${MARKER}`;
    const base: ExternalAgentIntegrationResult = {
      provider, status: 'unavailable', configPath, command, events, revision: '',
      createsFile: false, modifiesEntry: false, changes: false, backupPath: null,
      message: provider === 'codex'
        ? 'Requires a Codex version with command hooks. Review and trust the hooks in Codex; restart the provider after setup. Configured verifies this file only.'
        : 'Requires Claude Code command hooks. Restart the provider after setup. Configured verifies this file only; managed policy or disableAllHooks may prevent execution.',
    };
    try {
      if ((this.options.platform ?? process.platform) === 'win32') throw new Error('Automatic handoff is unavailable on Windows until a user-restricted named pipe is supported. Explicit session environment variables remain supported.');
      if (!path.isAbsolute(directory) || !path.isAbsolute(this.hookPath)) throw new Error('Configuration and hook locations must be absolute');
      if (!existsSync(this.hookPath) || !lstatSync(this.hookPath).isFile()) throw new Error('NexusPilot hook adapter is unavailable at this installation path');
      assertSafeAncestors(directory);
      const source = readConfig(configPath);
      const raw = source ?? '{}';
      const parsed: unknown = JSON.parse(raw);
      if (!record(parsed)) throw new Error('Configuration must be a JSON object');
      const span = hooksSpan(raw); // Also rejects duplicate keys instead of silently discarding them.
      if (parsed.hooks !== undefined && !record(parsed.hooks)) throw new Error('hooks must be an object');
      const hooks = (parsed.hooks ?? {}) as RecordValue;
      const cleaned: RecordValue = { ...hooks };
      let ownedCount = 0;
      let exactCount = 0;
      const expectedHandler = { type: 'command', command, async: true, timeout: 3 };
      for (const [event, groups] of Object.entries(hooks)) {
        if (!Array.isArray(groups)) throw new Error(`Invalid hook groups for ${event}`);
        const kept: unknown[] = [];
        for (const group of groups) {
          if (!record(group) || !Array.isArray(group.hooks) || group.hooks.some((handler) => !record(handler))) throw new Error(`Invalid hook handlers for ${event}`);
          const handlers = group.hooks;
          const remaining = handlers.filter((handler: RecordValue) => {
            if (!isOwned(handler, provider)) return true;
            ownedCount++;
            if (events.includes(event) && groups.filter((g) => record(g) && Array.isArray(g.hooks) && g.hooks.some((h: RecordValue) => isOwned(h, provider))).length === 1
              && Object.keys(group).length === 1 && handlers.length === 1 && equalRecord(handler, expectedHandler)) exactCount++;
            return false;
          });
          if (remaining.length === group.hooks.length) kept.push(group);
          else if (remaining.length > 0) kept.push({ ...group, hooks: remaining });
        }
        if (kept.length) cleaned[event] = kept;
        else if (groups.length > 0) delete cleaned[event];
      }
      const configured = ownedCount === events.length && exactCount === events.length && parsed.disableAllHooks !== true;
      const status = configured ? 'configured' : ownedCount > 0 ? 'differs' : 'not_configured';
      const remove = request.action === 'remove' || request.action === 'preview_remove';
      if (!remove) for (const event of events) cleaned[event] = [...(cleaned[event] as unknown[] | undefined ?? []), { hooks: [expectedHandler] }];
      const changes = remove ? ownedCount > 0 : !configured;
      if ((request.action === 'setup' || request.action === 'preview_setup') && parsed.disableAllHooks === true) throw new Error('Provider disableAllHooks is enabled. Change that setting yourself before installing monitoring hooks.');
      const revision = createHash('sha256').update(raw).update(command).digest('hex');
      const backupPath = source !== null && changes ? `${configPath}.nexuspilot-${revision.slice(0, 16)}.bak` : null;
      const result: ExternalAgentIntegrationResult = { ...base, status, revision, changes,
        createsFile: source === null && changes, modifiesEntry: ownedCount > 0 && changes, backupPath };
      if (request.action === 'inspect' || request.action.startsWith('preview_') || !changes) return result;
      if (request.expectedRevision !== revision) throw new Error('Configuration changed since preview. Refresh the preview before applying.');
      const next = patchHooks(raw, span, cleaned);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      assertSafeAncestors(directory);
      const lockPath = `${configPath}.nexuspilot.lock`;
      const lock = openSync(lockPath, 'wx', 0o600);
      const temp = `${lockPath}.tmp`;
      try {
        if (readConfig(configPath) !== source) throw new Error('Configuration changed during setup; retry after preview');
        if (backupPath !== null) {
          if (existsSync(backupPath)) {
            if (readConfig(backupPath) !== source) throw new Error('Backup already exists with different content');
          } else writeFileSync(backupPath, raw, { flag: 'wx', mode: 0o600 });
        }
        writeFileSync(temp, next, { flag: 'wx', mode: 0o600 });
        if (readConfig(configPath) !== source) throw new Error('Configuration changed during setup; original preserved');
        renameSync(temp, configPath);
      } finally {
        if (existsSync(temp)) unlinkSync(temp);
        closeSync(lock);
        unlinkSync(lockPath);
      }
      const verified = this.execute({ provider, action: 'inspect' });
      if (verified.status !== (remove ? 'not_configured' : 'configured')) throw new Error('Written integration could not be verified; use the backup to review');
      return { ...verified, backupPath, changes: true, createsFile: result.createsFile, modifiesEntry: result.modifiesEntry };
    } catch (error) {
      // Do not echo parser errors: newer JSON.parse errors can include secret-bearing source text.
      return { ...base, message: error instanceof SyntaxError ? 'Invalid or ambiguous JSON. Configuration was not changed; repair it and retry.'
        : error instanceof Error ? error.message : 'Unable to access provider configuration' };
    }
  }
}

function equalRecord(a: RecordValue, b: RecordValue): boolean {
  return Object.keys(a).length === Object.keys(b).length && Object.entries(b).every(([key, value]) => a[key] === value);
}
function isOwned(handler: RecordValue, provider: ExternalAgentProvider): boolean {
  // A dedicated argv marker survives repository moves. Do not adopt unmarked manual hooks.
  return handler.type === 'command' && typeof handler.command === 'string'
    && handler.command.startsWith('node ') && handler.command.endsWith(` --provider=${provider} ${MARKER}`);
}
function assertSafeAncestors(directory: string): void {
  let current = directory;
  while (current !== path.dirname(current)) {
    try {
      const info = lstatSync(current);
      if (current === directory && process.getuid && (info.uid !== process.getuid() || (info.mode & 0o022) !== 0)) throw new Error('Provider configuration directory must be user-owned and not writable by other users');
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Symlink or non-directory configuration location is not supported');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    current = path.dirname(current);
  }
}
function readConfig(filename: string): string | null {
  try {
    const info = lstatSync(filename);
    if (process.getuid && info.uid !== process.getuid()) throw new Error('Provider configuration must be owned by the current user');
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 1024 * 1024) throw new Error('Configuration must be a regular, non-linked file under 1 MiB');
    return readFileSync(filename, 'utf8');
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

/** JSON.parse validates syntax; this small token walk locates just the hooks value
 * and rejects duplicate object keys. All unrelated top-level bytes stay intact. */
function hooksSpan(source: string): [number, number] | null {
  const tokens = [...source.matchAll(/"(?:\\.|[^"\\])*"|[{}[\]:,]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)];
  let index = 0;
  let span: [number, number] | null = null;
  function walk(depth: number): void {
    if (depth > 64) throw new Error('Configuration nesting exceeds the safe limit');
    const token = tokens[index++]?.[0];
    if (token && /^-?\d/.test(token)) {
      const number = Number(token);
      if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) throw new Error('Configuration contains a number that cannot be preserved safely');
    }
    if (token === '{') {
      const keys = new Set<string>();
      while (tokens[index]?.[0] !== '}') {
        const key = JSON.parse(tokens[index++]?.[0] ?? '') as string;
        if (keys.has(key)) throw new SyntaxError('Duplicate JSON key');
        keys.add(key);
        index++; // colon
        const start = tokens[index]?.index ?? 0;
        walk(depth + 1);
        const last = tokens[index - 1];
        if (depth === 0 && key === 'hooks' && last) span = [start, last.index + last[0].length];
        if (tokens[index]?.[0] !== ',') break;
        index++;
      }
      index++;
    } else if (token === '[') {
      while (tokens[index]?.[0] !== ']') {
        walk(depth + 1);
        if (tokens[index]?.[0] !== ',') break;
        index++;
      }
      index++;
    }
  }
  walk(0);
  return span;
}
function patchHooks(source: string, span: [number, number] | null, hooks: RecordValue): string {
  const serialized = JSON.stringify(hooks, null, 2);
  if (span) return source.slice(0, span[0]) + serialized + source.slice(span[1]);
  const end = source.lastIndexOf('}');
  const empty = Object.keys(JSON.parse(source) as object).length === 0;
  return source.slice(0, end) + `${empty ? '' : ','}\n  "hooks": ${serialized}\n` + source.slice(end);
}
