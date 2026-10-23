import { readFile } from 'node:fs/promises'
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from 'node:http'
import {
	createIndex,
	type LegacySnapshot,
	queryGraph,
	summary,
} from '../core.mjs'
import {
	createWorkspaceIndex,
	workspaceSummary,
} from './createWorkspaceIndex.ts'
import { graphScene } from './graphScene.ts'
import { legacyWorkspace } from './legacyWorkspace.ts'
import { queryWorkspace } from './queryWorkspace.ts'
import { readSourceRecord } from './sourceRecord.ts'
import type { Workspace, WorkspaceIndex } from './types.ts'
import { workspaceDetail } from './workspaceDetail.ts'

interface ExplorerOptions {
	readonly legacy?: LegacySnapshot
	readonly sourceRoot?: string
}
const LOCAL_HOST = /^127\.0\.0\.1(?::\d+)?$|^localhost(?::\d+)?$/
const ASSETS = new Map([
	['/', ['index.html', 'text/html; charset=utf-8']],
	['/app.js', ['dist/explorer.js', 'text/javascript; charset=utf-8']],
	['/styles.css', ['dist/explorer.css', 'text/css; charset=utf-8']],
])
const sendJson = (
	response: ServerResponse,
	status: number,
	value: unknown
): void => {
	response.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
	})
	response.end(JSON.stringify(value))
}
const exploreApi = (
	index: WorkspaceIndex,
	url: URL,
	sourceRoot?: string
): unknown => {
	const options = Object.fromEntries(url.searchParams)
	if (url.pathname === '/api/workspace') {
		return workspaceSummary(index)
	}
	if (url.pathname === '/api/scene') {
		return graphScene(index)
	}
	if (url.pathname === '/api/explore') {
		return queryWorkspace(index, options.section ?? 'graph', options)
	}
	if (url.pathname === '/api/detail') {
		const detail = workspaceDetail(
			index,
			options.type ?? 'node',
			options.id ?? '',
			options
		)
		if (!detail.source) {
			return detail
		}
		const source = readSourceRecord(detail.source, sourceRoot)
		return {
			...detail,
			source,
			columns: { ...detail.columns, Status: source.status },
		}
	}
	throw new Error('Unknown API route')
}
export const createExplorer = (
	model: Workspace,
	options: ExplorerOptions = {}
) => {
	const index = createWorkspaceIndex(model)
	const legacy = options.legacy ? createIndex(options.legacy) : null
	return createServer(async (request, response) => {
		response.setHeader(
			'Content-Security-Policy',
			"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
		)
		response.setHeader('X-Content-Type-Options', 'nosniff')
		response.setHeader('Cache-Control', 'no-store')
		try {
			if (!acceptRequest(request, response)) {
				return
			}
			await dispatchRequest(request, response, index, options, legacy)
		} catch (error) {
			requestError(response, error)
		}
	})
}
const serveAsset = async (
	path: string,
	response: ServerResponse
): Promise<void> => {
	const asset = ASSETS.get(path)
	if (!asset) {
		sendJson(response, 404, { error: 'Not found.' })
		return
	}
	const body = await readFile(new URL(`../../ui/${asset[0]}`, import.meta.url))
	response.writeHead(200, { 'Content-Type': asset[1] })
	response.end(body)
}
export const listenExplorer = async (
	model: Workspace,
	port = 0,
	options: ExplorerOptions = {}
) => {
	const server = createExplorer(model, options)
	await new Promise<void>((fulfill, reject) => {
		server.once('error', reject)
		server.listen(port, '127.0.0.1', fulfill)
	})
	return server
}
const legacyApi = (
	index: ReturnType<typeof createIndex>,
	url: URL
): unknown => {
	const options = Object.fromEntries(url.searchParams)
	const offset = Math.max(0, Math.trunc(Number(options.offset)) || 0)
	if (url.pathname === '/api/summary') {
		return summary(index)
	}
	if (url.pathname === '/api/graph') {
		return queryGraph(index, options)
	}
	if (url.pathname === '/api/diagnostics') {
		const limit = Math.max(1, Math.min(50, Number(options.limit) || 10))
		return {
			items: index.snapshot.diagnostics.slice(offset, offset + limit),
			total: index.snapshot.diagnostics.length,
			offset,
			limit,
		}
	}
	if (url.pathname === '/api/node') {
		return legacyNode(index, options, offset)
	}
	if (url.pathname === '/api/evidence') {
		return legacyEvidence(index, options)
	}

	throw new Error('Not found.')
}
export const explorerFromLegacy = (snapshot: LegacySnapshot) =>
	createExplorer(legacyWorkspace(snapshot), { legacy: snapshot })

const dispatchRequest = async (
	request: IncomingMessage,
	response: ServerResponse,
	index: WorkspaceIndex,
	options: ExplorerOptions,
	legacy: ReturnType<typeof createIndex> | null
): Promise<void> => {
	const url = new URL(request.url ?? '/', 'http://localhost')
	if (url.pathname.startsWith('/api/')) {
		const useLegacy =
			legacy &&
			!['/api/workspace', '/api/explore', '/api/detail', '/api/scene'].includes(
				url.pathname
			)
		sendJson(
			response,
			200,
			useLegacy
				? legacyApi(legacy, url)
				: exploreApi(index, url, options.sourceRoot)
		)
		return
	}
	await serveAsset(url.pathname, response)
}
const legacyNode = (
	index: ReturnType<typeof createIndex>,
	options: Record<string, string>,
	offset: number
): unknown => {
	const node = index.nodes.get(options.id)
	if (!node) {
		throw new Error('Unknown node.')
	}
	const links = [
		...new Map(
			[
				...(index.incoming.get(node.id) ?? []),
				...(index.outgoing.get(node.id) ?? []),
			].map((edge) => [edge.id, edge])
		).values(),
	]
	return {
		node,
		totalLinks: links.length,
		offset,
		links: links.slice(offset, offset + 50).map((edge) => ({
			...edge,
			fromLabel: index.nodes.get(edge.from)?.label,
			toLabel: index.nodes.get(edge.to)?.label,
		})),
	}
}
const legacyEvidence = (
	index: ReturnType<typeof createIndex>,
	options: Record<string, string>
): unknown => {
	const evidence = index.evidence.get(options.id)
	if (!evidence) {
		throw new Error('Unknown evidence.')
	}
	const path = evidence.locator?.path
	return {
		evidence,
		source:
			path && Object.hasOwn(index.snapshot.sources, path)
				? { path, content: index.snapshot.sources[path] }
				: null,
	}
}

const acceptRequest = (
	request: IncomingMessage,
	response: ServerResponse
): boolean => {
	if (request.method !== 'GET') {
		sendJson(response, 405, { error: 'Read-only viewer.' })
		return false
	}
	if (!LOCAL_HOST.test(request.headers.host ?? '')) {
		sendJson(response, 403, { error: 'Local host required.' })
		return false
	}
	return true
}

const requestError = (response: ServerResponse, error: unknown): void => {
	if (!response.headersSent) {
		sendJson(response, 404, {
			error:
				error instanceof Error ? error.message : 'Could not read this view.',
		})
	} else {
		response.end()
	}
}
