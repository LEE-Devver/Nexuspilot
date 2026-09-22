import type { ExternalAgentIntegrationRequest, ExternalAgentIntegrationResult, NexusPilotApi } from '@nexuspilot/ipc-contracts';

/** Read back after each mutation; never infer Configured from a successful IPC call. */
export async function runIntegrationAction(
  api: Pick<NexusPilotApi, 'externalAgentIntegration'>,
  request: ExternalAgentIntegrationRequest,
): Promise<{ result: ExternalAgentIntegrationResult; status: ExternalAgentIntegrationResult }> {
  const result = await api.externalAgentIntegration(request);
  const status = result.status !== 'unavailable' && (request.action === 'setup' || request.action === 'remove')
    ? await api.externalAgentIntegration({ provider: request.provider, action: 'inspect' }) : result;
  return { result, status };
}
