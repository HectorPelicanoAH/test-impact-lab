import ts from 'typescript';
import type { DiscoveryConfig, SourceFiles } from '../../packages/impact-engine/src/schema-v2';
import { GraphBuilder, hash, nodeId } from './core';
import { extractTypescript, location, parseSource } from './extract';

export const inventoryPrefix = 'external/inventory/';
export function externalTests(files: SourceFiles) {
  const result: { id: string; title: string; path: string; availability: 'local' | 'inaccessible'; execution: 'not-integrated' }[] = [];
  for (const [path, content] of Object.entries(files).filter(([path]) => path.startsWith(`${inventoryPrefix}test/`)).sort()) {
    const source = parseSource(path, content);
    for (const statement of source.statements) {
      if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)
        || !ts.isIdentifier(statement.expression.expression) || statement.expression.expression.text !== 'test'
        || !statement.expression.arguments[0] || !ts.isStringLiteral(statement.expression.arguments[0])) continue;
      const title = statement.expression.arguments[0].text;
      result.push({ id: nodeId({ productId: 'inventory', repositoryId: 'external-inventory' }, 'test', `${path}#${title}`),
        title, path, availability: 'local', execution: 'not-integrated' });
    }
  }
  return result;
}
interface Binding {
  environment: string; service: string; repository: { productId: string; repositoryId: string };
  contract: { version: number; method: string; path: string; client: string; provider: string };
  consumer: { path: string; function: string }; provider: { path: string; function: string };
}

function validatedBinding(files: SourceFiles, configuration: SourceFiles): { binding: Binding; compatible: boolean } {
  const binding = JSON.parse(configuration['impact/inventory-binding.json']!) as Binding;
  const local = files[binding.contract.client];
  const remote = files[binding.contract.provider];
  if (binding.environment !== 'local' || binding.service !== 'inventory' || binding.repository.productId !== 'inventory'
    || binding.repository.repositoryId !== 'external-inventory' || binding.contract.version !== 1
    || binding.contract.method !== 'GET' || binding.contract.path !== '/v1/stock/:sku' || !local) throw new Error('Unsupported inventory binding/contract.');
  const declared = JSON.parse(local) as Record<string, unknown>;
  return { binding, compatible: declared.version === binding.contract.version && declared.environment === binding.environment
    && declared.service === binding.service && declared.method === binding.contract.method && declared.path === binding.contract.path
    && (remote === undefined || remote === local) };
}

function verifiedClient(files: SourceFiles, path: string, enclosing: string, method: string): ReturnType<typeof location> | undefined {
  const text = files[path];
  if (!text) return undefined;
  const source = parseSource(path, text);
  if ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) return undefined;
  const calls: ts.CallExpression[] = [];
  function visit(node: ts.Node, inside = false) {
    const scope = inside || (ts.isFunctionDeclaration(node) && node.name?.text === enclosing)
      || (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === enclosing);
    if (scope && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'fetcher') {
      const url = node.arguments[0], options = node.arguments[1];
      const route = url && ts.isNewExpression(url) && ts.isIdentifier(url.expression) && url.expression.text === 'URL' && url.arguments?.[0];
      const pathCall = route && ts.isCallExpression(route) && ts.isPropertyAccessExpression(route.expression) && route.expression.name.text === 'replace'
        && ts.isIdentifier(route.expression.expression) && route.expression.expression.text === 'INVENTORY_PATH';
      const httpMethod = options && ts.isObjectLiteralExpression(options) && options.properties.find(property =>
        ts.isPropertyAssignment(property) && property.name.getText(source) === 'method' && ts.isStringLiteral(property.initializer)
        && property.initializer.text === method);
      if (pathCall && httpMethod) calls.push(node);
    }
    ts.forEachChild(node, child => visit(child, scope));
  }
  visit(source);
  return calls.length === 1 ? location(source, calls[0]!) : undefined;
}

