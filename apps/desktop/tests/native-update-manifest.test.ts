import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeNativeUpdateManifest } from '../scripts/write-native-update-manifest.mjs';

describe('native update manifest', () => {
  it.each([
    ['macos', 'arm64', 'zip', 'latest-mac.yml'],
    ['linux', 'x64', 'AppImage', 'latest-linux.yml'],
    ['linux', 'arm64', 'AppImage', 'latest-linux-arm64.yml'],
  ])('records the actual %s/%s update artifact and hash', async (target, arch, extension, manifestName) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nexuspilot-update-manifest-'));
    try {
      const name = `NexusPilot-5.4.0-${arch}.${extension}`;
      const bytes = Buffer.from(`artifact-${target}-${arch}`);
      await writeFile(path.join(directory, name), bytes);
      await expect(writeNativeUpdateManifest(target, arch, directory, '5.4.0')).resolves.toBe(manifestName);
      const manifest = await readFile(path.join(directory, manifestName), 'utf8');
      expect(manifest).toContain('version: 5.4.0');
      expect(manifest).toContain(`  - url: ${name}`);
      expect(manifest).toContain(`size: ${bytes.length}`);
      expect(manifest).toContain(`sha512: ${createHash('sha512').update(bytes).digest('base64')}`);
      expect(manifest).toContain(`path: ${name}`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fails closed when the expected artifact is missing', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nexuspilot-update-manifest-'));
    try {
      await expect(writeNativeUpdateManifest('macos', 'arm64', directory, '5.4.0')).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
