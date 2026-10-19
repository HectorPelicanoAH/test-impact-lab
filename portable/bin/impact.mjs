#!/usr/bin/env node
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeSnapshot } from '../src/core.mjs';
import { inspectProject } from '../src/inspect.mjs';
import { importV2 } from '../src/import-v2.mjs';
import { listenViewer } from '../src/server.mjs';

const help = `Test Impact Portable — extraction preview

Available:
  impact inspect [--root DIRECTORY] [--out REPORT.json]
  impact validate SNAPSHOT.json
  impact import-v2 ARCHIVE.json --out SNAPSHOT.json [--include-sources]
  impact view [SNAPSHOT.json] [--port PORT]
  impact info

No arguments: show this help. View defaults to the explicitly illustrative sample.
Requires Node >=22; no installation, build or network service is needed.

Planned in the SDD, not implemented:
  init, graph build, baseline create/update, check, run, CI selection
No available command certifies a baseline or excludes tests.
`;

function parse(args, allowed) {
  const options = {}, positional = [];
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith('--')) { positional.push(token); continue; }
    const name = token.slice(2);
    if (!Object.hasOwn(allowed, name)) throw new Error('Unknown option: ' + token);
    if (Object.hasOwn(options, name)) throw new Error('Repeated option: ' + token);
    if (allowed[name] === 'boolean') options[name] = true;
    else {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing value for ' + token);
      options[name] = value;
    }
  }
  return { options, positional };
}
async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}
async function output(path, data) {
  const content = JSON.stringify(data, null, 2) + '\n';
  if (!path) { process.stdout.write(content); return; }
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temp = target + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, content, { flag: 'wx' });
    await rename(temp, target);
  } finally { await rm(temp, { force: true }); }
  process.stdout.write(target + '\n');
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') { process.stdout.write(help); return; }
  if (command === 'info') {
    if (args.length) throw new Error('info takes no arguments.');
    return output(null, {
      stage: 'extraction-preview',
      toolkitRoot: fileURLToPath(new URL('../', import.meta.url)),
      sdd: fileURLToPath(new URL('../docs/SDD.md', import.meta.url)),
      skill: fileURLToPath(new URL('../skills/test-impact-onboard/SKILL.md', import.meta.url)),
      capabilities: ['manifest-inspection', 'view-validation', 'lab-v2-view-import', 'read-only-filtered-viewer'],
      selectionAvailable: false
    });
  }
  if (command === 'inspect') {
    const { options, positional } = parse(args, { root: 'value', out: 'value' });
    if (positional.length) throw new Error('Use inspect --root DIRECTORY.');
    return output(options.out, await inspectProject(options.root ?? process.cwd()));
  }
  if (command === 'validate') {
    const { positional } = parse(args, {});
    if (positional.length !== 1) throw new Error('validate requires one snapshot.');
    const snapshot = normalizeSnapshot(await readJson(positional[0]));
    return output(null, { valid: true, id: snapshot.id, nodes: snapshot.nodes.length, edges: snapshot.edges.length, use: 'inspection-only' });
  }
  if (command === 'import-v2') {
    const { options, positional } = parse(args, { out: 'value', 'include-sources': 'boolean' });
    if (positional.length !== 1 || !options.out) throw new Error('import-v2 requires one archive and --out.');
    return output(options.out, importV2(await readJson(positional[0]), { includeSources: Boolean(options['include-sources']) }));
  }
  if (command === 'view') {
    const { options, positional } = parse(args, { port: 'value' });
    if (positional.length > 1) throw new Error('view accepts one snapshot.');
    const port = options.port === undefined ? 0 : Number(options.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
    const path = positional[0] ?? fileURLToPath(new URL('../examples/system.json', import.meta.url));
    const snapshot = normalizeSnapshot(await readJson(path));
    const server = await listenViewer(snapshot, port);
    process.stdout.write('Viewer: http://127.0.0.1:' + server.address().port + '\nSnapshot: ' + snapshot.id + '\n');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
    return;
  }
  throw new Error('Command unavailable: ' + command + '. Use --help for implemented commands.');
}

main().catch(error => {
  process.stderr.write('impact: ' + error.message + '\n');
  process.exitCode = 2;
});
