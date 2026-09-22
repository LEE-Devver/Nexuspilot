import type { ExternalAgentIntegrationRequest, ExternalAgentIntegrationResult } from '@nexuspilot/ipc-contracts';

export function parseIntegrationRequest(value: unknown): ExternalAgentIntegrationRequest {
  if (!record(value) || (value.provider !== 'codex' && value.provider !== 'claude_code')
    || !['inspect', 'preview_setup', 'preview_remove', 'setup', 'remove'].includes(String(value.action))
    || (value.expectedRevision !== undefined && (typeof value.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(value.expectedRevision)))
    || Object.keys(value).some((key) => !['provider', 'action', 'expectedRevision'].includes(key))) throw new Error('Invalid integration request');
  if ((value.action === 'setup' || value.action === 'remove') && value.expectedRevision === undefined) throw new Error('Preview is required before changing integration');
  return { provider: value.provider, action: value.action as ExternalAgentIntegrationRequest['action'],
    ...(value.expectedRevision === undefined ? {} : { expectedRevision: value.expectedRevision as string }) };
}

export function parseIntegrationResult(value: unknown): ExternalAgentIntegrationResult {
  if (!record(value) || (value.provider !== 'codex' && value.provider !== 'claude_code')
    || !['not_configured', 'configured', 'differs', 'unavailable'].includes(String(value.status))
    || !['configPath', 'command', 'revision', 'message'].every((key) => typeof value[key] === 'string')
    || !['createsFile', 'modifiesEntry', 'changes'].every((key) => typeof value[key] === 'boolean')
    || (value.backupPath !== null && typeof value.backupPath !== 'string')
    || !Array.isArray(value.events) || !value.events.every((event) => typeof event === 'string')) throw new Error('Invalid integration status');
  return { provider: value.provider, status: value.status as ExternalAgentIntegrationResult['status'],
    configPath: value.configPath as string, command: value.command as string, revision: value.revision as string,
    message: value.message as string, createsFile: value.createsFile as boolean, modifiesEntry: value.modifiesEntry as boolean,
    changes: value.changes as boolean, backupPath: value.backupPath as string | null, events: value.events as string[] };
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
