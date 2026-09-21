import { describe, expect, it } from 'vitest';
import { agentProviderForExecutable, buildAgentObservations } from '../src/main/agent-monitor.js';

describe('provider-neutral Agent Monitor observations', () => {
  it('classifies Codex and Claude Code executables without treating unrelated processes as agents', () => {
    expect(agentProviderForExecutable('/usr/local/bin/codex')).toBe('codex');
    expect(agentProviderForExecutable('C:\\Tools\\codex.exe')).toBe('codex');
    expect(agentProviderForExecutable('/opt/homebrew/bin/claude')).toBe('claude_code');
    expect(agentProviderForExecutable('C:\\Tools\\claude-code.exe')).toBe('claude_code');
    expect(agentProviderForExecutable('/bin/bash')).toBeUndefined();
  });

  it('observes only owned provider processes and never copies their arguments or output', () => {
    const observations = buildAgentObservations([
      {
        id: 'process-claude',
        workspaceId: 'workspace-b',
        sessionId: null,
        executable: '/opt/homebrew/bin/claude',
        args: ['--dangerously-sensitive-prompt-should-not-be-copied'],
        state: 'running',
        logSummary: 'sensitive output must not be copied',
      },
      {
        id: 'process-shell',
        workspaceId: 'workspace-b',
        sessionId: null,
        executable: '/bin/bash',
        args: [],
        state: 'running',
        logSummary: '',
      },
    ]);

    expect(observations).toEqual([
      expect.objectContaining({
        id: 'process:process-claude',
        provider: 'claude_code',
        kind: 'managed_process',
        label: 'claude',
        state: 'running',
      }),
    ]);
    const serialized = JSON.stringify(observations);
    expect(serialized).not.toContain('dangerously-sensitive');
    expect(serialized).not.toContain('sensitive output');
  });

  it('does not duplicate swarm tasks that dashboard.agentSwarms already carries', () => {
    expect(buildAgentObservations([]).some((observation) => observation.kind === 'swarm_task')).toBe(false);
  });

});
