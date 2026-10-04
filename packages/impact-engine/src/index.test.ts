import { expect, test } from 'vitest';
import graphJson from '../../../impact/graph.json';
import catalogueJson from '../../../impact/catalogue.json';
import { calculateImpact, validateGraph } from './index';
import type { ImpactGraph, ImpactResult, TestMetadata } from './schema';

const graph = graphJson as ImpactGraph;
const catalogue = catalogueJson as TestMetadata[];
const impact = (changedEntityIds: string[], candidate = graph) => calculateImpact({ changedEntityIds, graph: candidate, catalogue, diff: [], uncertaintyReasons: [] });

function verifyPaths(result: ImpactResult) {
  expect(result.explanations.map(reason => reason.testId)).toEqual(result.selectedTests);
  for (const reason of result.explanations) {
    let node = reason.changedNode;
    for (const step of reason.path) {
      const edge = graph.edges.find(candidate => candidate.id === step.edgeId)!;
      expect(edge).toBeDefined();
      expect(node).toBe(step.direction === 'forward' ? edge.from : edge.to);
      node = step.direction === 'forward' ? edge.to : edge.from;
    }
    expect(node).toBe(catalogue.find(test => test.id === reason.testId)!.nodeId);
  }
}

test('An unchanged repository selects nothing', () => {
  const result = impact([]);
  expect(result.selectedTests).toEqual([]);
  expect(result.excludedTests).toHaveLength(catalogue.length);
});

test('UI changes select local components and E2E without touching the boundary', () => {
  const result = impact(['LoginButton']);
  expect(result.selectedTests).toEqual(['C1', 'C2', 'E1']);
  expect(result.boundaries).toEqual([]);
  verifyPaths(result);
});

test('Frontend logic reaches contract evidence but not backend tests', () => {
  const result = impact(['normalizeEmail']);
  expect(result.selectedTests).toEqual(['C2', 'CT1', 'E1', 'FU1']);
  expect(result.boundaries.length).toBeGreaterThan(0);
  expect(result.boundaries.every(boundary => !boundary.crossed)).toBe(true);
  expect(result.excludedTests.some(test => test.testId === 'I1' && test.reason === 'boundary-stopped')).toBe(true);
  verifyPaths(result);
});

test('Domain change reaches backend, contract and journey without selecting frontend components', () => {
  const result = impact(['User']);
  expect(result.selectedTests).toEqual(['BU1', 'BU2', 'BU3', 'BU4', 'BU5', 'CT1', 'E1', 'I1', 'I2']);
  expect(result.excludedTests.find(test => test.testId === 'C2')?.reason).toBe('boundary-stopped');
  expect(result.journeyNodes).toContain('LoginPage');
  verifyPaths(result);
});

test('Contract changes expose relevant code on both sides', () => {
  const result = impact(['POST /login']);
  for (const id of ['BU1', 'BU4', 'I1', 'CT1', 'C2', 'FU1', 'E1']) expect(result.selectedTests).toContain(id);
  expect(result.selectedTests).not.toContain('C1');
  expect(result.boundaries.every(boundary => boundary.crossed)).toBe(true);
  verifyPaths(result);
});

test('Selection depends on relationships rather than entity-specific lookup tables', () => {
  const modified = structuredClone(graph);
  modified.edges = modified.edges.filter(edge => !(edge.from === 'LoginForm' && edge.to === 'LoginButton'));
  expect(impact(['LoginButton'], modified).selectedTests).toEqual(['C1']);
});

test('Graph/catalogue order and duplicate changed IDs do not change any output', () => {
  const actual = calculateImpact({ changedEntityIds: ['User', 'LoginButton', 'User'], graph: { ...graph, nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() }, catalogue: [...catalogue].reverse(), diff: [], uncertaintyReasons: [] });
  expect(actual).toEqual(impact(['LoginButton', 'User']));
  expect(actual.selectedTests).toEqual([...new Set([...impact(['User']).selectedTests, ...impact(['LoginButton']).selectedTests])].sort());
});

test('Traversal terminates through cycles and repository injection reaches consumers', () => {
  const result = impact(['InMemoryUserRepository']);
  expect(result.selectedTests).toContain('BU4');
  expect(result.selectedTests).toContain('I1');
  expect(result.selectedTests).not.toContain('C2');
  const cyclic = structuredClone(graph);
  cyclic.edges.push({ id: 'cycle', from: 'LoginButton', to: 'LoginForm', type: 'calls', evidence: { kind: 'architecture', source: 'test fixture', reason: 'Synthetic cycle to prove termination.' }, policy: { reverseImpact: true, forwardBoundaryEvidence: false, contractExposure: false } });
  expect(impact(['LoginButton'], cyclic).selectedTests).toEqual(impact(['LoginButton']).selectedTests);
});

test('Unknown or unmapped changes conservatively select all tests with an explanation', () => {
  const unknown = impact(['UnknownEntity']);
  expect(unknown.selectionMode).toBe('conservative-full');
  expect(unknown.selectedTests).toHaveLength(catalogue.length);
  expect(unknown.explanations.every(reason => reason.reason.includes('Conservative'))).toBe(true);
  const missing = calculateImpact({ graph, catalogue, changedEntityIds: [], diff: [{ path: 'new.ts', status: 'added', hunks: [] }], uncertaintyReasons: [] });
  expect(missing.selectionMode).toBe('conservative-full');
});

test('Invalid evidence fails closed rather than returning a misleading subset', () => {
  const dangling = structuredClone(graph);
  dangling.edges[0]!.to = 'missing';
  expect(() => validateGraph(dangling, catalogue)).toThrow('Dangling');
  const duplicate = structuredClone(graph);
  duplicate.nodes.push(duplicate.nodes[0]!);
  expect(() => validateGraph(duplicate, catalogue)).toThrow('Duplicate');
  const bypass = structuredClone(graph);
  bypass.edges.push({ ...graph.edges[0]!, id: 'illegal', from: 'AuthClient', to: 'User' });
  expect(() => validateGraph(bypass, catalogue)).toThrow('bypasses contract');
});
