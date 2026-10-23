import { button, element } from '../elements.ts'
import styles from '../styles.module.css'
import { cameraState } from './cameraState.ts'
import { isVisibleNode } from './graphGeometry.ts'
import { graphSearch } from './graphSearch.ts'
import type { GraphActions, GraphController, PositionedNode } from './types.ts'

export const graphToolbar = (
	controller: GraphController,
	actions: GraphActions
) => {
	const toolbar = element('div', undefined, styles.sceneToolbar)
	const frameLabel = element('label', 'Frame', styles.field)
	const frame = element('select')
	frame.name = 'frame'
	frame.setAttribute('aria-label', 'Frame')
	const preferred = controller.state().layout.scene.preferredWorkspace
	const scopes = new Map([
		['all', 'Whole graph'],
		['selected', 'Selection and connections'],
		['changed', 'Changed source nodes'],
		...[
			...new Set(controller.state().layout.nodes.map((node) => node.workspace)),
		]
			.sort()
			.map((workspace): [string, string] => [
				`workspace:${workspace}`,
				workspace,
			]),
		...scopeEntries(controller.state().layout.nodes, 'kind'),
		...scopeEntries(controller.state().layout.nodes, 'language'),
	])
	for (const [value, label] of scopes) {
		const option = element('option', label)
		option.value = value
		frame.append(option)
	}
	frame.value = preferred ? `workspace:${preferred}` : 'all'
	const frameNodes = (scope = frame.value): PositionedNode[] => {
		const state = controller.state()
		return state.layout.nodes.filter(
			(node) => isVisibleNode(node, state) && inScope(node, scope, controller)
		)
	}
	const fitScope = (scope = frame.value): void => {
		const nodes = frameNodes(scope)
		if (!nodes.length) {
			notice.textContent = 'No nodes in this frame'
			return
		}
		controller.frame(nodes)
		actions.navigate({ frame: scope, ...cameraState(controller.viewport) })
	}
	frame.addEventListener('change', () => fitScope())
	frameLabel.append(frame)
	const structure = element('label', undefined, styles.structureToggle)
	const toggle = element('input')
	toggle.type = 'checkbox'
	toggle.name = 'structure'
	toggle.checked = true
	toggle.addEventListener('change', () =>
		actions.navigate({ structure: toggle.checked ? null : 'hidden' })
	)
	structure.append(toggle, document.createTextNode('Files / structure'))
	const percentage = element('span', '100%', styles.muted)
	percentage.dataset.zoomLabel = ''
	const notice = element('span', '', styles.muted)
	notice.setAttribute('role', 'status')
	toolbar.append(
		frameLabel,
		button('Fit', () => fitScope()),
		structure,
		button('−', () => {
			controller.zoom(0.8)
			controller.save()
		}),
		percentage,
		button('+', () => {
			controller.zoom(1.25)
			controller.save()
		}),
		button('Center selection', () => {
			const node = controller
				.state()
				.layout.byId.get(controller.state().selected)
			if (node) {
				controller.center({ x: node.x + 125, y: node.y + 34 }, 1)
				controller.save()
			} else {
				fitScope('selected')
			}
		}),
		notice,
		graphSearch(controller, actions)
	)
	const zoomButtons = toolbar.querySelectorAll('button')
	zoomButtons[1]?.setAttribute('aria-label', 'Zoom out')
	zoomButtons[2]?.setAttribute('aria-label', 'Zoom in')
	return {
		toolbar,
		frameNodes,
		sync: (parameters: URLSearchParams): void => {
			toggle.checked = parameters.get('structure') !== 'hidden'
			frame.value =
				parameters.get('frame') ??
				(preferred ? `workspace:${preferred}` : 'all')
			percentage.textContent = `${(controller.viewport.zoom * 100).toFixed(1)}%`
			const search = toolbar.querySelector<HTMLInputElement>(
				'input[name="nodeQuery"]'
			)
			if (search && document.activeElement !== search) {
				search.value = parameters.get('nodeQuery') ?? parameters.get('q') ?? ''
			}
		},
	}
}
const inScope = (
	node: PositionedNode,
	scope: string,
	controller: GraphController
): boolean => {
	if (scope === 'all') {
		return true
	}
	if (scope === 'changed') {
		return node.changed
	}
	if (scope === 'selected') {
		return (
			node.id === controller.state().selected ||
			controller.state().emphasized.has(node.id)
		)
	}
	const values: Record<string, string> = {
		workspace: node.workspace,
		kind: node.kind,
		language: node.language,
	}
	const separator = scope.indexOf(':')
	return values[scope.slice(0, separator)] === scope.slice(separator + 1)
}

const scopeEntries = (
	nodes: PositionedNode[],
	key: 'kind' | 'language'
): [string, string][] =>
	[...new Set(nodes.map((node) => node[key] ?? 'unknown'))]
		.sort()
		.map((value) => [`${key}:${value}`, `${key} · ${value}`])
