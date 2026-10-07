/** G1 evaluation only. No product roots, watch mode, persistence or impact integration. */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative, posix } from 'node:path';
import ts from 'typescript';
import oracle from '../../impact/corpus/g1/oracle.json';

export const digest = (text: string) => createHash('sha256').update(text).digest('hex');
export type Files = Record<string, string>;
interface Location {
  path: string; start: number; end: number; line: number; column: number;
  endLine: number; endColumn: number; text: string; sourceHash: string; extractor: string;
}
export interface Relation extends Location { type: string; from: string; to: string }
export interface Diagnostic extends Location { code: string; reason: string }
export interface Extraction { nodes: string[]; files: Record<string, string>; relations: Relation[]; diagnostics: Diagnostic[]; hash: string }

export function loadCorpus(): Files {
  const root = resolve('impact/corpus/g1/project');
  const files: Files = {};
  function walk(path: string) {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const full = resolve(path, item.name);
      if (item.isDirectory()) walk(full);
      else files[relative(root, full).replaceAll('\\', '/')] = readFileSync(full, 'utf8');
    }
  }
  walk(root);
  return files;
}

export function evolve(original: Files): Files {
  const change = oracle.evolution;
  const files: Files = { ...original, ...change.add, ...change.modify };
  for (const path of change.delete) delete files[path];
  files[change.rename.to] = files[change.rename.from]!;
  delete files[change.rename.from];
  files[change.rewrite.path] = files[change.rewrite.path]!.replace(change.rewrite.before, change.rewrite.after);
  return files;
}

