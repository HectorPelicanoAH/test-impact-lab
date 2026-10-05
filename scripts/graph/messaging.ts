import ts from 'typescript';
import { GraphBuilder, hash } from './core';
import { location, parseSource } from './extract';
import type { SourceLocation } from '../../packages/impact-engine/src/schema-v2';

const topologyPath = 'packages/messaging/src/topology.json';
const transportPath = 'packages/messaging/src/transport.ts';
const publisherPath = 'apps/backend/src/orders/OutboxPublisher.ts';
const consumerPath = 'packages/messaging/src/consumer.ts';
const schemaPath = 'packages/api-contract/src/order-created-v1.json';
interface Definition {
  broker: string; environment: string; exchange: string; exchangeType: string; routingKey: string; schema: string; version: number; maxAttempts: number;
  subscriptions: { id: string; queue: string; failedQueue: string; source: string; handler: string }[];
}
function calls(builder: GraphBuilder, path: string, callee: string, argumentTexts: (string | undefined)[], owner?: string): SourceLocation[] {
  if (!builder.files[path]) return [];
  const source = parseSource(path, builder.files[path]!);
  if ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) return [];
  const found: SourceLocation[] = [];
  function visit(node: ts.Node) {
    let parent = node.parent;
    while (parent && !ts.isFunctionDeclaration(parent)) parent = parent.parent;
    if (ts.isCallExpression(node) && node.expression.getText(source) === callee
      && (!owner || (parent && ts.isFunctionDeclaration(parent) && parent.name?.text === owner))
      && argumentTexts.every((text, index) => text === undefined || node.arguments[index]?.getText(source) === text)) found.push(location(source, node));
    ts.forEachChild(node, visit);
  }
  visit(source); return found;
}
function symbol(builder: GraphBuilder, path: string, label: string) {
  return [...builder.nodes.values()].find(node => node.kind === 'symbol' && node.label === label && node.locations.some(loc => loc.path === path));
}
function resolved(builder: GraphBuilder, locators: SourceLocation[], path: string, label: string) {
  const target = symbol(builder, path, label);
  return !!target && locators.length === 1 && [...builder.edges.values()].some(edge => edge.type === 'calls' && edge.to === target.id
    && edge.evidenceIds.some(id => hash(builder.evidence.get(id)!.locator) === hash(locators[0])));
}
function hasSyntax(builder: GraphBuilder, path: string, expected: string, kind: ts.SyntaxKind) {
  const source = parseSource(path, builder.files[path] ?? '');
  const template = parseSource(path, kind === ts.SyntaxKind.VariableDeclaration ? `const ${expected};` : expected);
  function shape(node: ts.Node): unknown[] {
    const children: unknown[] = [];
    ts.forEachChild(node, child => { children.push(shape(child)); });
    return [node.kind, ...(children.length ? children : ['text' in node ? node.text : node.getText()])];
  }
  let expectedText: string | undefined;
  function templateNode(node: ts.Node) { if (node.kind === kind && !expectedText) expectedText = JSON.stringify(shape(node)); ts.forEachChild(node, templateNode); }
  templateNode(template);
  let matches = 0;
  function visit(node: ts.Node) { if (node.kind === kind && JSON.stringify(shape(node)) === expectedText) matches++; ts.forEachChild(node, visit); }
  visit(source); return matches === 1;
}

/** Bounded adapter for the declared RabbitMQ topology and the actual wrappers used by this demo.
 * Configuration evidence is not measured traffic or proof of consumer assertions. */
