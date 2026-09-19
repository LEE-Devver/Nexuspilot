import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveNativeHostCandidate } from '../src/main/capability-runtime.js';

describe('resolveNativeHostCandidate', () => {
  it('prefers the canonical NexusPilot native host within the same install root', () => {
    const root = path.resolve('/fixture/native-host/macos/arm64');
    const canonical = path.join(root, 'nexuspilot-macos-host');
    const legacy = path.join(root, 'lnwjud-macos-host');
    const existing = new Set([canonical, legacy]);

    expect(resolveNativeHostCandidate(
      [root],
      ['nexuspilot-macos-host', 'lnwjud-macos-host'],
      (candidate) => existing.has(candidate),
    )).toEqual({ path: canonical, name: 'nexuspilot-macos-host' });
  });

  it('falls back to a legacy native host when the canonical binary is absent', () => {
    const root = path.resolve('/fixture/native-host/linux/x64');
    const legacy = path.join(root, 'lnwjud-linux-host');

    expect(resolveNativeHostCandidate(
      [root],
      ['nexuspilot-linux-host', 'lnwjud-linux-host'],
      (candidate) => candidate === legacy,
    )).toEqual({ path: legacy, name: 'lnwjud-linux-host' });
  });

  it('keeps install-root priority ahead of developer roots', () => {
    const packaged = path.resolve('/fixture/packaged');
    const developer = path.resolve('/fixture/developer');
    const packagedLegacy = path.join(packaged, 'lnwjud-macos-host');
    const developerCanonical = path.join(developer, 'nexuspilot-macos-host');
    const existing = new Set([packagedLegacy, developerCanonical]);

    expect(resolveNativeHostCandidate(
      [packaged, developer],
      ['nexuspilot-macos-host', 'lnwjud-macos-host'],
      (candidate) => existing.has(candidate),
    )).toEqual({ path: packagedLegacy, name: 'lnwjud-macos-host' });
  });
});
