/** Evaluation adapter only: never publishes CGC candidates to the impact graph. */
import oracle from '../../impact/corpus/g1/oracle.json';

export interface CgcEdge {
  fromKind: string; fromName: string; fromPath: string | null;
  type: string; toKind: string; toName: string; toPath: string | null;
  line: number | null; text: string | null; confidence: number | null;
  tier: number | null; source: string | null; method: string | null;
}
interface Candidate { type: string; from: string; to: string; path: string; line: number; text: string; raw: CgcEdge }

export function compareCgc(edges: CgcEdge[]) {
  const path = (value: string | null) => value?.replace(/^\.\//, '') ?? '';
  function identity(kind: string, name: string, file: string | null) {
    const owners = edges.filter(edge => edge.type === 'CONTAINS' && edge.fromKind === 'Class'
      && edge.toKind === kind && edge.toName === name && edge.toPath === file);
    const qualified = owners.length === 1 ? `${owners[0]!.fromName}.${name}` : name;
    return `${path(file)}${kind === 'File' ? '' : `#${qualified}`}`;
  }
  const candidates: Candidate[] = [];
  const unresolved: { raw: CgcEdge; reason: string }[] = [];
  for (const raw of edges) {
    if (raw.type === 'HEURISTIC_CALLS') {
      unresolved.push({ raw, reason: 'Heuristic candidate is not an authoritative relation, regardless of name similarity.' });
    } else if (raw.type === 'IMPORTS' || raw.type === 'INHERITS') {
      unresolved.push({ raw, reason: 'Exported target has no source identity; no TypeScript resolver is silently added to CGC scores.' });
    } else if (raw.type === 'CALLS') {
      if (!raw.fromPath || !raw.toPath || !raw.line || !raw.text) {
        unresolved.push({ raw, reason: 'Missing endpoint or occurrence provenance.' });
        continue;
      }
      const literalImport = raw.toKind === 'File' ? /^import\((['"][^'"]+['"])\)$/.exec(raw.text) : null;
      candidates.push({ type: literalImport ? 'imports' : 'calls',
        from: literalImport ? path(raw.fromPath) : identity(raw.fromKind, raw.fromName, raw.fromPath),
        to: identity(raw.toKind, raw.toName, raw.toPath), path: path(raw.fromPath), line: raw.line,
        text: literalImport ? literalImport[1]! : raw.text, raw });
    }
  }
  const sameOccurrence = (a: Candidate, b: { type: string; from: string; to: string; path: string; line: number; text: string }) =>
    a.type === b.type && a.from === b.from && a.to === b.to && a.path === b.path && a.line === b.line && a.text === b.text;
  const falseLinks = candidates.filter(candidate => !oracle.relations.some(expected => sameOccurrence(candidate, expected)));
  const metrics = Object.fromEntries([...new Set(oracle.relations.map(edge => edge.type))].sort().map(type => {
    const expected = oracle.relations.filter(edge => edge.type === type);
    const truePositives = expected.filter(edge => candidates.some(candidate => sameOccurrence(candidate, edge))).length;
    const falsePositives = falseLinks.filter(edge => edge.type === type).length;
    return [type, { expected: expected.length, truePositives, falsePositives, falseNegatives: expected.length - truePositives,
      precision: truePositives + falsePositives ? truePositives / (truePositives + falsePositives) : null,
      recall: truePositives / expected.length }];
  }));
  const cases = oracle.relations.map(expected => {
    const matched = candidates.find(candidate => sameOccurrence(candidate, expected));
    return { case: expected.case, status: matched ? 'semantic-match' : 'diagnostic-by-evaluator',
      reason: matched ? 'Semantic target matches; CGC has no exact column/end-range/revision evidence in this export, so this is NOT v2 admission.'
        : 'No correct resolved CGC relation for this oracle occurrence. Missing or false candidates must not be admitted.',
      candidate: matched ?? null };
  });
  cases.push(...oracle.diagnostics.map(expected => ({ case: expected.case, status: 'diagnostic-by-evaluator',
    reason: `Requires ${expected.code}; no structured native diagnostic for this occurrence in the queried CGC graph.`, candidate: null })));
  return { metrics, cases, candidates, falseLinks, unresolved,
    authoritativeV2EdgesAdmitted: 0, diagnosticOrigin: 'G1 evaluator, not CGC',
    normalization: 'Class ownership from CONTAINS; literal CALLS-to-File import retyped as imports. No oracle lookup to resolve destinations, no compiler added.' };
}