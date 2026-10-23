import { readFile } from 'node:fs/promises';
import { createServer, } from 'node:http';
import { createIndex, queryGraph, summary, } from '../core.mjs';
import { createWorkspaceIndex, workspaceSummary, } from "./createWorkspaceIndex.js";
import { graphScene } from "./graphScene.js";
import { legacyWorkspace } from "./legacyWorkspace.js";
import { queryWorkspace } from "./queryWorkspace.js";
import { readSourceRecord } from "./sourceRecord.js";
import { workspaceDetail } from "./workspaceDetail.js";
const LOCAL_HOST = /^127\.0\.0\.1(?::\d+)?$|^localhost(?::\d+)?$/;
const ASSETS = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['dist/explorer.js', 'text/javascript; charset=utf-8']],
    ['/styles.css', ['dist/explorer.css', 'text/css; charset=utf-8']],
]);
const sendJson = (response, status, value) => {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(value));
};
const exploreApi = (index, url, sourceRoot) => {
    const options = Object.fromEntries(url.searchParams);
    if (url.pathname === '/api/workspace') {
        return workspaceSummary(index);
    }
    if (url.pathname === '/api/scene') {
        return graphScene(index);
    }
    if (url.pathname === '/api/explore') {
        return queryWorkspace(index, options.section ?? 'graph', options);
    }
    if (url.pathname === '/api/detail') {
        const detail = workspaceDetail(index, options.type ?? 'node', options.id ?? '', options);
        if (!detail.source) {
            return detail;
        }
        const source = readSourceRecord(detail.source, sourceRoot);
        return {
            ...detail,
            source,
            columns: { ...detail.columns, Status: source.status },
        };
    }
    throw new Error('Unknown API route');
};
export const createExplorer = (model, options = {}) => {
    const index = createWorkspaceIndex(model);
    const legacy = options.legacy ? createIndex(options.legacy) : null;
    return createServer(async (request, response) => {
        response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Cache-Control', 'no-store');
        try {
            if (!acceptRequest(request, response)) {
                return;
            }
            await dispatchRequest(request, response, index, options, legacy);
        }
        catch (error) {
            requestError(response, error);
        }
    });
};
const serveAsset = async (path, response) => {
    const asset = ASSETS.get(path);
    if (!asset) {
        sendJson(response, 404, { error: 'Not found.' });
        return;
    }
    const body = await readFile(new URL(`../../ui/${asset[0]}`, import.meta.url));
    response.writeHead(200, { 'Content-Type': asset[1] });
    response.end(body);
};
export const listenExplorer = async (model, port = 0, options = {}) => {
    const server = createExplorer(model, options);
    await new Promise((fulfill, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', fulfill);
    });
    return server;
};
const legacyApi = (index, url) => {
    const options = Object.fromEntries(url.searchParams);
    const offset = Math.max(0, Math.trunc(Number(options.offset)) || 0);
    if (url.pathname === '/api/summary') {
        return summary(index);
    }
    if (url.pathname === '/api/graph') {
        return queryGraph(index, options);
    }
    if (url.pathname === '/api/diagnostics') {
        const limit = Math.max(1, Math.min(50, Number(options.limit) || 10));
        return {
            items: index.snapshot.diagnostics.slice(offset, offset + limit),
            total: index.snapshot.diagnostics.length,
            offset,
            limit,
        };
    }
    if (url.pathname === '/api/node') {
        return legacyNode(index, options, offset);
    }
    if (url.pathname === '/api/evidence') {
        return legacyEvidence(index, options);
    }
    throw new Error('Not found.');
};
export const explorerFromLegacy = (snapshot) => createExplorer(legacyWorkspace(snapshot), { legacy: snapshot });
const dispatchRequest = async (request, response, index, options, legacy) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
        const useLegacy = legacy &&
            !['/api/workspace', '/api/explore', '/api/detail', '/api/scene'].includes(url.pathname);
        sendJson(response, 200, useLegacy
            ? legacyApi(legacy, url)
            : exploreApi(index, url, options.sourceRoot));
        return;
    }
    await serveAsset(url.pathname, response);
};
const legacyNode = (index, options, offset) => {
    const node = index.nodes.get(options.id);
    if (!node) {
        throw new Error('Unknown node.');
    }
    const links = [
        ...new Map([
            ...(index.incoming.get(node.id) ?? []),
            ...(index.outgoing.get(node.id) ?? []),
        ].map((edge) => [edge.id, edge])).values(),
    ];
    return {
        node,
        totalLinks: links.length,
        offset,
        links: links.slice(offset, offset + 50).map((edge) => ({
            ...edge,
            fromLabel: index.nodes.get(edge.from)?.label,
            toLabel: index.nodes.get(edge.to)?.label,
        })),
    };
};
const legacyEvidence = (index, options) => {
    const evidence = index.evidence.get(options.id);
    if (!evidence) {
        throw new Error('Unknown evidence.');
    }
    const path = evidence.locator?.path;
    return {
        evidence,
        source: path && Object.hasOwn(index.snapshot.sources, path)
            ? { path, content: index.snapshot.sources[path] }
            : null,
    };
};
const acceptRequest = (request, response) => {
    if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'Read-only viewer.' });
        return false;
    }
    if (!LOCAL_HOST.test(request.headers.host ?? '')) {
        sendJson(response, 403, { error: 'Local host required.' });
        return false;
    }
    return true;
};
const requestError = (response, error) => {
    if (!response.headersSent) {
        sendJson(response, 404, {
            error: error instanceof Error ? error.message : 'Could not read this view.',
        });
    }
    else {
        response.end();
    }
};
