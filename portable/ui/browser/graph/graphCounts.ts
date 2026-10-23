import type { GraphLayout } from './types.ts'

export const graphCounts = (layout: GraphLayout) => {
	const cache = new Map<boolean, string>()
	return (hideFiles: boolean): string => {
		const cached = cache.get(hideFiles)
		if (cached) {
			return cached
		}
		const nodes = layout.nodes.filter(
			(node) =>
				!hideFiles || !['file', 'package', 'repository'].includes(node.kind)
		)
		const ids = new Set(nodes.map((node) => node.id))
		const edges = layout.scene.edges.filter(
			(edge) => ids.has(edge.from) && ids.has(edge.to)
		)
		const message = `${nodes.length.toLocaleString()} / ${layout.nodes.length.toLocaleString()} nodes · ${edges.length.toLocaleString()} / ${layout.scene.edges.length.toLocaleString()} relationships · ${layout.nodes.length - nodes.length} structural nodes hidden`
		cache.set(hideFiles, message)
		return message
	}
}
