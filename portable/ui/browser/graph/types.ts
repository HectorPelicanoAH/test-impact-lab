import type { GraphScene, SceneNode } from '../../../src/viewer/graphScene.ts'

export interface Point {
	x: number
	y: number
}
export interface Bounds extends Point {
	height: number
	width: number
}
export interface PositionedNode extends SceneNode, Bounds {}
export interface GraphRegion extends Bounds {
	readonly label: string
}
export interface GraphLayout {
	readonly bounds: Bounds
	readonly byId: Map<string, PositionedNode>
	readonly nodes: PositionedNode[]
	readonly regions: GraphRegion[]
	readonly scene: GraphScene
}
export interface GraphViewport extends Point {
	zoom: number
}
export interface GraphPalette {
	readonly accent: string
	readonly background: string
	readonly border: string
	readonly changed: string
	readonly muted: string
	readonly surface: string
	readonly test: string
	readonly text: string
}
export interface GraphState {
	readonly emphasized: Set<string>
	readonly emphasizedEdges: Set<string>
	readonly height: number
	readonly hideFiles: boolean
	readonly layout: GraphLayout
	readonly palette: GraphPalette
	readonly selected: string
	readonly viewport: GraphViewport
	readonly width: number
}
export interface GraphActions {
	readonly inspect: (type: string, id: string) => void | Promise<void>
	readonly navigate: (values: Record<string, string | null>) => void
}
export interface GraphController {
	readonly center: (point: Point, zoom?: number) => void
	readonly frame: (nodes: PositionedNode[]) => void
	readonly redraw: () => void
	readonly save: () => void
	readonly state: () => GraphState
	readonly viewport: GraphViewport
	readonly zoom: (factor: number, point?: Point) => void
}
