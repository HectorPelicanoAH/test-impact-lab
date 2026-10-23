import type { GraphViewport } from './types.ts'

const finiteNumber = (value: string | null, fallback: number): number => {
	const number = Number(value)
	return Number.isFinite(number) ? number : fallback
}
export const restoreViewport = (
	viewport: GraphViewport,
	parameters: URLSearchParams
): void => {
	if (!['panX', 'panY', 'zoom'].every((key) => parameters.has(key))) {
		return
	}
	viewport.x = finiteNumber(parameters.get('panX'), 0)
	viewport.y = finiteNumber(parameters.get('panY'), 0)
	viewport.zoom = Math.max(
		0.0005,
		Math.min(2.5, finiteNumber(parameters.get('zoom'), 0.7))
	)
}
