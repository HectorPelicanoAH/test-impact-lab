import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import ts from 'typescript';

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error('No tsconfig');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd()).options;

export function sourceFile(path: string, text = readFileSync(path, 'utf8')) {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

export function moduleReferences(source: ts.SourceFile): string[] {
  const result = new Set<string>();
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      result.add(node.moduleSpecifier.text);
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) {
      result.add(node.moduleReference.expression.text);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      result.add(node.argument.literal.text);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const specifier = node.arguments[0];
      if (!specifier || !ts.isStringLiteral(specifier)) throw new Error(`Non-literal module reference in ${source.fileName}`);
      result.add(specifier.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...result].sort();
}

export function resolveModule(specifier: string, from: string): string | undefined {
  const result = ts.resolveModuleName(specifier, resolve(from), options, ts.sys).resolvedModule;
  if (!result) return undefined;
  return relative(process.cwd(), resolve(result.resolvedFileName)).replaceAll('\\', '/');
}

export function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(path) : [path];
  }).sort();
}

export function testTitles(path: string): string[] {
  const titles: string[] = [];
  const source = sourceFile(path);
  // Catalogue tests deliberately use top-level literal titles, not generated cases.
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const expression = statement.expression;
    if (!ts.isIdentifier(expression.expression) || !['test', 'it'].includes(expression.expression.text)) continue;
    const title = expression.arguments[0];
    if (title && ts.isStringLiteral(title)) titles.push(title.text);
  }
  return titles;
}

export function symbolRange(path: string, symbol: string): { startLine: number; endLine: number } {
  const source = sourceFile(path);
  const parts = symbol.split('.');
  let match: ts.Node | undefined;
  function named(node: ts.Node): string | undefined {
    if ('name' in node) {
      const name = (node as { name?: ts.Node }).name;
      if (name && ts.isIdentifier(name)) return name.text;
    }
    return undefined;
  }
  function visit(node: ts.Node) {
    if (match) return;
    if (parts.length === 1 && named(node) === parts[0]) match = node;
    if (parts.length === 2 && ts.isClassDeclaration(node) && node.name?.text === parts[0]) {
      match = node.members.find(member => parts[1] === 'constructor' ? ts.isConstructorDeclaration(member) : named(member) === parts[1]);
      if (match) return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!match) throw new Error(`Cannot locate symbol ${symbol} in ${path}`);
  return {
    startLine: source.getLineAndCharacterOfPosition(match.getStart(source)).line + 1,
    endLine: source.getLineAndCharacterOfPosition(match.getEnd()).line + 1,
  };
}
