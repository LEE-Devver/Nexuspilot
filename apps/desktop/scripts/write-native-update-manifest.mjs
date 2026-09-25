import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

export async function writeNativeUpdateManifest(target, arch, installerDirectory, version) {
  if (!['macos', 'linux'].includes(target) || !['arm64', 'x64'].includes(arch)) throw new Error('Unsupported native update target');
  const extension = target === 'macos' ? 'zip' : 'AppImage';
  const artifactName = `NexusPilot-${version}-${arch}.${extension}`;
  const artifactPath = path.join(installerDirectory, artifactName);
  const artifact = await stat(artifactPath);
  if (!artifact.isFile()) throw new Error(`Native update artifact is not a file: ${artifactName}`);
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(artifactPath)) hash.update(chunk);
  const sha512 = hash.digest('base64');
  const manifestName = target === 'macos' ? 'latest-mac.yml' : arch === 'x64' ? 'latest-linux.yml' : 'latest-linux-arm64.yml';
  const manifest = [
    `version: ${version}`,
    'files:',
    `  - url: ${artifactName}`,
    `    sha512: ${sha512}`,
    `    size: ${artifact.size}`,
    `path: ${artifactName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    '',
  ].join('\n');
  await writeFile(path.join(installerDirectory, manifestName), manifest, 'utf8');
  return manifestName;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [target, arch] = process.argv.slice(2);
  const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
  await writeNativeUpdateManifest(target, arch, path.resolve('dist/installers'), version);
}
