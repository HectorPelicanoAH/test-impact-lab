import { createCodeWorkspace } from './codeWorkspace.ts'
import { createDataSource } from './dataSource.ts'
import { showError } from './elements.ts'
import { buildFilters } from './filters.ts'
import { createGraphWorkspace } from './graph/createGraphWorkspace.ts'
import { createInspector } from './inspector.ts'
import type { Navigate } from './navigation.ts'
import { renderOverview } from './overview.ts'
import { renderPage } from './renderPage.ts'
import {
	createWorkspaceShell,
	graphTools,
	syncWorkspaceNavigation,
} from './workspaceShell.ts'

const stateOf = (): URLSearchParams =>
	new URLSearchParams(location.hash.slice(1))
const change: Navigate = (values) => {
	const state = stateOf()
	for (const [key, value] of Object.entries(values)) {
		if (value === null) {
			state.delete(key)
		} else {
			state.set(key, value)
		}
	}
	const hash = state.toString()
	if (location.hash.slice(1) !== hash) {
		location.hash = hash
	}
}

const start = async (): Promise<void> => {
	const shell = createWorkspaceShell(change)
	const source = await createDataSource()
	const summary = await source.summary()
	if (!stateOf().has('section')) {
		const initial = stateOf()
		initial.set('section', 'graph')
		history.replaceState(null, '', `#${initial.toString()}`)
	}
	shell.title.textContent = summary.title
	shell.status.textContent = source.staticReport
		? 'Offline report · recorded evidence · no tests run here'
		: 'Local artifact · read-only evidence · source status shown per locator'
	const inspect = createInspector(source, shell.inspector, change)
	const code = createCodeWorkspace(source, shell.results, change)
	const graph = createGraphWorkspace(source, shell.results, {
		navigate: change,
		inspect: async (type, id) => {
			await inspect(type, id)
		},
	})
	const filters = buildFilters(summary.facets, change)
	const tools = graphTools(change)
	shell.main.append(filters.container, tools, shell.explorer)
	let sequence = 0
	let inspectedRecord = ''
	let queryKey = ''
	let controller: AbortController | undefined
	const refresh = async (
		state: URLSearchParams,
		signal: AbortSignal
	): Promise<void> => {
		const section = state.get('section') ?? 'graph'
		shell.main.dataset.view = section
		syncWorkspaceNavigation(shell, section, change, summary.sections)
		filters.sync(state)
		filters.container.hidden = ['summary', 'graph'].includes(section)
		tools.hidden = section !== 'groups'
		syncTools(tools, state)
		if (section === 'summary') {
			renderOverview(shell.results, summary, inspect)
			return
		}
		if (section === 'graph') {
			await graph(state, signal)
			return
		}
		const page = await source.page(section, Object.fromEntries(state), signal)
		if (signal.aborted) {
			return
		}
		if (section === 'code') {
			await code(page, state)
		} else {
			renderPage(shell.results, page, section, state, { inspect, change })
		}
	}
	const restoreSelection = async (state: URLSearchParams): Promise<void> => {
		if (!state.has('recordId')) {
			if (inspectedRecord) {
				inspectedRecord = ''
				inspect.clear()
			}
			return
		}
		const key = `${state.get('recordType')}:${state.get('recordId')}`
		if (state.has('recordId') && key !== inspectedRecord) {
			inspectedRecord = key
			await inspect(
				state.get('recordType') ?? 'node',
				state.get('recordId') ?? ''
			)
		}
	}
	const update = async (): Promise<void> => {
		const state = stateOf()
		const query = queryOf(state)
		if (query.toString() !== queryKey || sequence === 0) {
			queryKey = query.toString()
			const token = ++sequence
			controller?.abort()
			controller = new AbortController()
			shell.results.setAttribute('aria-busy', 'true')
			try {
				await refresh(state, controller.signal)
			} finally {
				if (token === sequence) {
					shell.results.removeAttribute('aria-busy')
				}
			}
		}
		await restoreSelection(stateOf())
		syncInspector(shell.inspector, shell.explorer)
		syncGraphSelection(shell.results)
		shell.results.dataset.state = stateOf().toString()
	}
	window.addEventListener('hashchange', () => {
		update().catch(showError)
	})
	await update()
	document.documentElement.dataset.ready = 'true'
}

const syncInspector = (inspector: HTMLElement, explorer: HTMLElement): void => {
	const hidden =
		stateOf().get('section') === 'graph' && !stateOf().has('recordId')
	inspector.hidden = hidden
	explorer.dataset.inspectorOpen = String(!hidden)
}
start().catch(showError)

const queryOf = (state: URLSearchParams): URLSearchParams => {
	const query = new URLSearchParams(state)
	query.delete('recordId')
	query.delete('recordType')
	if (state.get('section') === 'graph') {
		for (const key of ['panX', 'panY', 'zoom']) {
			query.delete(key)
		}
	}
	return query
}

const syncGraphSelection = (results: HTMLElement): void => {
	results
		.querySelector('[data-graph-viewport]')
		?.dispatchEvent(new Event('viewportchange'))
}

const syncTools = (tools: HTMLElement, state: URLSearchParams): void => {
	for (const select of tools.querySelectorAll('select')) {
		select.value = state.get(select.name) ?? select.options[0].value
	}
}
