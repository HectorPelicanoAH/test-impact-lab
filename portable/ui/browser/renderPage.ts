import type { Page } from '../../src/viewer/types.ts'
import { button, element, number } from './elements.ts'
import styles from './styles.module.css'

interface Actions {
	readonly change: (values: Record<string, string | null>) => void
	readonly inspect: (
		type: string,
		id: string,
		offset?: number,
		trigger?: HTMLElement
	) => Promise<void>
}
const COLUMNS: Record<string, string[]> = {
	cases: ['Category', 'Availability', 'Runner', 'Snapshot'],
	graph: ['Kind', 'Role'],
	units: ['Cases', 'Attribution', 'Capture', 'Captured run', 'Snapshot'],
	impact: ['Decision', 'Causes', 'Certificate'],
	runs: ['Outcome', 'Runner', 'Retries'],
	evidence: ['Class', 'Validity', 'Capture', 'Snapshot'],
	diagnostics: ['Action', 'Cause'],
}
export const renderPage = (
	container: HTMLElement,
	page: Page,
	section: string,
	state: URLSearchParams,
	actions: Actions
): void => {
	container.replaceChildren()
	const counts = element(
		'p',
		`${number(page.matched)} matching of ${number(page.total)} records · ${number(page.total - page.matched)} filtered out. Only this page is rendered.`,
		styles.muted
	)
	counts.setAttribute('aria-live', 'polite')
	container.append(counts)
	if (page.neighborhoodLimited) {
		container.append(
			element(
				'p',
				'Neighborhood bounded to 5,000 nodes / 20,000 examined relationships. Global search and individual link pages still retain all facts.',
				styles.notice
			)
		)
	}
	if (state.get('focus') || state.get('cause')) {
		container.append(
			button('Return to all graph facts', () =>
				actions.change({ focus: null, cause: null, offset: null })
			)
		)
	}
	if (section === 'groups') {
		renderGroups(container, page, state, actions)
	} else if (section === 'graph') {
		const disclosure = element('details')
		disclosure.open = state.get('table') === 'open'
		disclosure.addEventListener('toggle', () => {
			const value = disclosure.open ? 'open' : null
			if (disclosure.isConnected && state.get('table') !== value) {
				actions.change({ table: value })
			}
		})
		disclosure.append(element('summary', 'Browse nodes as a table'))
		renderRows(disclosure, page, section, actions)
		container.append(disclosure)
	} else {
		renderRows(container, page, section, actions)
	}
	renderPager(container, page, section, actions)
}
export const renderPager = (
	container: HTMLElement,
	page: Page,
	section: string,
	actions: Pick<Actions, 'change'>
): void => {
	const total = section === 'groups' ? page.groupCount : page.matched
	const shown =
		section === 'groups' ? (page.groups?.length ?? 0) : page.items.length
	const pager = element('div', undefined, styles.toolbar)
	const previous = button('Previous page', () =>
		actions.change({ offset: String(Math.max(0, page.offset - page.limit)) })
	)
	const next = button('Next page', () =>
		actions.change({ offset: String(page.offset + page.limit) })
	)
	previous.disabled = page.offset === 0
	next.disabled = page.offset + shown >= total
	pager.append(
		previous,
		element(
			'span',
			`${shown ? page.offset + 1 : 0}–${page.offset + shown} of ${number(total)}`,
			styles.muted
		),
		next
	)
	container.append(pager)
}

const table = (
	headers: string[]
): { scroll: HTMLElement; body: HTMLTableSectionElement } => {
	const scroll = element('div', undefined, styles.tableScroll)
	const value = element('table', undefined, styles.table)
	const head = element('thead')
	const row = element('tr')
	for (const header of headers) {
		const cell = element('th', header)
		cell.scope = 'col'
		row.append(cell)
	}
	head.append(row)
	const body = element('tbody')
	value.append(head, body)
	scroll.append(value)
	return { scroll, body }
}
const renderRows = (
	container: HTMLElement,
	page: Page,
	section: string,
	actions: Actions
): void => {
	if (!page.items.length) {
		container.append(
			element(
				'p',
				'No records match these filters. Reset filters or choose another view.'
			)
		)
		return
	}
	const columns = COLUMNS[section] ?? []
	const result = table(['Record', ...columns])
	for (const row of page.items) {
		const entry = element('tr')
		const name = element('td')
		const trigger = button(
			row.label,
			async () => await actions.inspect(row.type, row.id, 0, trigger),
			styles.rowButton
		)
		name.append(trigger)
		if (row.path && row.path !== row.label) {
			name.append(element('p', row.path, styles.muted))
		}
		entry.append(name)
		for (const key of columns) {
			entry.append(element('td', row.columns[key] ?? 'unknown'))
		}
		result.body.append(entry)
	}
	container.append(result.scroll)
}
const renderGroups = (
	container: HTMLElement,
	page: Page,
	state: URLSearchParams,
	actions: Actions
): void => {
	const result = table(['Scope', 'Nodes', 'Incident relationships'])
	for (const group of page.groups ?? []) {
		const row = element('tr')
		const name = element('td')
		name.append(
			button(group.id, () =>
				actions.change({
					[state.get('groupBy') ?? 'workspace']: group.id,
					section: 'graph',
					frame: `${state.get('groupBy') ?? 'workspace'}:${group.id}`,
					offset: null,
				})
			)
		)
		row.append(
			name,
			element('td', number(group.nodes)),
			element('td', number(group.edges))
		)
		result.body.append(row)
	}
	container.append(
		element(
			'p',
			'Groups derive from package paths or directory structure. Cross-group relationships count once for each touched group.',
			styles.muted
		),
		result.scroll
	)
}
