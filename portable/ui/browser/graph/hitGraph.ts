import { edgeBounds } from './drawGraph.ts'
import {
	connectionPoints,
	curvePoint,
	distanceToSegment,
	intersects,
	isVisibleNode,
} from './graphGeometry.ts'
import type { GraphState, Point } from './types.ts'

const curveDistance = (point: Point, from: Point, to: Point): number => {
	let previous = from
	let distance = Number.POSITIVE_INFINITY
	for (let step = 1; step <= 16; step++) {
		const next = curvePoint(from, to, step / 16)
		distance = Math.min(distance, distanceToSegment(point, previous, next))
		previous = next
	}
	return distance
}
export const hitGraph = (
	point: Point,
	state: GraphState
): { type: string; id: string } | null => {
	for (const node of state.layout.nodes.toReversed()) {
		if (
			isVisibleNode(node, state) &&
			intersects(node, { ...point, width: 0, height: 0 })
		) {
			return { type: 'node', id: node.id }
		}
	}
	return hitEdge(point, state)
}
const hitEdge = (
	point: Point,
	state: GraphState
): { type: string; id: string } | null => {
	let nearest = 8 / state.viewport.zoom
	let match: string | undefined
	for (const edge of state.layout.scene.edges) {
		const from = state.layout.byId.get(edge.from)
		const to = state.layout.byId.get(edge.to)
		if (
			!from ||
			!to ||
			!isVisibleNode(from, state) ||
			!isVisibleNode(to, state)
		) {
			continue
		}
		if (!intersects(edgeBounds(from, to), { ...point, width: 0, height: 0 })) {
			continue
		}
		const [start, end] = connectionPoints(from, to)
		const distance =
			state.viewport.zoom < 0.15
				? distanceToSegment(point, start, end)
				: curveDistance(point, start, end)
		if (distance < nearest) {
			nearest = distance
			match = edge.id
		}
	}
	return match ? { type: 'edge', id: match } : null
}
