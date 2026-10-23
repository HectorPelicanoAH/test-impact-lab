import type { GraphScene } from '../../../src/viewer/graphScene.ts'
import { button, element } from '../elements.ts'
import styles from '../styles.module.css'
import { createGraphController } from './graphController.ts'
import { graphCounts } from './graphCounts.ts'
import { isVisibleNode } from './graphGeometry.ts'
import { attachGraphInteractions } from './graphInteractions.ts'
import { graphToolbar } from './graphToolbar.ts'
import { layoutGraph } from './layoutGraph.ts'
import type { GraphActions, PositionedNode } from './types.ts'

export const createGraphCanvas = (scene: GraphScene, actions: GraphActions) => {
	const shell = element('section', undefined, styles.graphScene)
	const stage = element('div', undefined, styles.sceneStage)
	const canvas = element(
		'canvas',
		'Use Find node or the node table to inspect every node and its relationships.',
		styles.sceneCanvas
	)
	canvas.tabIndex = 0
	canvas.setAttribute('role', 'img')
	canvas.setAttribute(
		'aria-label',
		'Complete dependency graph. Drag to pan; wheel or plus/minus to zoom; arrow keys pan; Home fits all. Find node and the table provide keyboard inspection.'
	)
	canvas.dataset.graphViewport = ''
	const layout = layoutGraph(scene)
	const mounted = createGraphController(canvas, layout)
	const { controller } = mounted
	const tools = graphToolbar(controller, actions)
	attachGraphInteractions(canvas, controller, actions)
	const legend = element('div', undefined, styles.sceneLegend)
	for (const [name, label] of [
		['selected', 'Selection / connected'],
		['test', 'Test / group'],
		['changed', 'Changed source'],
		['dependency', 'Consumer → dependency'],
		['boundary', 'Dashed: base-only / external'],
	]) {
		const item = element('span', label)
		item.dataset.kind = name
		legend.append(item)
	}
	const counts = element('span', '', styles.muted)
	const countMessage = graphCounts(layout)
	counts.setAttribute('role', 'status')
	const footer = element('div', undefined, styles.sceneFooter)
	footer.append(
		counts,
		button('Browse node table', () => actions.navigate({ table: 'open' }))
	)
	stage.append(canvas, mounted.minimap, legend)
	shell.append(tools.toolbar, stage, footer)
	let initialized = false
	let focusKey = ''
	const sync = (parameters: URLSearchParams): void => {
		mounted.sync(parameters)
		tools.sync(parameters)
		const state = controller.state()
		const visible = layout.nodes.filter((node) => isVisibleNode(node, state))
		counts.textContent = countMessage(state.hideFiles)
		const focus = focusRequest(parameters)
		if (!initialized || focus !== focusKey) {
			focusKey = focus
			initialized = true
			const initial = frameInitial(parameters, tools, controller, visible)
			if (initial && !parameters.has('recordId')) {
				actions.navigate({ recordType: 'node', recordId: initial.id })
			}
		}
	}
	canvas.addEventListener('viewportchange', () =>
		sync(new URLSearchParams(location.hash.slice(1)))
	)
	return { shell, sync, dispose: mounted.dispose }
}

type Controller = ReturnType<typeof createGraphController>['controller']
type Tools = ReturnType<typeof graphToolbar>
const frameInitial = (
	parameters: URLSearchParams,
	tools: Tools,
	controller: Controller,
	nodes: PositionedNode[]
): PositionedNode | null => {
	if (['panX', 'panY', 'zoom'].every((key) => parameters.has(key))) {
		return null
	}
	if (frameCause(parameters, controller, nodes)) {
		return null
	}
	const node = initialNode(parameters, controller, nodes)
	if (node) {
		controller.center(
			{ x: node.x + node.width / 2, y: node.y + node.height / 2 },
			0.85
		)
		controller.save()
		return node
	}
	if (!parameters.has('zoom')) {
		controller.frame(tools.frameNodes(parameters.get('frame') ?? undefined))
		controller.save()
	}
	return null
}

const focusRequest = (parameters: URLSearchParams): string =>
	['cause', 'focus', 'nodeQuery', 'q', 'frame']
		.map((key) => parameters.get(key) ?? '')
		.join('\n')

const initialNode = (
	parameters: URLSearchParams,
	controller: Controller,
	nodes: PositionedNode[]
): PositionedNode | undefined => {
	const focus = parameters.get('focus') ?? ''
	const query = (
		parameters.get('nodeQuery') ??
		parameters.get('q') ??
		''
	).toLowerCase()
	return (
		controller
			.state()
			.layout.byId.get(
				focus || (query ? (parameters.get('recordId') ?? '') : '')
			) ??
		nodes.find(
			(item) =>
				query &&
				`${item.label} ${item.path} ${item.id}`.toLowerCase().includes(query)
		)
	)
}
const frameCause = (
	parameters: URLSearchParams,
	controller: Controller,
	nodes: PositionedNode[]
): boolean => {
	const cause =
		controller.state().layout.scene.causes[parameters.get('cause') ?? '']
	if (!cause) {
		return false
	}
	const ids = new Set(cause.nodeIds)
	controller.frame(nodes.filter((node) => ids.has(node.id)))
	controller.save()
	return true
}
