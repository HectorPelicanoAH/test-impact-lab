import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const template = resolve(workspace, 'examples/external-inventory');
export function materializeInventory(destination) {
  const local = readFileSync(resolve(workspace, 'packages/api-contract/src/inventory-contract.json'), 'utf8');
  const external = readFileSync(resolve(template, 'contract/inventory-stock-v1.json'), 'utf8');
  if (local !== external) throw new Error('Inventory contract template differs from the client contract.');
  const temporary = destination === undefined;
  const target = resolve(destination ?? mkdtempSync(resolve(tmpdir(), 'impact-external-inventory-')));
  try {
    if (existsSync(target) && (!lstatSync(target).isDirectory() || readdirSync(target).length)) throw new Error('Target must be an empty directory.');
    const canonical = existsSync(target) ? realpathSync(target) : resolve(realpathSync(dirname(target)), basename(target));
    if (canonical === workspace || canonical.startsWith(`${workspace}${sep}`)) throw new Error('External inventory must be outside this checkout.');
    cpSync(template, target, { recursive: true, force: false });
    execFileSync('git', ['init', '-q', target]);
    // This generated local fixture must not inherit interactive signing from the user's global Git config.
    execFileSync('git', ['-C', target, 'config', 'commit.gpgsign', 'false']);
    execFileSync('git', ['-C', target, 'add', '.']);
    execFileSync('git', ['-C', target, '-c', 'user.name=Test Impact Lab', '-c', 'user.email=local@example.invalid', 'commit', '-qm', 'Materialize independent inventory source']);
    return { root: realpathSync(target), revision: execFileSync('git', ['-C', target, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
  } catch (error) {
    if (temporary) rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const materialized = materializeInventory(process.argv[2]);
  console.log(JSON.stringify(materialized));
}