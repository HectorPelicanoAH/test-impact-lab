import {
	createWorkspaceIndex,
	workspaceSummary,
} from '../../src/viewer/createWorkspaceIndex.ts'
import { type GraphScene, graphScene } from '../../src/viewer/graphScene.ts'
import { queryWorkspace } from '../../src/viewer/queryWorkspace.ts'
import type { Detail, Page, Workspace } from '../../src/viewer/types.ts'
import { workspaceDetail } from '../../src/viewer/workspaceDetail.ts'

export interface DataSource {
	readonly detail: (
		type: string,
		id: string,
		offset: number,
		signal?: AbortSignal
	) => Promise<Detail>
	readonly page: (
		section: string,
		options: Record<string, string>,
		signal?: AbortSignal
	) => Promise<Page>
	readonly scene: () => Promise<GraphScene>
	readonly staticReport: boolean
	readonly summary: () => Promise<ReturnType<typeof workspaceSummary>>
}
const fetchJson = async <T>(
	path: string,
	options: Record<string, string>,
	signal?: AbortSignal
): Promise<T> => {
	const response = await fetch(`${path}?${new URLSearchParams(options)}`, {
		signal,
	})
	if (!response.ok) {
		throw new Error(`Could not read this view (${response.status}).`)
	}
	return await response.json()
}
function assertWorkspace(value: unknown): asserts value is Workspace {
	if (
		!value ||
		typeof value !== 'object' ||
		!('format' in value) ||
		value.format !== 'test-impact-workspace/1' ||
		!('nodes' in value) ||
		!Array.isArray(value.nodes)
	) {
		throw new Error('Unsupported report data')
	}
}
export const createDataSource = async (): Promise<DataSource> => {
	const embedded = document.getElementById('impact-data')
	if (!embedded) {
		return {
			staticReport: false,
			scene: async () => await fetchJson('/api/scene', {}),
			summary: async () => await fetchJson('/api/workspace', {}),
			page: async (section, options, signal) =>
				await fetchJson('/api/explore', { ...options, section }, signal),
			detail: async (type, id, offset, signal) =>
				await fetchJson(
					'/api/detail',
					{ type, id, offset: String(offset), limit: '20' },
					signal
				),
		}
	}
	const envelope: { encoding: string; data: string; sha256: string } =
		JSON.parse(embedded.textContent ?? '')
	if (envelope.encoding !== 'gzip-base64') {
		throw new Error('Unsupported report encoding')
	}
	const bytes = Uint8Array.from(atob(envelope.data), (character) =>
		character.charCodeAt(0)
	)
	const stream = new Blob([bytes])
		.stream()
		.pipeThrough(new DecompressionStream('gzip'))
	const decoded = await new Response(stream).arrayBuffer()
	if (decoded.byteLength > 134217728) {
		throw new Error('Report exceeds its 128 MiB decoded budget')
	}
	const digest = [
		...new Uint8Array(await crypto.subtle.digest('SHA-256', decoded)),
	]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
	if (digest !== envelope.sha256) {
		throw new Error('Report content hash mismatch')
	}
	const model: unknown = JSON.parse(new TextDecoder().decode(decoded))
	assertWorkspace(model)
	const index = createWorkspaceIndex(model)
	return {
		staticReport: true,
		scene: async () => graphScene(index),
		summary: async () => workspaceSummary(index),
		page: async (section, options) => queryWorkspace(index, section, options),
		detail: async (type, id, offset) =>
			workspaceDetail(index, type, id, { offset: String(offset), limit: '20' }),
	}
}
