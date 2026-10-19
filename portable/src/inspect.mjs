import { readdir, readFile, lstat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { hash } from './core.mjs';

const excluded = new Set(['.git', 'node_modules', 'dist', 'dist-server', 'coverage', '.test-impact', '.impact-data', '.impact-runs', '.impact-snapshots', '.pnpm-store', '.next', '.venv', 'venv', '__pycache__', 'vendor', 'target', 'build', '.idea']);
const languageFor = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', java: 'Java', kt: 'Kotlin', cs: 'C#', go: 'Go', rs: 'Rust', rb: 'Ruby', php: 'PHP',
  vue: 'Vue', svelte: 'Svelte', css: 'CSS', scss: 'SCSS', html: 'HTML'
};
const runnerNames = ['vitest', 'jest', '@playwright/test', 'playwright', 'cypress', 'mocha', 'ava'];

export async function inspectProject(root, { maxFiles = 20000 } = {}) {
  root = resolve(root);
  const files = [], diagnostics = [], manifests = [], languageCounts = {};
  let stopped = false;
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (excluded.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).split('\\').join('/');
      if (entry.isSymbolicLink()) { diagnostics.push({ code: 'symlink-not-inspected', path }); continue; }
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        if (files.length >= maxFiles) { stopped = true; return; }
        files.push(path);
        const language = languageFor[entry.name.split('.').at(-1)];
        if (language) languageCounts[language] = (languageCounts[language] ?? 0) + 1;
        if (entry.name === 'package.json') {
          if ((await lstat(absolute)).size > 1_000_000) {
            diagnostics.push({ code: 'manifest-too-large', path });
          } else {
            try {
              const manifest = JSON.parse(await readFile(absolute, 'utf8'));
              const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
              manifests.push({
                path, name: manifest.name ?? null,
                runners: runnerNames.filter(name => Object.hasOwn(dependencies, name)),
                scripts: manifest.scripts ?? {},
                workspaces: manifest.workspaces ?? null
              });
            } catch { diagnostics.push({ code: 'manifest-unreadable', path }); }
          }
        }
      }
      if (stopped) return;
    }
  }
  await walk(root);
  if (stopped) diagnostics.push({ code: 'inventory-limit', maxFiles });
  const candidateTestFiles = files.filter(path => /(?:^|\/)(?:test_[^/]+\.py|[^/]+_test\.go)$|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:Test|Tests)\.(?:java|kt|cs)$/.test(path));
  const report = {
    format: 'test-impact-inspection/1',
    completeness: stopped || diagnostics.length ? 'partial' : 'complete-within-declared-scan',
    excludedDirectories: [...excluded].sort(),
    files, languages: languageCounts, manifests, candidateTestFiles,
    capabilities: {
      dependencyDiscovery: 'not-implemented',
      runnerEnumeration: 'not-implemented',
      perTestCoverage: 'not-implemented',
      impactSelection: 'not-implemented'
    },
    diagnostics,
    notes: [
      'File patterns are candidates, not an authoritative test catalogue.',
      'Manifests are read as data; no configuration, scripts or tests have been executed.',
      'Repository ignore rules and runtime resolution have not been interpreted.'
    ]
  };
  return { ...report, id: hash(report) };
}