export function extract(files: Files): Extraction {
  // A virtual FS isolates intentionally invalid fixtures from the product and its dependencies.
  const root = '/__g1_corpus__';
  const pathOf = (path: string) => posix.relative(root, path);
  const read = (path: string) => files[pathOf(path)];
  const exists = (path: string) => read(path) !== undefined;
  const config = ts.parseConfigFileTextToJson(`${root}/tsconfig.json`, files['tsconfig.json']!).config;
  const options = ts.convertCompilerOptionsFromJson(config.compilerOptions, root).options;
  const host: ts.CompilerHost = {
    fileExists: exists, readFile: read,
    directoryExists: path => Object.keys(files).some(file => `${root}/${file}`.startsWith(`${path}/`)),
    getDirectories: () => [], getCurrentDirectory: () => root,
    getCanonicalFileName: path => path, useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n', getDefaultLibFileName: () => `${root}/__no_lib__.d.ts`, writeFile: () => {},
    getSourceFile: (path, target) => {
      const text = read(path);
      return text === undefined ? undefined : ts.createSourceFile(path, text, target, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    },
  };
  const inputPaths = Object.keys(files).sort();
  const program = ts.createProgram(inputPaths.filter(path => /\.tsx?$/.test(path)).map(path => `${root}/${path}`), options, host);
  const checker = program.getTypeChecker();
  const nodes = new Set(inputPaths);
  const relations: Relation[] = [];
  const diagnostics: Diagnostic[] = [];
  function locate(source: ts.SourceFile, node: ts.Node): Location {
    const start = node.getStart(source), end = node.getEnd();
    const a = source.getLineAndCharacterOfPosition(start), b = source.getLineAndCharacterOfPosition(end);
    return { path: pathOf(source.fileName), start, end, line: a.line + 1, column: a.character + 1,
      endLine: b.line + 1, endColumn: b.character + 1, text: source.text.slice(start, end),
      sourceHash: digest(source.text), extractor: 'typescript-checker-g1@1' };
  }
  const named = (node: ts.Node): node is ts.FunctionDeclaration | ts.ClassDeclaration | ts.InterfaceDeclaration | ts.MethodDeclaration | ts.MethodSignature =>
    ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node);
  function identity(node: ts.Node): string {
    const names: string[] = [];
    let current: ts.Node | undefined = node;
    while (current && !ts.isSourceFile(current)) {
      if (named(current) && current.name) names.unshift(current.name.getText());
      current = current.parent;
    }
    return `${pathOf(node.getSourceFile().fileName)}${names.length ? `#${names.join('.')}` : ''}`;
  }
  function target(node: ts.Node): ts.Declaration | undefined {
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const declarations = symbol?.declarations ?? [];
    // No homonym search, callback expansion or dataflow guesses.
    return declarations.length === 1 ? declarations[0] : undefined;
  }
  function diagnostic(source: ts.SourceFile, node: ts.Node, code: string, reason: string) {
    diagnostics.push({ ...locate(source, node), code, reason });
  }
  function relation(source: ts.SourceFile, node: ts.Node, type: string, from: string, to: string) {
    relations.push({ ...locate(source, node), type, from, to });
  }
  function module(source: ts.SourceFile, literal: ts.StringLiteralLike) {
    const resolved = ts.resolveModuleName(literal.text, source.fileName, options, host).resolvedModule;
    if (resolved && exists(resolved.resolvedFileName)) relation(source, literal, 'imports', pathOf(source.fileName), pathOf(resolved.resolvedFileName));
    else diagnostic(source, literal, 'source-inaccessible', 'Module cannot be resolved within the evaluated source set.');
  }
  for (const path of inputPaths) {
    if (path.endsWith('.json')) continue;
    const source = program.getSourceFile(`${root}/${path}`);
    if (!source) {
      const unsupported = ts.createSourceFile(`${root}/${path}`, files[path]!, ts.ScriptTarget.Latest, true);
      diagnostic(unsupported, unsupported, 'unsupported-extractor', 'Only TS/TSX is supported by this experiment.');
      continue;
    }
    if (program.getSyntacticDiagnostics(source).length) {
      diagnostic(source, source, 'parse-failed', 'Syntax errors: no authoritative relations emitted from parser recovery.');
      continue;
    }
    function visit(node: ts.Node) {
      if (named(node) && node.name) nodes.add(identity(node));
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) module(source!, node.moduleSpecifier);
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const argument = node.arguments[0];
          if (argument && ts.isStringLiteralLike(argument)) module(source!, argument);
          else diagnostic(source!, node, 'dynamic-reference', 'Nonliteral import target; source set cannot be proven complete.');
        } else {
          const declaration = target(node.expression);
          if (declaration && (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration))) {
            relation(source!, node, 'calls', identity(node), identity(declaration));
          } else if (declaration && (ts.isMethodSignature(declaration) || ts.isParameter(declaration))) {
            diagnostic(source!, node, 'ambiguous-dispatch', 'Interface/parameter is not evidence of a concrete runtime implementation.');
          } else diagnostic(source!, node, 'unresolved-symbol', 'Call target is outside supported direct declaration resolution; no name-based link.');
        }
      }
      if (ts.isNewExpression(node)) diagnostic(source!, node, 'unsupported-extractor', 'Constructor dispatch is not implemented in this bounded experiment.');
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && !/^[a-z]/.test(node.tagName.getText())) {
        const declaration = target(node.tagName);
        if (declaration && ts.isFunctionDeclaration(declaration)) relation(source!, node.tagName, 'renders', identity(node), identity(declaration));
        else diagnostic(source!, node.tagName, 'unresolved-symbol', 'JSX component has no supported concrete declaration.');
      }
      if (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword) {
        for (const type of node.types) {
          const declaration = target(type.expression);
          if (declaration && ts.isInterfaceDeclaration(declaration)) relation(source!, type.expression, 'implements', identity(node), identity(declaration));
          else diagnostic(source!, type, 'unresolved-symbol', 'Implemented interface is unresolved.');
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const ordered = <T>(items: T[]) => items.sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  const facts = { nodes: [...nodes].sort(), files: Object.fromEntries(inputPaths.map(path => [path, digest(files[path]!)])), relations: ordered(relations), diagnostics: ordered(diagnostics) };
  return { ...facts, hash: digest(JSON.stringify(facts)) };
}

/** Exact occurrence scoring: diagnostics may satisfy safe acceptance, never recall. */
export function score(result: Extraction) {
  const occurrence = (a: { path: string; line: number; text: string }, b: { path: string; line: number; text: string }) => a.path === b.path && a.line === b.line && a.text === b.text;
  const same = (a: { type: string; from: string; to: string }, b: { type: string; from: string; to: string }) => a.type === b.type && a.from === b.from && a.to === b.to;
  const falseLinks = result.relations.filter(actual => !oracle.relations.some(expected => same(actual, expected) && occurrence(actual, expected)));
  const cases = oracle.relations.map(expected => ({ case: expected.case,
    status: result.relations.some(actual => same(actual, expected) && occurrence(actual, expected)) ? 'resolved'
      : 'acceptedDiagnostic' in expected && result.diagnostics.some(actual => actual.code === expected.acceptedDiagnostic && occurrence(actual, expected)) ? 'diagnostic' : 'missing',
  }));
  cases.push(...oracle.diagnostics.map(expected => ({ case: expected.case,
    status: result.diagnostics.some(actual => actual.code === expected.code && occurrence(actual, expected)) ? 'diagnostic' : 'missing',
  })));
  const unexpectedDiagnostics = result.diagnostics.filter(actual => !oracle.diagnostics.some(expected => actual.code === expected.code && occurrence(actual, expected))
    && !oracle.relations.some(expected => 'acceptedDiagnostic' in expected && actual.code === expected.acceptedDiagnostic && occurrence(actual, expected)));
  const metrics = Object.fromEntries([...new Set(oracle.relations.map(edge => edge.type))].sort().map(type => {
    const expected = oracle.relations.filter(edge => edge.type === type);
    const actual = result.relations.filter(edge => edge.type === type);
    const truePositives = expected.filter(edge => actual.some(candidate => same(edge, candidate) && occurrence(edge, candidate))).length;
    const falsePositives = falseLinks.filter(edge => edge.type === type).length;
    return [type, { expected: expected.length, truePositives, falsePositives, falseNegatives: expected.length - truePositives,
      precision: truePositives + falsePositives ? truePositives / (truePositives + falsePositives) : null, recall: truePositives / expected.length }];
  }));
  return { cases, metrics, falseLinks, unexpectedDiagnostics };
}