/* global process */

export function readCompatEnv(suffix, env = process.env) {
  const normalized = String(suffix).trim().toUpperCase();
  if (!/^[A-Z0-9_]+$/u.test(normalized)) {
    throw new Error(`Invalid compatibility environment suffix: ${suffix}`);
  }

  const current = env[`NEXUSPILOT_${normalized}`];
  if (current !== undefined) return current;

  return env[`LNWJUD_${normalized}`];
}
