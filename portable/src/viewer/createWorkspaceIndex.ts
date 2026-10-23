import { rowKey } from './rowHelpers.ts'
import type { ViewRow, Workspace, WorkspaceIndex } from './types.ts'
import { caseRows, sourceRows, unitRows } from './workspaceCatalogue.ts'
import { workspaceRuns } from './workspaceRuns.ts'

const addFacet = (
	index: WorkspaceIndex,
	key: string,
	value: string,
	row: ViewRow
): void => {
	const values = index.facets.get(key) ?? new Map<string, Set<string>>()
	const ids = values.get(value) ?? new Set<string>()
	ids.add(rowKey(row))
	values.set(value, ids)
	index.facets.set(key, values)
}
export const createWorkspaceIndex = (model: Workspace): WorkspaceIndex => {
	const cases = caseRows(model)
	const sections = {
		code: sourceRows(model),
		cases,
		graph: model.nodes,
		units: unitRows(model, cases),
		impact: model.impact,
		runs: workspaceRuns(model, cases),
		evidence: model.evidence,
		diagnostics: model.diagnostics,
	}
	const all = Object.values(sections).flat()
	const index: WorkspaceIndex = {
		model,
		sections,
		rows: new Map(all.map((row) => [rowKey(row), row])),
		search: new Map(
			all.map((row) => [
				rowKey(row),
				[
					row.id,
					row.label,
					row.path,
					...Object.values(row.columns),
					...Object.values(row.facets).flat(),
				]
					.join(' ')
					.toLowerCase(),
			])
		),
		facets: new Map(),
		neighbors: new Map(),
		evidence: new Map(model.evidence.map((row) => [row.id, row])),
		sources: new Map(model.sources.map((source) => [source.id, source])),
	}
	for (const row of all) {
		addRowFacets(index, row)
	}
	for (const edge of model.edges) {
		addEdgeFacets(index, edge)
	}
	return index
}
export const workspaceSummary = (index: WorkspaceIndex) => ({
	format: index.model.format,
	title: index.model.title,
	identities: index.model.identities,
	verification: index.model.verification,
	notices: index.model.notices,
	metrics: index.model.metrics,
	facets: Object.fromEntries(
		[...index.facets].map(([key, values]) => [key, [...values.keys()].sort()])
	),
	sections: Object.fromEntries(
		Object.entries(index.sections).map(([key, rows]) => [key, rows.length])
	),
	contextCount: index.model.context.length,
})

const addRowFacets = (index: WorkspaceIndex, row: ViewRow): void => {
	for (const [key, values] of Object.entries(row.facets)) {
		for (const value of values) {
			addFacet(index, key, value, row)
		}
	}
}
const addEdgeFacets = (
	index: WorkspaceIndex,
	edge: Workspace['edges'][number]
): void => {
	for (const id of new Set([edge.from, edge.to])) {
		const adjacent = index.neighbors.get(id) ?? []
		adjacent.push(edge)
		index.neighbors.set(id, adjacent)
		const node = index.rows.get(`node:${id}`)
		if (!node) {
			continue
		}
		addFacet(index, 'relation', edge.relationship, node)
		tagEdgeEvidence(index, node, edge.evidenceIds)
	}
}

const tagEdgeEvidence = (
	index: WorkspaceIndex,
	node: ViewRow,
	evidenceIds: string[]
): void => {
	for (const evidenceId of evidenceIds) {
		const evidence = index.evidence.get(evidenceId)
		for (const name of ['evidence', 'validity']) {
			for (const value of evidence?.facets[name] ?? []) {
				addFacet(index, name, value, node)
			}
		}
	}
}
