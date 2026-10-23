import type { GraphLayout } from './types.ts'

export const graphEmphasis = (
	layout: GraphLayout,
	selected: string,
	causeId: string
): { nodes: Set<string>; edges: Set<string> } => {
	const cause = layout.scene.causes[causeId]
	const nodes = new Set(cause?.nodeIds ?? [])
	const edges = new Set(cause?.edgeIds ?? [])
	for (const edge of layout.scene.edges) {
		if (
			edge.id === selected ||
			edge.from === selected ||
			edge.to === selected
		) {
			nodes.add(edge.from)
			nodes.add(edge.to)
			edges.add(edge.id)
		}
	}
	return { nodes, edges }
}