/** Recognize only the provider's supported GET route guard, not an unrelated health check or a matching URL in a comment. */
function verifiedProvider(files: SourceFiles, path: string, enclosing: string, method: string, template: string): ReturnType<typeof location> | undefined {
  const text = files[path];
  if (!text) return undefined;
  const source = parseSource(path, text);
  if ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) return undefined;
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === enclosing);
  if (!declaration || !ts.isFunctionDeclaration(declaration) || !declaration.body) return undefined;
  const servers: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createServer') servers.push(node);
    ts.forEachChild(node, visit);
  }
  visit(declaration.body);
  if (servers.length !== 1) return undefined;
  const server = servers[0]!;
  const callback = server.arguments[0];
  if (!callback || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) || !ts.isBlock(callback.body)) return undefined;
  const match = callback.body.statements.find(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(item =>
    ts.isIdentifier(item.name) && item.name.text === 'match' && item.initializer && ts.isCallExpression(item.initializer)
    && ts.isPropertyAccessExpression(item.initializer.expression) && item.initializer.expression.name.text === 'exec'
    && ts.isRegularExpressionLiteral(item.initializer.expression.expression)
    && item.initializer.expression.expression.text === String.raw`/^\/v1\/stock\/([a-z0-9-]{1,40})$/`));
  if (!match) return undefined;
  const clauses = (node: ts.Expression): ts.Expression[] => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken
    ? [...clauses(node.left), ...clauses(node.right)] : [node];
  const comparison = (node: ts.Expression, left: string, right: string) => ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
    && node.left.getText(source) === left && ts.isStringLiteral(node.right) && node.right.text === right;
  const guard = callback.body.statements.find(statement => {
    if (!ts.isIfStatement(statement) || !ts.isBlock(statement.thenStatement)) return false;
    const terms = clauses(statement.expression);
    return terms.some(term => comparison(term, 'request.method', method))
      && terms.some(term => ts.isPrefixUnaryExpression(term) && term.operator === ts.SyntaxKind.ExclamationToken && ts.isIdentifier(term.operand) && term.operand.text === 'match')
      && terms.some(term => comparison(term, 'INVENTORY_PATH', template))
      && statement.thenStatement.statements.some(item => ts.isReturnStatement(item));
  });
  return guard ? location(source, server) : undefined;
}

