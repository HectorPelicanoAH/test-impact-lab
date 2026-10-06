import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const versions = JSON.parse(readFileSync('scripts/mesh/versions.json', 'utf8'));
const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : undefined;
const architecture = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'amd64' : undefined;
if (!platform || !architecture) throw new Error('Mesh setup supports macOS/Linux arm64/amd64 only');
const directory = resolve('.impact-tools/mesh');
mkdirSync(directory, { recursive: true });
async function download(url, target) {
  await run('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', url, '-o', target], { timeout: 240_000 });
}
async function verified(url, path, checksumSuffix) {
  const checksum = `${path}.sha256`;
  await download(`${url}${checksumSuffix}`, checksum);
  const expected = readFileSync(checksum, 'utf8').trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid official release checksum');
  if (!existsSync(path) || createHash('sha256').update(readFileSync(path)).digest('hex') !== expected) await download(url, path);
  if (createHash('sha256').update(readFileSync(path)).digest('hex') !== expected) throw new Error('Downloaded tool checksum mismatch');
  return expected;
}
const kindPath = resolve(directory, 'kind');
const kindHash = await verified(`https://github.com/kubernetes-sigs/kind/releases/download/v${versions.kind}/kind-${platform}-${architecture}`, kindPath, '.sha256sum');
chmodSync(kindPath, 0o755);
const istioArchive = resolve(directory, `istio-${versions.istio}.tar.gz`);
const istioHash = await verified(`https://github.com/istio/istio/releases/download/${versions.istio}/istio-${versions.istio}-${platform === 'darwin' ? 'osx' : 'linux'}-${architecture}.tar.gz`, istioArchive, '.sha256');
await run('tar', ['-xzf', istioArchive, '-C', directory]);
writeFileSync(resolve(directory, 'checksums.json'), JSON.stringify({ platform, architecture, kind: { version: versions.kind, sha256: kindHash }, istio: { version: versions.istio, sha256: istioHash } }, null, 2));
console.log((await run(kindPath, ['version'])).stdout.trim());
console.log((await run(resolve(directory, `istio-${versions.istio}/bin/istioctl`), ['version', '--remote=false'])).stdout.trim());
console.log(`G8 tools installed and checked only in ${directory}`);
