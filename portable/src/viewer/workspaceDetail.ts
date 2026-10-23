import { pageBounds } from './queryWorkspace.ts'
import { sourcePreviews } from './sourcePreviews.ts'
import type { Detail, DetailEntry, ViewRow, WorkspaceIndex } from './types.ts'

export const workspaceDetail = (
	index: WorkspaceIndex,
	type: string,
	id: string,
	options: Record<string, string> = {}
): Detail => {
	const { offset, limit } = pageBounds(options)
	if (type === 'edge') {
		const detail = edgeDetail(index, id)
		return {
			...detail,
			offset,
			entries: detail.entries.slice(offset, offset + limit),
		}
	}
	if (type === 'source') {
		const source = index.sources.get(id)
		if (!source) {
			throw new Error('Unknown source locator')
		}
		const entries = sourceEntries(index, id)
		return {
			id,
			title: source.path,
			columns: {
				Snapshot: source.snapshot,
				Revision: source.revision ?? 'not recorded',
				'Expected SHA256': source.hash ?? 'not recorded',
				Status: source.status,
			},
			entries: entries.slice(offset, offset + limit),
			total: entries.length,
			offset,
			source,
		}
	}
	if (type === 'context') {
		return {
			id: 'context',
			title: 'Artifact scope and runner plans',
			columns: {},
			entries: index.model.context.slice(offset, offset + limit),
			total: index.model.context.length,
			offset,
		}
	}
	const row = index.rows.get(`${type}:${id}`)
	if (!row) {
		throw new Error('Unknown detail record')
	}
	const entries = type === 'node' ? nodeEntries(index, row) : row.entries
	return {
		id,
		title: row.label,
		columns: { ID: row.id, Path: row.path || 'not recorded', ...row.columns },
		sourcePreviews: sourcePreviews(index, [row]),
		entries: entries.slice(offset, offset + limit),
		total: entries.length,
		offset,
	}
}
const edgeDetail = (index: WorkspaceIndex, id: string): Detail => {
	const edge = index.model.edges.find((item) => item.id === id)
	if (!edge) {
		throw new Error('Unknown relationship')
	}
	const from = index.rows.get(`node:${edge.from}`)
	const to = index.rows.get(`node:${edge.to}`)
	return {
		id,
		title: edge.relationship,
		columns: {
			ID: id,
			From: from?.label ?? edge.from,
			To: to?.label ?? edge.to,
			Snapshot: edge.snapshots.join(', '),
		},
		sourcePreviews: sourcePreviews(
			index,
			edge.evidenceIds.flatMap((evidenceId) => {
				const evidence = index.evidence.get(evidenceId)
				return evidence ? [evidence] : []
			})
		),
		offset: 0,
		total: edge.evidenceIds.length + 1,
		entries: [
			{
				label: 'Consumer → dependency',
				description: edge.relationship,
				references: [
					{ type: 'node', id: edge.from, label: from?.label ?? edge.from },
					{ type: 'node', id: edge.to, label: to?.label ?? edge.to },
				],
			},
			...edge.evidenceIds.map(
				(evidenceId): DetailEntry => ({
					label: 'Relationship evidence',
					description: evidenceId,
					references: [
						{
							type: 'evidence',
							id: evidenceId,
							label: 'Inspect evidence and source locator',
						},
					],
				})
			),
		],
	}
}
const sourceEntries = (index: WorkspaceIndex, id: string): DetailEntry[] =>
	index.model.nodes
		.filter((node) =>
			node.entries.some((entry) =>
				entry.references.some(
					(reference) => reference.type === 'source' && reference.id === id
				)
			)
		)
		.map((node) => ({
			label: node.label,
			description: `${node.columns.Kind} · ${node.path}`,
			references: [
				{
					type: 'node',
					id: node.id,
					label: 'Inspect declaration and relationships',
				},
			],
		}))
const nodeEntries = (index: WorkspaceIndex, row: ViewRow): DetailEntry[] => [
	...row.entries,
	...index.sections.cases
		.filter((item) =>
			item.entries.some((entry) =>
				entry.references.some(
					(reference) => reference.type === 'node' && reference.id === row.id
				)
			)
		)
		.map(
			(test): DetailEntry => ({
				label: 'Catalogue case',
				description: test.label,
				references: [
					{
						type: 'case',
						id: test.id,
						label: 'Inspect test case and file capture',
					},
				],
			})
		),
	...(index.neighbors.get(row.id) ?? []).map((edge): DetailEntry => {
		const other = edge.from === row.id ? edge.to : edge.from
		const node = index.rows.get(`node:${other}`)
		return {
			label: edge.relationship,
			description: `${edge.from === row.id ? 'Dependency' : 'Consumer'} · ${edge.snapshots.join(', ')}`,
			references: [
				{ type: 'edge', id: edge.id, label: 'Inspect relationship' },
				{ type: 'node', id: other, label: node?.label ?? other },
				...edge.evidenceIds.map((id) => ({
					type: 'evidence' as const,
					id,
					label: `Evidence: ${index.evidence.get(id)?.facets.evidence?.[0] ?? id}`,
				})),
			],
			data: { id: edge.id, from: edge.from, to: edge.to },
		}
	}),
]
