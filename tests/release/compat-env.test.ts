import { describe, expect, it } from 'vitest';

describe('release compatibility environment helper', () => {
  it('prefers NEXUSPILOT_* and falls back to LNWJUD_*', async () => {
    const { readCompatEnv } = await import('../../scripts/lib/compat-env.mjs');

    expect(readCompatEnv('RUNTIME_ARCH', {
      NEXUSPILOT_RUNTIME_ARCH: 'arm64',
      LNWJUD_RUNTIME_ARCH: 'x64',
    })).toBe('arm64');

    expect(readCompatEnv('RUNTIME_ARCH', {
      LNWJUD_RUNTIME_ARCH: 'x64',
    })).toBe('x64');

    expect(readCompatEnv('RUNTIME_ARCH', {})).toBeUndefined();
  });

  it('rejects invalid suffixes', async () => {
    const { readCompatEnv } = await import('../../scripts/lib/compat-env.mjs');
    expect(() => readCompatEnv('runtime-arch', {})).toThrow(
      'Invalid compatibility environment suffix',
    );
  });
});
