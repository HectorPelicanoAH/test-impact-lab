import type { GraphViewport } from './types.ts'

export const cameraState = (
	viewport: GraphViewport
): Record<string, string> => ({
	panX: viewport.x.toFixed(3),
	panY: viewport.y.toFixed(3),
	zoom: viewport.zoom.toFixed(6),
})
export const replaceCamera = (viewport: GraphViewport): void => {
	const parameters = new URLSearchParams(location.hash.slice(1))
	for (const [key, value] of Object.entries(cameraState(viewport))) {
		parameters.set(key, value)
	}
	const hash = parameters.toString()
	if (hash === location.hash.slice(1)) {
		return
	}
	history.replaceState(null, '', `#${hash}`)
	window.dispatchEvent(new HashChangeEvent('hashchange'))
}
