import { replaceCamera } from './cameraState.ts'
import { drawGraph } from './drawGraph.ts'
import { graphEmphasis } from './graphEmphasis.ts'
import { boundsOf } from './layoutGraph.ts'
import { createMinimap } from './minimap.ts'
import { restoreViewport } from './restoreViewport.ts'
import type {
	GraphController,
	GraphLayout,
	GraphPalette,
	GraphState,
	GraphViewport,
	Point,
} from './types.ts'

const clampZoom = (zoom: number): number =>
	Math.max(0.0005, Math.min(2.5, zoom))
const paletteOf = (): GraphPalette => {
	const css = getComputedStyle(document.body)
	const color = (name: string): string =>
		css.getPropertyValue(`--sem-color-${name}`).trim()
	return {
		background: color('background-main'),
		surface: color('background-surface'),
		border: color('border-disabled'),
		text: color('content-core'),
		muted: color('content-soft'),
		accent: color('content-info'),
		test: color('content-success'),
		changed: color('content-warning'),
	}
}
export const createGraphController = (
	canvas: HTMLCanvasElement,
	layout: GraphLayout
) => {
	const viewport: GraphViewport = { x: 0, y: 0, zoom: 0.7 }
	const palette = paletteOf()
	let width = 800
	let height = 500
	let selected = ''
	let hideFiles = false
	let emphasized = new Set<string>()
	let emphasizedEdges = new Set<string>()
	let scheduled = false
	let renderKey = ''
	let emphasisKey = ''
	let measured = false
	let restoredCamera = false
	const state = (): GraphState => ({
		layout,
		viewport,
		palette,
		selected,
		hideFiles,
		emphasized,
		emphasizedEdges,
		width,
		height,
	})
	const redraw = (): void => {
		if (scheduled) {
			return
		}
		scheduled = true
		requestAnimationFrame(() => {
			scheduled = false
			if (!canvas.isConnected) {
				return
			}
			drawGraph(canvas, state())
			canvas.dataset.renderState = renderKey
			minimap.draw(state())
		})
	}
	const center = (point: Point, zoom = viewport.zoom): void => {
		viewport.zoom = clampZoom(zoom)
		viewport.x = point.x - width / 2 / viewport.zoom
		viewport.y = point.y - height / 2 / viewport.zoom
		redraw()
	}
	const save = (): void => replaceCamera(viewport)
	const controller: GraphController = {
		viewport,
		state,
		redraw,
		center,
		save,
		frame: (nodes): void => {
			const bounds = boundsOf(nodes)
			center(
				{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
				Math.min(
					(width - 100) / (bounds.width + 80),
					(height - 100) / (bounds.height + 80),
					1.1
				)
			)
		},
		zoom: (factor, point = { x: width / 2, y: height / 2 }): void => {
			const anchor = {
				x: viewport.x + point.x / viewport.zoom,
				y: viewport.y + point.y / viewport.zoom,
			}
			viewport.zoom = clampZoom(viewport.zoom * factor)
			viewport.x = anchor.x - point.x / viewport.zoom
			viewport.y = anchor.y - point.y / viewport.zoom
			redraw()
		},
	}
	const minimap = createMinimap(controller)
	const resize = (entries: ResizeObserverEntry[]): void => {
		const bounds = entries[0]?.contentRect
		if (!bounds?.width || !bounds.height) {
			return
		}
		const previousCenter = {
			x: viewport.x + width / 2 / viewport.zoom,
			y: viewport.y + height / 2 / viewport.zoom,
		}
		width = bounds.width
		height = bounds.height
		if (!measured && restoredCamera) {
			redraw()
		} else {
			center(previousCenter)
		}
		measured = true
		save()
	}
	const observer = new ResizeObserver(resize)
	observer.observe(canvas)
	const sync = (parameters: URLSearchParams): void => {
		if (!renderKey) {
			restoredCamera = ['panX', 'panY', 'zoom'].every((key) =>
				parameters.has(key)
			)
		}
		renderKey = parameters.toString()
		selected = parameters.get('recordId') ?? ''
		hideFiles = parameters.get('structure') === 'hidden'
		const key = `${selected}:${parameters.get('cause') ?? ''}`
		if (key !== emphasisKey) {
			emphasisKey = key
			const emphasis = graphEmphasis(
				layout,
				selected,
				parameters.get('cause') ?? ''
			)
			emphasized = emphasis.nodes
			emphasizedEdges = emphasis.edges
		}
		restoreViewport(viewport, parameters)
		redraw()
	}
	return {
		controller,
		minimap: minimap.canvas,
		sync,
		dispose: () => observer.disconnect(),
	}
}
