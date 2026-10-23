import type { SceneEdge } from '../../../src/viewer/graphScene.ts'
import {
	connectionPoints,
	curvePoint,
	intersects,
	isVisibleNode,
	nodeColor,
	viewportBounds,
} from './graphGeometry.ts'
import type { Bounds, GraphState, PositionedNode } from './types.ts'

const drawConnection = (
	context: CanvasRenderingContext2D,
	from: PositionedNode,
	to: PositionedNode,
	zoom: number
): void => {
	const [start, end] = connectionPoints(from, to)
	context.moveTo(start.x, start.y)
	if (zoom < 0.15) {
		context.lineTo(end.x, end.y)
		return
	}
	const bend = Math.max(60, Math.abs(end.x - start.x) * 0.5)
	context.bezierCurveTo(
		start.x + bend,
		start.y,
		end.x - bend,
		end.y,
		end.x,
		end.y
	)
	if (zoom >= 0.32) {
		context.moveTo(end.x - 9, end.y - 4)
		context.lineTo(end.x, end.y)
		context.lineTo(end.x - 9, end.y + 4)
	}
}
export const edgeBounds = (
	from: PositionedNode,
	to: PositionedNode
): Bounds => ({
	x: Math.min(from.x, to.x) - Math.abs(to.x - from.x) * 0.5 - 60,
	y: Math.min(from.y, to.y),
	width: Math.abs(to.x - from.x) * 2 + from.width + to.width + 120,
	height: Math.abs(to.y - from.y) + Math.max(from.height, to.height),
})
const selectedEdge = (edge: SceneEdge, state: GraphState): boolean =>
	edge.id === state.selected ||
	state.emphasizedEdges.has(edge.id) ||
	edge.from === state.selected ||
	edge.to === state.selected
const drawEdges = (
	context: CanvasRenderingContext2D,
	state: GraphState,
	highlighted: boolean
): void => {
	const bounds = viewportBounds(state)
	context.beginPath()
	context.lineWidth = (highlighted ? 2 : 0.7) / state.viewport.zoom
	context.strokeStyle = highlighted
		? state.palette.accent
		: state.palette.border
	context.globalAlpha = highlighted ? 0.95 : backgroundOpacity(state)
	for (const edge of state.layout.scene.edges) {
		if (selectedEdge(edge, state) !== highlighted) {
			continue
		}
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
		if (!intersects(edgeBounds(from, to), bounds)) {
			continue
		}
		drawConnection(context, from, to, state.viewport.zoom)
	}
	context.stroke()
	context.globalAlpha = 1
}
const labelOf = (node: PositionedNode): string => {
	const label =
		node.kind === 'file'
			? (node.path.split('/').at(-1) ?? node.label)
			: node.label
	return label.length > 33 ? `${label.slice(0, 31)}…` : label
}
const drawNode = (
	context: CanvasRenderingContext2D,
	node: PositionedNode,
	state: GraphState
): void => {
	if (state.viewport.zoom < 0.08) {
		context.fillStyle = nodeColor(node, state)
		context.fillRect(node.x, node.y, node.width, node.height)
		return
	}
	context.fillStyle = state.palette.surface
	context.strokeStyle = nodeColor(node, state)
	context.lineWidth =
		(node.id === state.selected ? 2 : 0.8) / state.viewport.zoom
	context.setLineDash(
		node.role === 'external' || node.snapshots?.join() === 'base'
			? [5 / state.viewport.zoom, 3 / state.viewport.zoom]
			: []
	)
	context.beginPath()
	context.roundRect(node.x, node.y, node.width, node.height, 5)
	context.fill()
	context.stroke()
	context.setLineDash([])
	if (state.viewport.zoom < 0.32) {
		return
	}
	context.fillStyle = nodeColor(node, state)
	context.font = '10px ui-monospace, monospace'
	context.fillText(
		`${node.kind} · ${node.snapshots?.join('+') || 'unknown snapshot'}`,
		node.x + 12,
		node.y + 20
	)
	context.fillStyle = state.palette.text
	context.font = '12px ui-monospace, monospace'
	context.fillText(labelOf(node), node.x + 12, node.y + 43)
}
const drawRegions = (
	context: CanvasRenderingContext2D,
	state: GraphState
): void => {
	context.strokeStyle = state.palette.border
	context.lineWidth = 1 / state.viewport.zoom
	context.fillStyle = state.palette.muted
	context.font = '24px ui-monospace, monospace'
	for (const region of state.layout.regions) {
		if (!intersects(region, viewportBounds(state))) {
			continue
		}
		context.globalAlpha = 0.3
		context.strokeRect(region.x, region.y, region.width, region.height)
		context.globalAlpha = 1
		context.fillText(region.label, region.x + 40, region.y + 45)
	}
}
export const drawGraph = (
	canvas: HTMLCanvasElement,
	state: GraphState
): void => {
	const context = canvas.getContext('2d')
	if (!context) {
		throw new Error('Canvas rendering is unavailable in this browser')
	}
	const ratio = Math.min(2, devicePixelRatio || 1)
	if (
		canvas.width !== Math.round(state.width * ratio) ||
		canvas.height !== Math.round(state.height * ratio)
	) {
		canvas.width = Math.round(state.width * ratio)
		canvas.height = Math.round(state.height * ratio)
	}
	context.setTransform(ratio, 0, 0, ratio, 0, 0)
	context.clearRect(0, 0, state.width, state.height)
	context.translate(
		-state.viewport.x * state.viewport.zoom,
		-state.viewport.y * state.viewport.zoom
	)
	context.scale(state.viewport.zoom, state.viewport.zoom)
	drawRegions(context, state)
	drawEdges(context, state, false)
	drawEdges(context, state, true)
	drawRelationshipLabel(context, state)
	const bounds = viewportBounds(state)
	for (const node of state.layout.nodes) {
		if (isVisibleNode(node, state) && intersects(node, bounds)) {
			drawNode(context, node, state)
		}
	}
}

const backgroundOpacity = (state: GraphState): number =>
	state.layout.byId.has(state.selected) || state.emphasizedEdges.size
		? 0.07
		: 0.2

const drawRelationshipLabel = (
	context: CanvasRenderingContext2D,
	state: GraphState
): void => {
	const edge = state.layout.scene.edges.find(
		(item) => item.id === state.selected
	)
	if (!edge) {
		return
	}
	const from = state.layout.byId.get(edge.from)
	const to = state.layout.byId.get(edge.to)
	if (!from || !to) {
		return
	}
	const [start, end] = connectionPoints(from, to)
	const point = curvePoint(start, end, 0.5)
	context.font = `${12 / state.viewport.zoom}px ui-monospace, monospace`
	const width = context.measureText(edge.relationship).width
	const padding = 5 / state.viewport.zoom
	context.fillStyle = state.palette.surface
	context.fillRect(
		point.x - padding,
		point.y - 15 / state.viewport.zoom,
		width + padding * 2,
		22 / state.viewport.zoom
	)
	context.fillStyle = state.palette.accent
	context.fillText(edge.relationship, point.x, point.y)
}
