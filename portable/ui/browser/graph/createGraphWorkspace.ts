import type { DataSource } from '../dataSource.ts'
import { button, element } from '../elements.ts'
import { renderPage } from '../renderPage.ts'
import styles from '../styles.module.css'
import { createGraphCanvas } from './createGraphCanvas.ts'
import type { GraphActions } from './types.ts'

export const createGraphWorkspace = (
	source: DataSource,
	container: HTMLElement,
	actions: GraphActions
) => {
	let pending: Promise<ReturnType<typeof createGraphCanvas>> | undefined
	let sequence = 0
	const load = (): Promise<ReturnType<typeof createGraphCanvas>> => {
		pending ??= source
			.scene()
			.then((scene) => createGraphCanvas(scene, actions))
			.catch((error: unknown) => {
				pending = undefined
				throw error
			})
		return pending
	}
	return async (
		parameters: URLSearchParams,
		signal: AbortSignal
	): Promise<void> => {
		const token = ++sequence
		if (!container.querySelector('[data-graph-viewport]')) {
			container.replaceChildren(
				element('p', 'Loading the complete graph…', styles.notice)
			)
		}
		const graph = await load()
		if (signal.aborted || token !== sequence) {
			return
		}
		if (parameters.get('table') === 'open') {
			await renderTable(source, container, parameters, actions, signal)
			return
		}
		if (!graph.shell.isConnected) {
			container.replaceChildren(graph.shell)
		}
		graph.sync(parameters)
	}
}

const renderTable = async (
	source: DataSource,
	container: HTMLElement,
	parameters: URLSearchParams,
	actions: GraphActions,
	signal: AbortSignal
): Promise<void> => {
	const query = new URLSearchParams({
		q: parameters.get('tableQuery') ?? '',
		offset: parameters.get('offset') ?? '0',
	})
	const page = await source.page('graph', Object.fromEntries(query), signal)
	if (signal.aborted) {
		return
	}
	const table = element('section')
	const state = new URLSearchParams(parameters)
	state.set('canvas', 'hidden')
	renderPage(table, page, 'graph', state, {
		change: actions.navigate,
		inspect: async (type, id) => {
			await actions.inspect(type, id)
		},
	})
	table.prepend(
		button('Return to complete graph', () => actions.navigate({ table: null }))
	)
	container.replaceChildren(table)
	table.prepend(tableSearch(parameters, actions))
}

const tableSearch = (
	parameters: URLSearchParams,
	actions: GraphActions
): HTMLElement => {
	const form = element('form', undefined, styles.toolbar)
	const label = element('label', 'Filter node table', styles.field)
	const input = element('input')
	input.type = 'search'
	input.name = 'tableQuery'
	input.autocomplete = 'off'
	input.spellcheck = false
	input.value = parameters.get('tableQuery') ?? ''
	label.append(input)
	const submit = element('button', 'Apply')
	submit.type = 'submit'
	form.append(label, submit)
	form.addEventListener('submit', (event) => {
		event.preventDefault()
		actions.navigate({ tableQuery: input.value || null, offset: null })
	})
	return form
}
