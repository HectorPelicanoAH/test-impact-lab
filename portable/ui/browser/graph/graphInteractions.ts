import { showError } from '../elements.ts'
import { worldPoint } from './graphGeometry.ts'
import { hitGraph } from './hitGraph.ts'
import type { GraphActions, GraphController, Point } from './types.ts'

const distance = (points: Point[]): number =>
	Math.hypot(
		(points[0]?.x ?? 0) - (points[1]?.x ?? 0),
		(points[0]?.y ?? 0) - (points[1]?.y ?? 0)
	)
const midpoint = (points: Point[]): Point => ({
	x: ((points[0]?.x ?? 0) + (points[1]?.x ?? 0)) / 2,
	y: ((points[0]?.y ?? 0) + (points[1]?.y ?? 0)) / 2,
})
export const attachGraphInteractions = (
	canvas: HTMLCanvasElement,
	controller: GraphController,
	actions: GraphActions
): void => {
	attachPointers(canvas, controller, actions)
	let timer: ReturnType<typeof setTimeout>
	canvas.addEventListener(
		'wheel',
		(event) => {
			event.preventDefault()
			controller.zoom(
				Math.exp(-Math.max(-180, Math.min(180, event.deltaY)) * 0.003),
				{ x: event.offsetX, y: event.offsetY }
			)
			clearTimeout(timer)
			timer = setTimeout(controller.save, 120)
		},
		{ passive: false }
	)
	canvas.addEventListener('dblclick', (event) => {
		controller.zoom(1.5, { x: event.offsetX, y: event.offsetY })
		controller.save()
	})
	canvas.addEventListener('keydown', (event) => {
		const moves: Record<string, Point> = {
			ArrowLeft: { x: -90, y: 0 },
			ArrowRight: { x: 90, y: 0 },
			ArrowUp: { x: 0, y: -90 },
			ArrowDown: { x: 0, y: 90 },
		}
		if (moves[event.key]) {
			event.preventDefault()
			controller.viewport.x += moves[event.key].x / controller.viewport.zoom
			controller.viewport.y += moves[event.key].y / controller.viewport.zoom
			controller.redraw()
		}
		const factor = { '+': 1.25, '=': 1.25, '-': 0.8 }[event.key]
		if (factor) {
			event.preventDefault()
			controller.zoom(factor)
		}
		if (event.key === 'Home') {
			event.preventDefault()
			controller.frame(controller.state().layout.nodes)
		}
		controller.save()
	})
}
const attachPointers = (
	canvas: HTMLCanvasElement,
	controller: GraphController,
	actions: GraphActions
): void => {
	const pointers = new Map<number, Point>()
	let origin: Point | undefined
	let dragged = false
	canvas.addEventListener('pointerdown', (event) => {
		if (event.button !== 0) {
			return
		}
		canvas.focus({ preventScroll: true })
		canvas.setPointerCapture(event.pointerId)
		const point = { x: event.offsetX, y: event.offsetY }
		pointers.set(event.pointerId, point)
		origin = point
		dragged = pointers.size > 1
	})
	canvas.addEventListener('pointermove', (event) => {
		const previous = pointers.get(event.pointerId)
		if (!previous) {
			return
		}
		const before = [...pointers.values()]
		const point = { x: event.offsetX, y: event.offsetY }
		pointers.set(event.pointerId, point)
		if (pointers.size === 2) {
			pinch(controller, before, [...pointers.values()])
			dragged = true
			return
		}
		controller.viewport.x -= (point.x - previous.x) / controller.viewport.zoom
		controller.viewport.y -= (point.y - previous.y) / controller.viewport.zoom
		dragged ||=
			Math.hypot(
				point.x - (origin?.x ?? point.x),
				point.y - (origin?.y ?? point.y)
			) > 4
		controller.redraw()
	})
	canvas.addEventListener('pointerup', (event) => {
		if (!pointers.has(event.pointerId)) {
			return
		}
		pointers.delete(event.pointerId)
		controller.save()
		if (dragged) {
			return
		}
		const hit = hitGraph(
			worldPoint({ x: event.offsetX, y: event.offsetY }, controller.state()),
			controller.state()
		)
		if (hit) {
			Promise.resolve(actions.inspect(hit.type, hit.id)).catch(showError)
		}
	})
	canvas.addEventListener('pointercancel', (event) => {
		pointers.delete(event.pointerId)
		dragged = true
		controller.save()
	})
}
const pinch = (
	controller: GraphController,
	before: Point[],
	after: Point[]
): void => {
	const previous = midpoint(before)
	const next = midpoint(after)
	controller.zoom(distance(after) / Math.max(1, distance(before)), next)
	controller.viewport.x -= (next.x - previous.x) / controller.viewport.zoom
	controller.viewport.y -= (next.y - previous.y) / controller.viewport.zoom
	controller.redraw()
}
