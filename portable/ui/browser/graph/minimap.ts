import { element } from '../elements.ts'
import styles from '../styles.module.css'
import { isVisibleNode, nodeColor, viewportBounds } from './graphGeometry.ts'
import type { Bounds, GraphController, GraphState } from './types.ts'

const SIZE = { width: 190, height: 125 }
const transformOf = (bounds: Bounds) => {
	const scale = Math.min(
		(SIZE.width - 12) / Math.max(1, bounds.width),
		(SIZE.height - 12) / Math.max(1, bounds.height)
	)
	return {
		scale,
		x: (SIZE.width - bounds.width * scale) / 2 - bounds.x * scale,
		y: (SIZE.height - bounds.height * scale) / 2 - bounds.y * scale,
	}
}
export const createMinimap = (controller: GraphController) => {
	const canvas = element('canvas', undefined, styles.minimap)
	canvas.width = SIZE.width
	canvas.height = SIZE.height
	canvas.setAttribute(
		'aria-label',
		'Graph minimap. Click or drag to move the main viewport.'
	)
	canvas.setAttribute('role', 'img')
	const move = (event: PointerEvent): void => {
		const transform = transformOf(controller.state().layout.bounds)
		controller.center({
			x: (event.offsetX - transform.x) / transform.scale,
			y: (event.offsetY - transform.y) / transform.scale,
		})
	}
	canvas.addEventListener('pointerdown', (event) => {
		canvas.setPointerCapture(event.pointerId)
		move(event)
	})
	canvas.addEventListener('pointermove', (event) => {
		if (canvas.hasPointerCapture(event.pointerId)) {
			move(event)
		}
	})
	canvas.addEventListener('pointerup', () => controller.save())
	canvas.addEventListener(
		'wheel',
		(event) => {
			event.preventDefault()
			controller.zoom(Math.exp(-event.deltaY * 0.002))
			controller.save()
		},
		{ passive: false }
	)
	return {
		canvas,
		draw: cachedMinimap(canvas),
	}
}
const cachedMinimap = (canvas: HTMLCanvasElement) => {
	const background = document.createElement('canvas')
	background.width = SIZE.width
	background.height = SIZE.height
	let previousSelection = ''
	let previousStructure: boolean | undefined
	let previousEmphasis: Set<string> | undefined
	return (state: GraphState): void => {
		if (
			previousSelection !== state.selected ||
			previousStructure !== state.hideFiles ||
			previousEmphasis !== state.emphasized
		) {
			previousSelection = state.selected
			previousStructure = state.hideFiles
			previousEmphasis = state.emphasized
			drawNodes(background, state)
		}
		const context = canvas.getContext('2d')
		if (!context) {
			return
		}
		context.clearRect(0, 0, SIZE.width, SIZE.height)
		context.drawImage(background, 0, 0)
		const transform = transformOf(state.layout.bounds)
		const viewport = viewportBounds(state)
		context.strokeStyle = state.palette.accent
		context.lineWidth = 1.5
		context.strokeRect(
			viewport.x * transform.scale + transform.x,
			viewport.y * transform.scale + transform.y,
			viewport.width * transform.scale,
			viewport.height * transform.scale
		)
	}
}
const drawNodes = (canvas: HTMLCanvasElement, state: GraphState): void => {
	const context = canvas.getContext('2d')
	if (!context) {
		return
	}
	const transform = transformOf(state.layout.bounds)
	context.clearRect(0, 0, SIZE.width, SIZE.height)
	for (const node of state.layout.nodes) {
		if (!isVisibleNode(node, state)) {
			continue
		}
		context.fillStyle = nodeColor(node, state)
		context.fillRect(
			node.x * transform.scale + transform.x,
			node.y * transform.scale + transform.y,
			Math.max(1, node.width * transform.scale),
			Math.max(1, node.height * transform.scale)
		)
	}
}
