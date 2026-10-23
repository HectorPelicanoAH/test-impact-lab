import type { GraphScene, SceneNode } from '../../../src/viewer/graphScene.ts'
import type {
	Bounds,
	GraphLayout,
	GraphRegion,
	PositionedNode,
} from './types.ts'

const KIND_ORDER = ['package', 'file', 'symbol', 'test-group', 'test']
const groupNodes = (
	nodes: SceneNode[],
	key: (node: SceneNode) => string
): Map<string, SceneNode[]> => {
	const groups = new Map<string, SceneNode[]>()
	for (const node of nodes) {
		const id = key(node)
		const group = groups.get(id) ?? []
		group.push(node)
		groups.set(id, group)
	}
	return groups
}
const placeWorkspace = (nodes: SceneNode[], y: number): PositionedNode[] => {
	const columns = Math.max(
		2,
		Math.min(32, Math.ceil(Math.sqrt(nodes.length / 3)))
	)
	const heights = Array.from({ length: columns }, () => y + 80)
	const positioned: PositionedNode[] = []
	const files = groupNodes(nodes, (node) => node.path || node.kind)
	for (const [, entries] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
		const ordered = entries.toSorted(
			(a, b) =>
				KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
				a.id.localeCompare(b.id)
		)
		for (let offset = 0; offset < ordered.length; offset += 14) {
			const column = heights.indexOf(Math.min(...heights))
			for (const [index, node] of ordered
				.slice(offset, offset + 14)
				.entries()) {
				positioned.push({
					...node,
					x: column * 300 + 40,
					y: heights[column] + index * 96,
					width: 250,
					height: 68,
				})
			}
			heights[column] += Math.min(14, ordered.length - offset) * 96 + 64
		}
	}
	return positioned
}
export const boundsOf = (nodes: readonly Bounds[]): Bounds => {
	if (!nodes.length) {
		return { x: 0, y: 0, width: 800, height: 600 }
	}
	let left = Number.POSITIVE_INFINITY
	let top = Number.POSITIVE_INFINITY
	let right = Number.NEGATIVE_INFINITY
	let bottom = Number.NEGATIVE_INFINITY
	for (const node of nodes) {
		left = Math.min(left, node.x)
		top = Math.min(top, node.y)
		right = Math.max(right, node.x + node.width)
		bottom = Math.max(bottom, node.y + node.height)
	}
	return { x: left, y: top, width: right - left, height: bottom - top }
}
export const layoutGraph = (scene: GraphScene): GraphLayout => {
	const workspaces = [...groupNodes(scene.nodes, (node) => node.workspace)]
		.sort(
			([a], [b]) =>
				Number(b === scene.preferredWorkspace) -
					Number(a === scene.preferredWorkspace) || a.localeCompare(b)
		)
		.map(([workspace, entries]) => {
			const nodes = placeWorkspace(entries, 0)
			const bounds = boundsOf(nodes)
			return {
				workspace,
				nodes,
				width: bounds.x + bounds.width + 40,
				height: bounds.height + 140,
			}
		})
	const columnWidth =
		Math.max(800, ...workspaces.map((workspace) => workspace.width)) + 180
	const columns = Math.max(
		1,
		Math.min(4, Math.ceil(Math.sqrt(workspaces.length / 3)))
	)
	const heights = Array.from({ length: columns }, () => 0)
	const nodes: PositionedNode[] = []
	const regions: GraphRegion[] = []
	for (const workspace of workspaces) {
		const column = heights.indexOf(Math.min(...heights))
		const x = column * columnWidth
		const y = heights[column]
		nodes.push(
			...workspace.nodes.map((node) => ({
				...node,
				x: node.x + x,
				y: node.y + y,
			}))
		)
		regions.push({
			label: workspace.workspace,
			x,
			y,
			width: workspace.width,
			height: workspace.height,
		})
		heights[column] += workspace.height + 180
	}
	return {
		scene,
		nodes,
		regions,
		byId: new Map(nodes.map((node) => [node.id, node])),
		bounds: boundsOf(regions),
	}
}
