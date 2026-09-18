export type CompatEnvLike = Readonly<Record<string, string | undefined>>;

export interface CompatEnvValue {
  readonly value: string | undefined;
  readonly source: 'nexuspilot' | 'lnwjud' | 'unset';
}

/**
 * Read a NexusPilot environment variable while preserving the inherited
 * LNWJUD_* name as a bounded compatibility fallback.
 *
 * NEXUSPILOT_* always wins when both variables are present.
 */
export function readCompatEnv(
  suffix: string,
  env: CompatEnvLike = process.env,
): CompatEnvValue {
  const normalized = suffix.trim().toUpperCase();
  if (!/^[A-Z0-9_]+$/u.test(normalized)) {
    throw new Error(`Invalid compatibility environment suffix: ${suffix}`);
  }

  const current = env[`NEXUSPILOT_${normalized}`];
  if (current !== undefined) return { value: current, source: 'nexuspilot' };

  const legacy = env[`LNWJUD_${normalized}`];
  if (legacy !== undefined) return { value: legacy, source: 'lnwjud' };

  return { value: undefined, source: 'unset' };
}
