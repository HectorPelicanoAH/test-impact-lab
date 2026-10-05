import { posix } from 'node:path';
import ts from 'typescript';
import type { SourceLocation } from '../../packages/impact-engine/src/schema-v2';
import { GraphBuilder, hash } from './core';

export function location(source: ts.SourceFile, node: ts.Node): SourceLocation {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.getEnd());
  return { kind: 'source', path: source.fileName.replace(/^\/__impact__\//, ''), sourceHash: hash(source.text),
    start: { line: start.line + 1, column: start.character + 1 }, end: { line: end.line + 1, column: end.character + 1 } };
}
export const parseSource = (path: string, text: string) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** Compiler program over immutable source bytes. No fallback to the live checkout/node_modules. */
export function extractTypescript(builder: GraphBuilder) {
  const { files, config } = builder;
  const root = '/__impact__';
  const relative = (path: string) => posix.relative(root, path);
  const sourcePaths = Object.keys(files).filter(path => config.roots.some(root => path.startsWith(`${root}/`)) && !/\.(test|spec)\.tsx?$/.test(path)).sort();
  const configText = builder.configuration['tsconfig.json'];
  const parsed = configText ? ts.parseConfigFileTextToJson('tsconfig.json', configText) : { config: { compilerOptions: {} } };
  if (parsed.error) throw new Error('Invalid TypeScript configuration.');
  const converted = ts.convertCompilerOptionsFromJson(parsed.config.compilerOptions ?? {}, root);
  if (converted.errors.length) throw new Error('Unsupported TypeScript compiler configuration.');
  const options: ts.CompilerOptions = { ...converted.options, types: [], noLib: true, noEmit: true, jsx: ts.JsxEmit.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext,
    baseUrl: root, paths: { ...(converted.options.paths ?? {}), ...Object.fromEntries(Object.entries(config.moduleAliases).map(([key, path]) => [key, [path]])) } };
  const host: ts.CompilerHost = {
    fileExists: path => files[relative(path)] !== undefined,
    readFile: path => files[relative(path)],
    directoryExists: path => Object.keys(files).some(file => `${root}/${file}`.startsWith(`${path}/`)), getDirectories: () => [],
    getCurrentDirectory: () => root, getCanonicalFileName: path => path, useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n', getDefaultLibFileName: () => `${root}/no-lib.d.ts`, writeFile: () => {},
    getSourceFile: path => files[relative(path)] === undefined ? undefined : parseSource(path, files[relative(path)]!),
  };
  const program = ts.createProgram(sourcePaths.filter(path => /\.tsx?$/.test(path)).map(path => `${root}/${path}`), options, host);
  const checker = program.getTypeChecker();
  const declarationIds = new Map<ts.Node, string>();
  const valid = new Set<ts.SourceFile>();
  const fileIds = new Map<string, string>();

  function declaredName(node: ts.Node): string | undefined {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
      || ts.isEnumDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isVariableDeclaration(node)
      || ts.isPropertyDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) && node.name && ts.isIdentifier(node.name)) return node.name.text;
    if (ts.isConstructorDeclaration(node)) return 'constructor';
    return undefined;
  }
  function qualified(node: ts.Node) {
    const parts: string[] = [];
    let parent: ts.Node | undefined = node;
    while (parent && !ts.isSourceFile(parent)) {
      const name = declaredName(parent);
      if (name) parts.unshift(name);
      parent = parent.parent;
    }
    return parts.join('.');
  }
  function diagnose(source: ts.SourceFile, node: ts.Node, code: string, message: string) {
    builder.diagnostic(code, message, location(source, node));
  }
  for (const path of sourcePaths) {
    const source = program.getSourceFile(`${root}/${path}`) ?? parseSource(`${root}/${path}`, files[path]!);
    const file = builder.node('file', path, path, [location(source, source)], { path });
    fileIds.set(path, file);
    if (!/\.tsx?$/.test(path)) {
      if (!/\.(css|json)$/.test(path)) diagnose(source, source, 'unsupported-extractor', `No extractor for ${path}; file remains inventoried.`);
      continue;
    }
    if (program.getSyntacticDiagnostics(source).length) {
      diagnose(source, source, 'parse-failed', `Edited file contains syntax errors: ${path}`);
      continue;
    }
    valid.add(source);
    const groups = new Map<string, ts.Node[]>();
    function collect(node: ts.Node) {
      const name = declaredName(node);
      if (name) {
        const key = `${path}#${qualified(node)}:${ts.SyntaxKind[node.kind]}`;
        groups.set(key, [...(groups.get(key) ?? []), node]);
      }
      ts.forEachChild(node, collect);
    }
    collect(source);
    for (const [key, declarations] of groups) {
      // Only genuine compiler-merged overload declarations can share a symbol identity.
      const symbols = declarations.map(node => 'name' in node && (node as ts.NamedDeclaration).name ? checker.getSymbolAtLocation((node as ts.NamedDeclaration).name!) : undefined);
      if (declarations.length > 1 && (!symbols[0] || symbols.some(symbol => symbol !== symbols[0]))) {
        for (const declaration of declarations) diagnose(source, declaration, 'identity-collision', `Ambiguous lexical identity: ${key}`);
        continue;
      }
      const id = builder.node('symbol', key, qualified(declarations[0]!), declarations.map(node => location(source, node)), { path, declarationKind: ts.SyntaxKind[declarations[0]!.kind] });
      for (const declaration of declarations) declarationIds.set(declaration, id);
      builder.edge('contains', file, id, location(source, declarations[0]!), 'File contains this compiler declaration.');
    }
  }
  function resolveDeclaration(expression: ts.Node): ts.Declaration | undefined {
    let symbol = checker.getSymbolAtLocation(expression);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const declarations = symbol?.declarations?.filter(item => declarationIds.has(item)) ?? [];
    if (new Set(declarations.map(item => declarationIds.get(item))).size !== 1) return undefined;
    return declarations.find(item => 'body' in item && item.body) ?? declarations[0];
  }
  function owner(node: ts.Node, source: ts.SourceFile): string {
    let current: ts.Node | undefined = node.parent;
    while (current && !ts.isSourceFile(current)) {
      if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
        if (ts.isVariableDeclaration(current.parent)) return declarationIds.get(current.parent) ?? fileIds.get(relative(source.fileName))!;
        return fileIds.get(relative(source.fileName))!; // module/anonymous callback context, never a fabricated named caller
      }
      if (declarationIds.has(current) && (ts.isFunctionLike(current) || ts.isVariableDeclaration(current))) return declarationIds.get(current)!;
      current = current.parent;
    }
    return fileIds.get(relative(source.fileName))!;
  }
  function moduleReference(source: ts.SourceFile, literal: ts.StringLiteralLike, syntax: string, typeOnly: boolean) {
    const resolved = ts.resolveModuleName(literal.text, source.fileName, options, host).resolvedModule;
    const asset = literal.text.startsWith('.') ? posix.normalize(posix.join(posix.dirname(relative(source.fileName)), literal.text)) : config.moduleAliases[literal.text];
    const path = resolved ? relative(resolved.resolvedFileName) : asset;
    const target = path ? fileIds.get(path) : undefined;
    if (target) builder.edge('imports', fileIds.get(relative(source.fileName))!, target, location(source, literal), `Module ${literal.text} resolves to ${path}.`, { qualifiers: { specifier: literal.text, syntax, typeOnly } });
    else diagnose(source, literal, 'source-inaccessible', `Module ${literal.text} has no source inside the versioned product roots.`);
  }
  function route(source: ts.SourceFile, node: ts.JsxSelfClosingElement | ts.JsxOpeningElement) {
    if (!ts.isIdentifier(node.tagName)) return;
    const symbol = checker.getSymbolAtLocation(node.tagName);
    const declaration = symbol?.declarations?.find(ts.isImportSpecifier);
    if (!declaration || (declaration.propertyName ?? declaration.name).text !== 'Route') return;
    const importNode = declaration.parent.parent.parent;
    if (!ts.isImportDeclaration(importNode) || !ts.isStringLiteral(importNode.moduleSpecifier) || !config.routeModules.includes(importNode.moduleSpecifier.text)) return;
    const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
    const path = attributes.find(attribute => attribute.name.getText() === 'path')?.initializer;
    const element = attributes.find(attribute => attribute.name.getText() === 'element')?.initializer;
    if (!path || !ts.isStringLiteral(path) || !element || !ts.isJsxExpression(element) || !element.expression || !ts.isJsxSelfClosingElement(element.expression)) {
      diagnose(source, node, 'dynamic-reference', 'Route requires a literal path and a direct element={<Component />}.');
      return;
    }
    const target = resolveDeclaration(element.expression.tagName);
    if (!target) { diagnose(source, node, 'unresolved-symbol', 'Route component is not resolved.'); return; }
    const key = `${relative(source.fileName)}#${path.text}`;
    const routeId = builder.node('route', key, path.text, [location(source, node)], { path: relative(source.fileName), route: path.text });
    const screenId = builder.node('screen', key, `Screen ${path.text}`, [location(source, element.expression)], { path: relative(source.fileName) });
    builder.edge('routes', routeId, declarationIds.get(target)!, location(source, node), 'Supported imported React Router Route binds a literal path to a resolved component.');
    builder.edge('realizes', declarationIds.get(target)!, screenId, location(source, node), 'Component realizes the screen bound by this route.');
  }
  for (const source of valid) {
    function visit(node: ts.Node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        moduleReference(source, node.moduleSpecifier, ts.isImportDeclaration(node) ? 'import' : 'reexport', ts.isImportDeclaration(node) ? Boolean(node.importClause?.isTypeOnly) : node.isTypeOnly);
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) moduleReference(source, node.argument.literal, 'import-type', true);
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) moduleReference(source, node.moduleReference.expression, 'import-equals', false);
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require' && !checker.getSymbolAtLocation(node.expression)?.declarations?.length)) {
          const argument = node.arguments[0];
          if (argument && ts.isStringLiteralLike(argument)) moduleReference(source, argument, 'dynamic-literal', false);
          else diagnose(source, node, 'dynamic-reference', 'Nonliteral module target; no safe dependency scope can be proven.');
        } else {
          const target = resolveDeclaration(node.expression);
          const callable = target && (ts.isFunctionDeclaration(target) || ts.isMethodDeclaration(target)
            || (ts.isVariableDeclaration(target) && target.initializer && (ts.isArrowFunction(target.initializer) || ts.isFunctionExpression(target.initializer))));
          if (target && callable && !target.getSourceFile().isDeclarationFile) builder.edge('calls', owner(node, source), declarationIds.get(target)!, location(source, node), 'Compiler resolves this call to a concrete declaration; not a runtime execution claim.');
          else diagnose(source, node, target && ts.isMethodSignature(target) ? 'ambiguous-dispatch' : 'unresolved-symbol', 'Call has no supported concrete target in this snapshot; no name-based dependency is asserted.');
        }
      }
      if (ts.isNewExpression(node)) {
        const target = resolveDeclaration(node.expression);
        if (target && ts.isClassDeclaration(target)) builder.edge('calls', owner(node, source), declarationIds.get(target)!, location(source, node), 'Direct construction resolves to this local class.');
        else diagnose(source, node, 'unresolved-symbol', 'Constructor target is not present in this snapshot.');
      }
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        route(source, node);
        if (!/^[a-z]/.test(node.tagName.getText())) {
          const target = resolveDeclaration(node.tagName);
          if (target) builder.edge('renders', owner(node, source), declarationIds.get(target)!, location(source, node.tagName), 'JSX tag resolves to a compiler declaration.');
          else diagnose(source, node.tagName, 'unresolved-symbol', 'JSX component has no local source declaration.');
        }
      }
      if (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword) {
        for (const type of node.types) {
          const target = resolveDeclaration(type.expression), from = declarationIds.get(node.parent);
          if (from && target && ts.isInterfaceDeclaration(target)) builder.edge('implements', from, declarationIds.get(target)!, location(source, type), 'Explicit implements clause resolves to this local interface.');
          else diagnose(source, type, 'unresolved-symbol', 'Implemented interface is not resolved.');
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return { program, declarationIds, fileIds };
}