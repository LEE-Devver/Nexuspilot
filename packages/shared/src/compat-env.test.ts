import { describe, expect, it } from 'vitest';
import { readCompatEnv } from './compat-env.js';

describe('readCompatEnv', () => {
  it('prefers the NexusPilot variable over the legacy lnwjud variable', () => {
    expect(readCompatEnv('DATA_PATH', {
      NEXUSPILOT_DATA_PATH: '/new',
      LNWJUD_DATA_PATH: '/legacy',
    })).toEqual({ value: '/new', source: 'nexuspilot' });
  });

  it('falls back to the inherited lnwjud variable', () => {
    expect(readCompatEnv('DATA_PATH', {
      LNWJUD_DATA_PATH: '/legacy',
    })).toEqual({ value: '/legacy', source: 'lnwjud' });
  });

  it('reports an unset value explicitly', () => {
    expect(readCompatEnv('DATA_PATH', {})).toEqual({
      value: undefined,
      source: 'unset',
    });
  });

  it('rejects invalid suffixes instead of constructing arbitrary keys', () => {
    expect(() => readCompatEnv('data-path', {})).toThrow(
      'Invalid compatibility environment suffix',
    );
  });
});
