import { calculateImpact } from './index';
import type { FileDiff, GraphNode, ImpactResult, SourceAnalysisInput } from './schema';

export interface SourceAnalysisResult {
  diff: FileDiff[];
  result: ImpactResult;
}

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function lineDiff(path: string, original: string, modified: string): FileDiff | undefined {
  if (original === modified) return undefined;
  const before = original.split('\n');
  const after = modified.split('\n');
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  return {
    path,
    status: 'modified',
    hunks: [{
      oldStart: prefix + 1,
      oldLines: before.length - prefix - suffix,
      newStart: prefix + 1,
      newLines: after.length - prefix - suffix,
    }],
  };
}

function intersects(node: GraphNode, diff: FileDiff): boolean {
  if (!node.source || node.source.path !== diff.path || node.changeable === false) return false;
  return diff.hunks.some(hunk => {
    const start = hunk.oldStart;
    const end = hunk.oldLines === 0 ? start : start + hunk.oldLines - 1;
    return start <= node.source!.endLine && end >= node.source!.startLine;
  });
}

/** Maps real source replacements to the narrowest versioned graph ranges, then invokes the shared engine. */
export function analyzeSourceEdits(input: SourceAnalysisInput): SourceAnalysisResult {
  const edits = [...input.edits].sort((a, b) => compare(a.path, b.path));
  const duplicate = edits.find((edit, index) => index > 0 && edit.path === edits[index - 1]!.path);
  if (duplicate) throw new Error(`Duplicate edit path: ${duplicate.path}`);
  const uncertaintyReasons = [...(input.uncertaintyReasons ?? [])];
  const diff: FileDiff[] = [];
  const changed = new Set<string>();
  for (const edit of edits) {
    const original = input.originalFiles[edit.path];
    if (original === undefined) {
      uncertaintyReasons.push(`Edited file is not in the baseline: ${edit.path}`);
      continue;
    }
    const fileDiff = lineDiff(edit.path, original, edit.content);
    if (!fileDiff) continue;
    diff.push(fileDiff);
    const candidates = input.graph.nodes.filter(node => node.kind !== 'test' && intersects(node, fileDiff));
    if (!candidates.length) {
      uncertaintyReasons.push(`No graph entity covers changed lines in ${edit.path}`);
      continue;
    }
    const minimumSpan = Math.min(...candidates.map(node => node.source!.endLine - node.source!.startLine));
    for (const node of candidates.filter(node => node.source!.endLine - node.source!.startLine === minimumSpan)) changed.add(node.id);
  }
  return {
    diff,
    result: calculateImpact({
      diff,
      changedEntityIds: [...changed].sort(compare),
      graph: input.graph,
      catalogue: input.catalogue,
      uncertaintyReasons,
    }),
  };
}
