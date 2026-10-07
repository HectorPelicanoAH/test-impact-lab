import ts from 'typescript';
import type { DiscoveryArchive, EvidenceLocator, SourceLocation } from '../../packages/impact-engine/src/schema-v2';
import { hash, offset } from './core';

export interface LocatedSource {
  snapshotId: string; revision: string; path: string; sourceHash: string; content: string;
  kind: 'source' | 'declaration' | 'configuration';
  start: SourceLocation['start']; end: SourceLocation['end'];
  pointer?: string; relatedSource?: string;
}

function jsonRange(content: string, path: string, pointer: string): Pick<LocatedSource, 'start' | 'end'> | undefined {
  if (!pointer.startsWith('/')) return undefined;
  const source = ts.parseJsonText(path, content);
  if ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) return undefined;
  const statement = source.statements[0];
  let node: ts.Node | undefined = statement && ts.isExpressionStatement(statement) ? statement.expression : undefined;
  for (const part of pointer.slice(1).split('/').map(item => item.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (node && ts.isObjectLiteralExpression(node)) {
      const property = node.properties.find(item => ts.isPropertyAssignment(item) && (ts.isStringLiteral(item.name) || ts.isIdentifier(item.name)) && item.name.text === part);
      node = property && ts.isPropertyAssignment(property) ? property.initializer : undefined;
    }
    else if (node && ts.isArrayLiteralExpression(node) && /^(0|[1-9]\d*)$/.test(part)) node = node.elements[Number(part)];
    else return undefined;
  }
  if (!node) return undefined;
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.getEnd());
  return { start: { line: start.line + 1, column: start.character + 1 }, end: { line: end.line + 1, column: end.character + 1 } };
}

/** Read a locator ONLY by an existing evidence/node ID, always from its own archived revision. */
export function locateSource(archive: DiscoveryArchive, selection: { evidenceId: string } | { nodeId: string; index: number }): LocatedSource | undefined {
  let locator: EvidenceLocator | undefined;
  let revision: string | undefined;
  if ('evidenceId' in selection) {
    const evidence = archive.graph.evidence.find(item => item.id === selection.evidenceId);
    locator = evidence?.locator;
    revision = evidence?.revision;
  } else {
    const node = archive.graph.nodes.find(item => item.id === selection.nodeId);
    if (Number.isSafeInteger(selection.index) && selection.index >= 0) locator = node?.locations[selection.index];
    revision = archive.graph.repositories.find(item => item.productId === node?.productId && item.repositoryId === node?.repositoryId)?.revision;
  }
  if (!locator || !revision || !('path' in locator) || !('sourceHash' in locator)
    || (locator.kind !== 'source' && locator.kind !== 'declaration' && locator.kind !== 'configuration')) return undefined;
  const content = archive.sources[locator.path] ?? archive.configuration[locator.path];
  if (content === undefined || hash(content) !== locator.sourceHash) return undefined;
  const range = locator.kind === 'source' ? { start: locator.start, end: locator.end } : jsonRange(content, locator.path, locator.pointer);
  if (!range || offset(content, range.start) > offset(content, range.end)) return undefined;
  return { snapshotId: archive.graph.id, revision, path: locator.path, sourceHash: locator.sourceHash, content,
    kind: locator.kind as LocatedSource['kind'], ...range,
    ...('pointer' in locator ? { pointer: locator.pointer, ...(locator.relatedSource ? { relatedSource: locator.relatedSource } : {}) } : {}) };
}