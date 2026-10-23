import type { Bounds, GraphState, Point, PositionedNode } from './types.ts'

export const isVisibleNode = (
	node: PositionedNode,
	state: GraphState
): boolean =>
	!state.hideFiles || !['file', 'package', 'repository'].includes(node.kind)
export const worldPoint = (point: Point, state: GraphState): Point => ({
	x: point.x / state.viewport.zoom + state.viewport.x,
	y: point.y / state.viewport.zoom + state.viewport.y,
})
export const viewportBounds = (state: GraphState): Bounds => ({
	x: state.viewport.x,
	y: state.viewport.y,
	width: state.width / state.viewport.zoom,
	height: state.height / state.viewport.zoom,
})
export const intersects = (a: Bounds, b: Bounds): boolean =>
	a.x <= b.x + b.width &&
	a.x + a.width >= b.x &&
	a.y <= b.y + b.height &&
	a.y + a.height >= b.y
export const nodeColor = (node: PositionedNode, state: GraphState): string => {
	if (node.id === state.selected || state.emphasized.has(node.id)) {
		return state.palette.accent
	}
	if (node.changed) {
		return state.palette.changed
	}
	return node.kind.startsWith('test')
		? state.palette.test
		: state.palette.border
}
export const connectionPoints = (from: Bounds, to: Bounds): [Point, Point] => [
	{ x: from.x + from.width, y: from.y + from.height / 2 },
	{ x: to.x, y: to.y + to.height / 2 },
]
export const curvePoint = (from: Point, to: Point, fraction: number): Point => {
	const bend = Math.max(60, Math.abs(to.x - from.x) * 0.5)
	const inverse = 1 - fraction
	return {
		x:
			inverse ** 3 * from.x +
			3 * inverse ** 2 * fraction * (from.x + bend) +
			3 * inverse * fraction ** 2 * (to.x - bend) +
			fraction ** 3 * to.x,
		y:
			inverse ** 3 * from.y +
			3 * inverse ** 2 * fraction * from.y +
			3 * inverse * fraction ** 2 * to.y +
			fraction ** 3 * to.y,
	}
}
export const distanceToSegment = (
	point: Point,
	from: Point,
	to: Point
): number => {
	const dx = to.x - from.x
	const dy = to.y - from.y
	const length = dx * dx + dy * dy
	const fraction = length
		? Math.max(
				0,
				Math.min(
					1,
					((point.x - from.x) * dx + (point.y - from.y) * dy) / length
				)
			)
		: 0
	return Math.hypot(
		point.x - from.x - fraction * dx,
		point.y - from.y - fraction * dy
	)
}
