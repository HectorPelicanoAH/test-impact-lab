import type { CauseScope, WorkspaceIndex } from './types.ts'

export interface SceneNode {
	readonly changed: boolean
	readonly id: string
	readonly kind: string
	readonly label: string
	readonly language: string
	readonly path: string
	readonly role: string
	readonly snapshots: string[]
	readonly workspace: string
}
export interface SceneEdge {
	readonly from: string
	readonly id: string
	readonly relationship: string
	readonly snapshots: string[]
	readonly to: string
}
export interface GraphScene {
	readonly causes: Record<string, CauseScope>
	readonly edges: SceneEdge[]
	readonly nodes: SceneNode[]
	readonly preferredWorkspace: string | null
}
export const graphScene = (index: WorkspaceIndex): GraphScene => ({
	nodes: index.model.nodes.map((row) => ({
		id: row.id,
		label: row.label,
		path: row.path,
		kind: row.columns.Kind ?? 'unknown',
		workspace: row.facets.workspace?.[0] ?? '(unassigned)',
		changed: row.facets.changed?.includes('changed') ?? false,
		role: row.columns.Role ?? 'unknown',
		snapshots: row.facets.snapshot ?? [],
		language: row.facets.language?.[0] ?? 'unknown',
	})),
	edges: index.model.edges.map(({ id, from, to, relationship, snapshots }) => ({
		id,
		from,
		to,
		relationship,
		snapshots,
	})),
	causes: index.model.causes,
	preferredWorkspace: index.model.units[0]?.facets.workspace?.[0] ?? null,
})
