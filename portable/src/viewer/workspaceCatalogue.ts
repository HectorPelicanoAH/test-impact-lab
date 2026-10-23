import { languageOf, workspaceOf } from './rowHelpers.ts'
import type { DetailEntry, ViewRow, Workspace } from './types.ts'

export const sourceRows = (model: Workspace): ViewRow[] => {
	const roots = new Set(model.units.map((unit) => workspaceOf(unit.path)))
	return [...model.sources]
		.sort(
			(a, b) =>
				Number(roots.has(workspaceOf(b.path))) -
					Number(roots.has(workspaceOf(a.path))) ||
				Number(Boolean(b.hash)) - Number(Boolean(a.hash)) ||
				a.path.localeCompare(b.path) ||
				a.snapshot.localeCompare(b.snapshot)
		)
		.map((source) => ({
			id: source.id,
			type: 'source',
			label: source.path,
			path: source.path,
			facets: {
				workspace: [workspaceOf(source.path)],
				language: [languageOf(source.path)],
				snapshot: [source.snapshot],
			},
			columns: { Snapshot: source.snapshot, Status: source.status },
			entries: [],
		}))
}

export const caseRows = (model: Workspace): ViewRow[] => {
	const nodes = new Map(model.nodes.map((node) => [node.id, node]))
	return model.units.flatMap((unit) =>
		unit.entries.flatMap((entry): ViewRow[] => {
			const data = entry.data
			if (!isCaseData(data)) {
				return []
			}
			const declaration = entry.references.find(
				(reference) => reference.type === 'node'
			)
			const node = nodes.get(declaration?.id ?? '')
			const label = node?.label ?? entry.label
			const category = String(data.category ?? 'unknown')
			const availability = String(data.availability ?? 'unknown')
			return [
				{
					id: data.id,
					type: 'case',
					label,
					path: unit.path,
					facets: {
						...unit.facets,
						category: [category],
						status: [availability],
					},
					columns: {
						Category: category,
						Runner: unit.columns.Runner ?? 'unknown',
						Snapshot: unit.columns.Snapshot ?? 'unknown',
						Capture: `${unit.columns.Capture} · ${unit.columns.Attribution} attribution`,
						Availability: availability,
					},
					entries: [
						{ ...entry, label },
						...(node?.entries ?? []),
						{
							label: 'Execution group',
							description:
								'Coverage belongs to this group; individual case counters are not inferred.',
							references: [
								{ type: 'unit', id: unit.id, label: 'Open file capture' },
							],
						},
					],
				},
			]
		})
	)
}

interface CaseData {
	readonly availability?: unknown
	readonly caseKey: unknown
	readonly category?: unknown
	readonly id: string
}
const isCaseData = (data: unknown): data is CaseData =>
	data !== null &&
	typeof data === 'object' &&
	'caseKey' in data &&
	'id' in data &&
	typeof data.id === 'string'

export const unitRows = (model: Workspace, cases: ViewRow[]): ViewRow[] => {
	const labels = new Map(cases.map((item) => [item.id, item.label]))
	const withCaseName = (entry: DetailEntry): DetailEntry => {
		if (!isCaseData(entry.data)) {
			return entry
		}
		return { ...entry, label: labels.get(entry.data.id) ?? entry.label }
	}
	return model.units.map((unit) => ({
		...unit,
		entries: unit.entries.map(withCaseName),
	}))
}
