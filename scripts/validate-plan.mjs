import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const packages = ['apps/frontend', 'apps/backend', 'apps/demo', 'packages/api-contract', 'packages/impact-engine'];
const names = new Set();
for (const path of packages) {
  const manifest = JSON.parse(readFileSync(`${path}/package.json`, 'utf8'));
  assert.equal(manifest.private, true);
  assert(!names.has(manifest.name));
  names.add(manifest.name);
  assert(existsSync(`${path}/src`));
}
for (const path of ['docs/SDD.md', 'docs/ARCHITECTURE.md', 'docs/IMPLEMENTATION_STATE.md', 'pnpm-workspace.yaml']) assert(existsSync(path), path);
stripTypeScriptTypes(readFileSync('packages/impact-engine/src/schema.ts', 'utf8'), { mode: 'strip' });
console.log('Phase 0 scaffold valid: 5 unique private packages, design documents present, schema syntax valid.');
console.log('This is not a build, typecheck or application test.');