/** Bind explicit service+environment+method+template+version only when both declarations and source occurrences agree. */
export function extractInventoryHttp(builder: GraphBuilder, files: SourceFiles, config: DiscoveryConfig, revision?: string) {
  const { binding, compatible } = validatedBinding(files, builder.configuration);
  const key = `${binding.environment}:${binding.service}:${binding.contract.method}:${binding.contract.path}:v${binding.contract.version}`;
  const service = nodeId(binding.repository, 'service', `${binding.environment}:${binding.service}`);
  const endpoint = nodeId(binding.repository, 'endpoint', key);
  const contract = nodeId(binding.repository, 'http-contract', key);
  const template = builder.configuration['impact/inventory-binding.json']!;
  const bindingLocator = { kind: 'configuration' as const, path: 'impact/inventory-binding.json', sourceHash: hash(template), pointer: '/contract' };
  const localContract = { kind: 'configuration' as const, path: binding.contract.client, sourceHash: hash(files[binding.contract.client]!), pointer: '/path' };
  if (!compatible) {
    builder.diagnostic('missing-contract', 'Inventory contract diverges between client, qualified binding and/or provider; no cross-repository edge is asserted.', bindingLocator);
    return;
  }
  const clientCall = verifiedClient(files, binding.consumer.path, binding.consumer.function, binding.contract.method);
  if (!clientCall) builder.diagnostic('missing-contract', 'Inventory client HTTP call could not be verified; no endpoint invocation asserted.', localContract);
  else {
    const client = [...builder.nodes.values()].find(node => node.kind === 'symbol' && (node.label === binding.consumer.function || node.label.endsWith(`.${binding.consumer.function}`))
      && node.locations.some(item => item.path === binding.consumer.path))?.id;
    // The nested named function is a declaration in the local TypeScript graph; never create an orphan endpoint fact.
    if (client && builder.nodes.has(client)) {
      builder.nodes.set(endpoint, { id: endpoint, ...binding.repository, kind: 'endpoint', label: `GET ${binding.contract.path} (${binding.environment}/${binding.service})`, locations: [], attributes: { service: binding.service, environment: binding.environment, version: binding.contract.version } });
      builder.nodes.set(service, { id: service, ...binding.repository, kind: 'service', label: `${binding.environment}/${binding.service}`, locations: [], attributes: { environment: binding.environment } });
      builder.nodes.set(contract, { id: contract, ...binding.repository, kind: 'http-contract', label: `Inventory stock v${binding.contract.version}`, locations: [], attributes: { version: binding.contract.version } });
      builder.edge('invokes-endpoint', client, endpoint, clientCall,
        `Versioned ${binding.contract.method} call binds ${binding.environment}/${binding.service}; URL alone is insufficient.`,
        { qualifiers: { environment: binding.environment, service: binding.service, method: binding.contract.method, template: binding.contract.path, version: String(binding.contract.version) } });
      builder.edge('implements', endpoint, contract, localContract, 'Qualified endpoint implements the versioned client contract.', { kind: 'configuration' });
      builder.edge('contains', service, endpoint, bindingLocator, 'Service owns the qualified endpoint in the reviewed binding.', { kind: 'configuration' });
    } else builder.diagnostic('missing-contract', 'Inventory client declaration is absent; cross-service edge omitted.', clientCall);
  }
  if (!revision) {
    builder.diagnostic('source-inaccessible', 'Inventory provider source and tests are inaccessible; contract-only visibility, no external execution claimed.', bindingLocator);
    return;
  }
  const providerCall = verifiedProvider(files, binding.provider.path, binding.provider.function, binding.contract.method, binding.contract.path);
  if (!providerCall || !builder.nodes.has(endpoint)) {
    builder.diagnostic('missing-contract', 'Provider source does not verify the bound inventory endpoint.', bindingLocator);
    return;
  }
  const provider = nodeId(binding.repository, 'symbol', `${binding.provider.path}#${binding.provider.function}:FunctionDeclaration`);
  if (!builder.nodes.has(provider)) { builder.diagnostic('missing-contract', 'Provider declaration is inaccessible.', bindingLocator); return; }
  builder.edge('exposes', endpoint, provider, providerCall, 'Provider creates the route-bound HTTP server in its own repository.',
    { qualifiers: { environment: binding.environment, service: binding.service, version: String(binding.contract.version) },
      repository: binding.repository, revision });
}

export function extractExternalRepository(builder: GraphBuilder, allSources: SourceFiles, configuration: SourceFiles, revision: string) {
  const external = Object.fromEntries(Object.entries(allSources).filter(([path]) => path.startsWith(inventoryPrefix)));
  const config: DiscoveryConfig = { ...builder.config, productId: 'inventory', repositoryId: 'external-inventory', roots: ['external/inventory/src'], moduleAliases: {}, routeModules: [] };
  const externalBuilder = new GraphBuilder(external, config, configuration, revision);
  extractTypescript(externalBuilder);
  for (const node of externalBuilder.nodes.values()) builder.nodes.set(node.id, node);
  for (const edge of externalBuilder.edges.values()) builder.edges.set(edge.id, edge);
  for (const policy of externalBuilder.policies.values()) builder.policies.set(policy.id, policy);
  for (const proof of externalBuilder.evidence.values()) builder.evidence.set(proof.id, { ...proof, extractor: { ...proof.extractor, configurationHash: builder.configurationHash } });
  for (const diagnostic of externalBuilder.diagnostics.values()) builder.diagnostics.set(diagnostic.id, diagnostic);
  for (const test of externalTests(allSources)) {
    const source = parseSource(test.path, allSources[test.path]!);
    const statement = source.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
      && !!node.expression.arguments[0] && ts.isStringLiteral(node.expression.arguments[0]) && node.expression.arguments[0].text === test.title);
    if (statement) builder.nodes.set(test.id, { id: test.id, kind: 'test', productId: 'inventory', repositoryId: 'external-inventory',
      label: test.title, locations: [location(source, statement)], attributes: { path: test.path, execution: 'not-integrated' } });
  }
}