export function extractMessaging(builder: GraphBuilder) {
  const edge = (...args: Parameters<GraphBuilder['edge']>) => builder.edge(args[0], args[1], args[2], args[3], args[4], { ...args[5], extractor: 'rabbitmq-topology' });
  const text = builder.files[topologyPath];
  if (!text) return; // pre-G5 archives remain valid and have no invented messaging facts
  const configuration = (pointer: string) => ({ kind: 'configuration' as const, path: topologyPath, sourceHash: hash(text), pointer });
  let definition: Definition;
  try { definition = JSON.parse(text) as Definition; }
  catch { builder.diagnostic('parse-failed', 'Messaging topology is not valid JSON.'); return; }
  if (!definition || !['broker', 'environment', 'exchange', 'routingKey', 'schema'].every(key => typeof (definition as unknown as Record<string, unknown>)[key] === 'string')
    || !Array.isArray(definition.subscriptions) || definition.version !== 1 || definition.exchangeType !== 'direct'
    || !definition.subscriptions.every(item => item && [item.id, item.queue, item.failedQueue, item.source, item.handler].every(value => typeof value === 'string'))
    || new Set(definition.subscriptions.map(item => item.id)).size !== definition.subscriptions.length) {
    builder.diagnostic('unsupported-extractor', 'Unsupported messaging topology; no resolved messaging relationships.'); return;
  }
  let schema: { name?: string; version?: number; routingKey?: string } = {};
  try { schema = JSON.parse(builder.files[schemaPath] ?? '{}'); } catch { /* diagnosed below */ }
  if (!schema || schema.name !== definition.schema || schema.version !== definition.version || schema.routingKey !== definition.routingKey) {
    builder.diagnostic('missing-contract', 'Messaging topology and OrderCreated schema disagree; no authoritative publication or subscription.', configuration('/schema')); return;
  }
  const qualifiers = { broker: definition.broker, environment: definition.environment, exchange: definition.exchange,
    routingKey: definition.routingKey, schema: definition.schema, version: String(definition.version) };
  const key = `${definition.environment}:${definition.broker}:${definition.exchange}:${definition.routingKey}:${definition.schema}:v${definition.version}`;
  const broker = builder.node('broker-resource', `${definition.environment}:${definition.broker}`, `${definition.environment}/${definition.broker}`, [], { environment: definition.environment });
  const channel = builder.node('channel', key, `${definition.exchange} / ${definition.routingKey}`, [], qualifiers);
  const schemaSource = parseSource(schemaPath, builder.files[schemaPath]!);
  const eventSchema = builder.node('event-schema', `${definition.schema}:v${definition.version}`, `${definition.schema} v${definition.version}`,
    [location(schemaSource, schemaSource)], { path: schemaPath });
  edge('contains', broker, channel, configuration('/exchange'), 'Explicit broker/environment/channel configuration; sharing a broker does not imply consumer dependence.', { kind: 'configuration', qualifiers });
  edge('implements', channel, eventSchema, configuration('/schema'), 'Routing key explicitly carries the versioned event schema.', { kind: 'configuration', qualifiers });

  const configuredTransport = hasSyntax(builder, transportPath, "import definition from './topology.json';", ts.SyntaxKind.ImportDeclaration)
    && hasSyntax(builder, transportPath, 'return { ...definition, exchange: `${namespace}.${definition.exchange}`, subscriptions: definition.subscriptions.map(item => ({ ...item, queue: `${namespace}.${item.queue}`, failedQueue: `${namespace}.${item.failedQueue}` })) };', ts.SyntaxKind.ReturnStatement);
  const publication = calls(builder, publisherPath, 'confirmed', ['channel', 'layout.exchange', 'layout.routingKey'], 'flushOutbox');
  const wirePublish = calls(builder, transportPath, 'channel.publish', ['exchange', 'routingKey', 'content'], 'confirmed');
  const publisher = symbol(builder, publisherPath, 'flushOutbox');
  if (publisher && configuredTransport && resolved(builder, publication, transportPath, 'confirmed') && wirePublish.length === 1
    && resolved(builder, calls(builder, publisherPath, 'topology', ['namespace'], 'flushOutbox'), transportPath, 'topology')
    && hasSyntax(builder, publisherPath, 'layout = topology(namespace)', ts.SyntaxKind.VariableDeclaration)) {
    edge('publishes', publisher.id, channel, publication[0]!, 'Outbox publisher invokes confirmed AMQP publication using the declared exchange and routing key.', { qualifiers });
    edge('publishes', publisher.id, channel, wirePublish[0]!, 'Confirmed transport performs channel.publish with the routed message.', { qualifiers });
    edge('publishes', publisher.id, channel, configuration('/routingKey'), 'Declared routing identity binds publication to this channel, not any other broker user.', { qualifiers, kind: 'configuration' });
  } else builder.diagnostic('dynamic-reference', 'Outbox publication target cannot be verified; dynamic/unrecognized routing is not promoted to an edge.', configuration('/routingKey'));

  const bindings = calls(builder, transportPath, 'channel.bindQueue', ['subscription.queue', 'layout.exchange', 'layout.routingKey'], 'declareTopology');
  const declaredBinding = configuredTransport && bindings.length === 1 && hasSyntax(builder, transportPath,
    "for (const subscription of layout.subscriptions) { await channel.assertQueue(subscription.queue, { durable: true }); await channel.assertQueue(subscription.failedQueue, { durable: true }); await channel.bindQueue(subscription.queue, layout.exchange, layout.routingKey); }", ts.SyntaxKind.ForOfStatement);
  const consumption = calls(builder, consumerPath, 'channel.consume', ['subscription.queue'], 'startConsumer');
  const service = calls(builder, 'packages/messaging/src/service.ts', 'startConsumer', [undefined], 'runConsumerService');
  const serviceSource = parseSource('packages/messaging/src/service.ts', builder.files['packages/messaging/src/service.ts'] ?? '');
  let forwardsOptions = false;
  function serviceOptions(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(serviceSource) === 'startConsumer') {
      const options = node.arguments[0];
      forwardsOptions = !!options && ts.isObjectLiteralExpression(options) && !options.properties.some(ts.isSpreadAssignment)
        && ['subscription', 'effect'].every(name => {
          const properties = options.properties.filter(property => property.name?.getText(serviceSource) === name);
          return properties.length === 1 && ts.isShorthandPropertyAssignment(properties[0]!);
        });
    }
    ts.forEachChild(node, serviceOptions);
  }
  serviceOptions(serviceSource);
  const selectedQueue = hasSyntax(builder, consumerPath, 'layout = topology(options.namespace)', ts.SyntaxKind.VariableDeclaration)
    && hasSyntax(builder, consumerPath, 'subscription = layout.subscriptions.find(item => item.id === options.subscription)', ts.SyntaxKind.VariableDeclaration)
    && resolved(builder, calls(builder, consumerPath, 'topology', ['options.namespace'], 'startConsumer'), transportPath, 'topology');
  for (const [index, item] of definition.subscriptions.entries()) {
    const registered = calls(builder, item.source, 'runConsumerService', [`'${item.id}'`, item.handler]);
    const handler = symbol(builder, item.source, item.handler);
    const source = builder.files[item.source];
    const imported = source && parseSource(item.source, source).statements.some(node => ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '@test-impact/messaging/service'
      && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
      && node.importClause.namedBindings.elements.some(binding => !binding.propertyName && binding.name.text === 'runConsumerService'));
    const subscription = builder.node('subscription', `${key}:${item.queue}`, item.queue, [], { ...qualifiers, subscription: item.id });
    builder.node('broker-resource', `${definition.environment}:${definition.broker}:${item.failedQueue}`, item.failedQueue, [], { purpose: 'failed-messages', subscription: item.id });
    if (declaredBinding) {
      edge('subscribes', subscription, channel, configuration(`/subscriptions/${index}`), 'Independent queue binding to the qualified broker channel.', { qualifiers, kind: 'configuration' });
      edge('subscribes', subscription, channel, bindings[0]!, 'Transport binds each configured subscription queue to this exchange/routing key.', { qualifiers });
    } else builder.diagnostic('dynamic-reference', `Subscription ${item.id} binding cannot be verified.`, configuration(`/subscriptions/${index}`));
    if (!handler || !resolved(builder, registered, 'packages/messaging/src/service.ts', 'runConsumerService') || !imported
      || !declaredBinding || !selectedQueue || !forwardsOptions || consumption.length !== 1 || !resolved(builder, service, consumerPath, 'startConsumer')) {
      builder.diagnostic('source-inaccessible', `Consumer ${item.id} registration/handler/transport is missing or unsupported; no processes edge.`, configuration(`/subscriptions/${index}`)); continue;
    }
    const consumer = builder.node('consumer', `${definition.environment}:${item.id}`, item.id, handler.locations, { path: item.source });
    edge('realizes', handler.id, consumer, registered[0]!, 'Explicit service registration connects this concrete handler to the consumer.', { qualifiers });
    edge('processes', consumer, subscription, registered[0]!, 'Consumer registers its own handler for the literal configured subscription.', { qualifiers });
    edge('processes', consumer, subscription, consumption[0]!, 'Shared transport consumes the selected queue; not a dependency on sibling consumers.', { qualifiers });
    edge('processes', consumer, subscription, configuration(`/subscriptions/${index}`), 'Binding identifies source, handler and queue; not measured execution.', { qualifiers, kind: 'configuration' });
  }
}