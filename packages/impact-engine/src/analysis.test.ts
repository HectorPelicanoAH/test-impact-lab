import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import graphJson from '../../../impact/graph.json';
import catalogueJson from '../../../impact/catalogue.json';
import { analyzeSourceEdits } from './analysis';
import type { ImpactGraph, TestMetadata } from './schema';

const graph = graphJson as ImpactGraph;
const catalogue = catalogueJson as TestMetadata[];

function scenario(path: string, find: string, replacement: string) {
  const original = readFileSync(path, 'utf8');
  expect(original).toContain(find);
  return analyzeSourceEdits({
    originalFiles: { [path]: original },
    edits: [{ path, content: original.replace(find, replacement) }],
    graph,
    catalogue,
  });
}

test('Real LoginButton source edit maps to the UI scenario', () => {
  const analysis = scenario('apps/frontend/src/components/LoginButton.tsx', "'Sign in'", "'Continue'");
  expect(analysis.result.changedEntities).toEqual(['LoginButton']);
  expect(analysis.result.selectedTests).toEqual(['C1', 'C2', 'C3', 'E1']);
});

test('Real normalization edit maps to the frontend logic scenario', () => {
  const analysis = scenario('apps/frontend/src/auth/normalizeEmail.ts', 'value.trim().toLowerCase()', 'value.trim()');
  expect(analysis.result.changedEntities).toEqual(['normalizeEmail']);
  expect(analysis.result.selectedTests).toHaveLength(11);
  expect(analysis.result.selectedTests.some(id => id.startsWith('BU') || id.startsWith('I'))).toBe(false);
});

test('Real aggregate method edit chooses its narrow behavior range', () => {
  const analysis = scenario('apps/backend/src/auth/domain/User.ts', "if (this.locked) return 'locked';", "if (this.locked) return 'invalid-credentials';");
  expect(analysis.result.changedEntities).toEqual(['User.authenticate']);
  expect(analysis.result.selectedTests).toHaveLength(13);
  expect(analysis.result.selectedTests.some(id => id.startsWith('C') && !id.startsWith('CT'))).toBe(false);
});

test('Real contract edit crosses both architectural sides', () => {
  const analysis = scenario('packages/api-contract/src/login.ts', "export const LOGIN_PATH = '/login';", "export const LOGIN_PATH = '/session';");
  expect(analysis.result.changedEntities).toEqual(['POST /login']);
  expect(analysis.result.selectedTests).toHaveLength(29);
  expect(analysis.result.boundaries.every(boundary => boundary.crossed)).toBe(true);
});

test('Unknown edited files fail closed with a full selection', () => {
  const analysis = analyzeSourceEdits({ originalFiles: {}, edits: [{ path: 'unknown.ts', content: 'changed' }], graph, catalogue });
  expect(analysis.result.selectionMode).toBe('conservative-full');
  expect(analysis.result.selectedTests).toHaveLength(39);
});

test('Syntactically invalid edited source fails closed with a full selection', () => {
  const path = 'apps/backend/src/auth/domain/User.ts';
  const original = readFileSync(path, 'utf8');
  const analysis = analyzeSourceEdits({
    originalFiles: { [path]: original },
    edits: [{ path, content: original.replace('async authenticate(password: string)', 'async authenticate(password: string') }],
    graph,
    catalogue,
    uncertaintyReasons: [`Edited file contains syntax errors: ${path}`],
  });
  expect(analysis.result.selectionMode).toBe('conservative-full');
  expect(analysis.result.selectedTests).toHaveLength(39);
  expect(analysis.result.warnings).toContain(`Edited file contains syntax errors: ${path}`);
});
