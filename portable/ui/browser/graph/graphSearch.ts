import { button, element } from '../elements.ts'
import styles from '../styles.module.css'
import { cameraState } from './cameraState.ts'
import { isVisibleNode } from './graphGeometry.ts'
import type { GraphActions, GraphController, PositionedNode } from './types.ts'

const labelOf = (node: PositionedNode): string =>
	`${node.label} · ${node.kind} · ${node.path} · ${node.id.slice(-7)}`
export const graphSearch = (
	controller: GraphController,
	actions: GraphActions
): HTMLElement => {
	const field = element('form', undefined, styles.graphSearch)
	field.setAttribute('aria-label', 'Find and center a graph node')
	const label = element('label', 'Find node', styles.field)
	const input = element('input')
	input.name = 'nodeQuery'
	input.type = 'search'
	input.autocomplete = 'off'
	input.spellcheck = false
	input.placeholder = 'Name, file or node ID'
	input.maxLength = 512
	input.setAttribute('list', 'graph-node-suggestions')
	const suggestions = element('datalist')
	suggestions.id = 'graph-node-suggestions'
	const options = new Map<string, PositionedNode>()
	const searchIndex = controller.state().layout.nodes.map((node) => ({
		node,
		text: `${node.label} ${node.path} ${node.id} ${node.kind}`.toLowerCase(),
	}))
	const matches = (query: string): PositionedNode[] =>
		searchIndex
			.filter(
				(entry) =>
					entry.text.includes(query.toLowerCase()) &&
					isVisibleNode(entry.node, controller.state())
			)
			.map((entry) => entry.node)
	let lastQuery = ''
	let offset = -1
	const result = element('span', '', styles.muted)
	result.setAttribute('role', 'status')
	const reveal = (node: PositionedNode): void => {
		controller.center(
			{ x: node.x + node.width / 2, y: node.y + node.height / 2 },
			1
		)
		actions.navigate({
			...cameraState(controller.viewport),
			nodeQuery: input.value,
			recordType: 'node',
			recordId: node.id,
		})
	}
	input.addEventListener('input', () => {
		lastQuery = ''
		offset = -1
		const candidates = input.value ? matches(input.value) : []
		suggestions.replaceChildren()
		options.clear()
		for (const node of candidates.slice(0, 30)) {
			const option = element('option')
			option.value = labelOf(node)
			options.set(option.value, node)
			suggestions.append(option)
		}
		result.textContent = `${candidates.length} matches · search centers the viewport`
	})
	input.addEventListener('change', () => {
		const node = options.get(input.value)
		if (node) {
			reveal(node)
		}
	})
	field.addEventListener('submit', (event) => {
		event.preventDefault()
		const exact = options.get(input.value)
		if (exact) {
			reveal(exact)
			return
		}
		const candidates = input.value ? matches(input.value) : []
		if (lastQuery !== input.value) {
			offset = -1
		}
		lastQuery = input.value
		offset = (offset + 1) % Math.max(1, candidates.length)
		const node = candidates[offset]
		if (node) {
			reveal(node)
		}
		result.textContent = node
			? `${offset + 1} / ${candidates.length} · ${node.label}`
			: 'No matching node'
	})
	const submit = button('Find next', () => field.requestSubmit())
	label.append(input, suggestions)
	field.append(label, submit, result)
	return field
}
