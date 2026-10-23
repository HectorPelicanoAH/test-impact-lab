import { readdir, mkdir, lstat, realpath, cp, mkdtemp, rename, rm, rmdir } from 'node:fs/promises';
import { resolve, dirname, basename, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['.git', 'node_modules', '.test-impact', 'coverage', '.DS_Store']);
const entries = ['package.json', '.gitignore', 'README.md', 'bin', 'src', 'lib', 'ui', 'docs', 'skills', 'examples', 'scripts', 'test'];

async function physicalTarget(target) {
  try { return await realpath(target); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = dirname(target);
    if (parent === target) throw error;
    return join(await physicalTarget(parent), basename(target));
  }
}

export async function exportRepository(destination) {
  if (!destination) throw new Error('Specify an empty destination directory.');
  const target = resolve(destination);
  const physical = await physicalTarget(target);
  const origin = await realpath(source);
  if (physical === origin || physical.startsWith(origin + sep)) throw new Error('Destination cannot be inside the toolkit.');
  let exists = false;
  try {
    const stat = await lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Destination must be a real directory.');
    exists = true;
    if ((await readdir(target)).length) throw new Error('Destination must be empty; nothing was overwritten.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(target), { recursive: true });
  const staging = await mkdtemp(join(dirname(target), '.impact-export-'));
  try {
    for (const entry of entries) {
      await cp(join(source, entry), join(staging, entry), {
        recursive: true,
        filter: async path => {
          const name = basename(path);
          if (excluded.has(name) || name.endsWith('.tgz')) return false;
          if ((await lstat(path)).isSymbolicLink()) throw new Error('Cannot export a symlink: ' + path);
          return true;
        }
      });
    }
    if (exists) await rmdir(target); // Fails if another process put files there.
    await rename(staging, target);
    return target;
  } finally { await rm(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    process.stderr.write('Usage: node scripts/export.mjs EMPTY_DIRECTORY\n');
    process.exitCode = 2;
  } else {
    exportRepository(process.argv[2]).then(path => process.stdout.write('Exported: ' + path + '\n')).catch(error => {
      process.stderr.write(error.message + '\n');
      process.exitCode = 2;
    });
  }
}
