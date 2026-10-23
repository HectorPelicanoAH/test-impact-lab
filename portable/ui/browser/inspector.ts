import type { Detail, DetailEntry, Reference } from '../../src/viewer/types.ts'
import type { DataSource } from './dataSource.ts'
import { button, code, element, number } from './elements.ts'
import { inspectorSource } from './inspectorSource.ts'
import { viewState } from './navigation.ts'
import styles from './styles.module.css'

export const createInspector = (
	source: DataSource,
	container: HTMLElement,
	navigate: (options: Record<string, string | null>) => void
) => {
	let sequence = 0
	let origin: HTMLElement | null = null
	const inspect = async (
		type: string,
		id: string,
		offset = 0,
		trigger?: HTMLElement
	): Promise<void> => {
		const token = ++sequence
		if (trigger) {
			origin = trigger
		}
		navigate({ recordType: type, recordId: id })
		container.replaceChildren(element('p', 'Reading record…', styles.muted))
		const detail = await source.detail(type, id, offset)
		if (token !== sequence) {
			return
		}
		container.replaceChildren()
		const title = element('h2', detail.title)
		title.tabIndex = -1
		container.append(
			inspectorHeading(navigate),
			title,
			button('Return to results', () => {
				if (origin?.isConnected) {
					origin.focus()
				} else {
					document.getElementById('results-heading')?.focus()
				}
			})
		)
		if (['node', 'edge', 'evidence'].includes(type)) {
			container.append(
				inspectorSource(
					detail,
					type,
					source,
					navigate,
					() => token === sequence
				)
			)
		}
		renderProperties(container, detail)
		if (type === 'node') {
			container.append(
				button('Explore dependencies / consumers', () =>
					navigate(
						viewState('graph', {
							section: 'graph',
							focus: id,
							cause: null,
							offset: null,
							q: null,
							path: null,
							kind: null,
							category: null,
						})
					)
				)
			)
		}
		if (type === 'source') {
			container.append(
				button('Open in Code', () =>
					navigate(
						viewState('code', {
							section: 'code',
							sourceId: id,
							line: null,
							offset: null,
							q: null,
							path: null,
							kind: null,
							category: null,
						})
					)
				)
			)
		}
		renderSource(container, detail)
		renderEntries(container, detail, inspect, navigate)
		container.append(
			element(
				'p',
				`${number(detail.offset)}–${number(detail.offset + detail.entries.length)} of ${number(detail.total)} detail entries`,
				styles.muted
			),
			detailPager(detail, type, inspect)
		)
		title.focus()
	}
	return Object.assign(inspect, {
		clear: (): void => {
			sequence++
			container.replaceChildren(
				element('h2', 'Follow the evidence'),
				element('p', 'Select a file, node, relationship or test.', styles.muted)
			)
		},
	})
}

const inspectorHeading = (
	navigate: (options: Record<string, string | null>) => void
): HTMLElement => {
	const header = element('div', undefined, styles.heading)
	header.append(
		element('span', 'Inspector', styles.eyebrow),
		button('Close inspector', () => {
			navigate({ recordType: null, recordId: null })
			const target =
				document.querySelector<HTMLCanvasElement>('[data-graph-viewport]') ??
				document.getElementById('results-heading')
			target?.focus()
		})
	)
	return header
}
type Inspect = (
	type: string,
	id: string,
	offset?: number,
	trigger?: HTMLElement
) => Promise<void>
const referenceButton = (
	reference: Reference,
	inspect: Inspect,
	navigate: (options: Record<string, string | null>) => void,
	line: string | null
): HTMLButtonElement => {
	const action =
		reference.type === 'source'
			? () =>
					navigate(
						viewState('code', {
							section: 'code',
							sourceId: reference.id,
							line,
							offset: null,
							q: null,
							path: null,
							kind: null,
							category: null,
							recordType: 'source',
							recordId: reference.id,
						})
					)
			: reference.type === 'cause'
				? () =>
						navigate(
							viewState('graph', {
								section: 'graph',
								cause: reference.id,
								focus: null,
								offset: null,
							})
						)
				: async () => await inspect(reference.type, reference.id)
	return button(reference.label, action)
}
const detailPager = (
	detail: Detail,
	type: string,
	inspect: Inspect
): HTMLElement => {
	const pager = element('div', undefined, styles.toolbar)
	const previous = button(
		'Previous detail entries',
		async () => await inspect(type, detail.id, Math.max(0, detail.offset - 20))
	)
	const next = button(
		'More detail entries',
		async () => await inspect(type, detail.id, detail.offset + 20)
	)
	previous.disabled = detail.offset === 0
	next.disabled = detail.offset + detail.entries.length >= detail.total
	pager.append(previous, next)
	return pager
}

const renderSource = (container: HTMLElement, detail: Detail): void => {
	if (detail.source) {
		container.append(
			element('p', `Source: ${detail.source.status}`, styles.notice)
		)
		if (detail.source.content === undefined) {
			container.append(
				element(
					'p',
					'Exact source bytes are unavailable for this locator.',
					styles.muted
				)
			)
		}
	}
}

const renderEntries = (
	container: HTMLElement,
	detail: Detail,
	inspect: Inspect,
	navigate: (options: Record<string, string | null>) => void
): void => {
	for (const entry of detail.entries) {
		const linked = linkedEntry(entry, inspect, navigate)
		if (linked) {
			container.append(linked)
			continue
		}
		const block = element('section', undefined, styles.entry)
		block.append(
			element('h3', entry.label),
			element('p', entry.description, styles.muted)
		)
		const references = element('div', undefined, styles.toolbar)
		for (const reference of entry.references) {
			references.append(
				referenceButton(reference, inspect, navigate, sourceLine(entry.data))
			)
		}
		block.append(references)
		if (entry.data !== undefined) {
			const disclosure = element('details')
			disclosure.append(element('summary', 'Record details'), code(entry.data))
			block.append(disclosure)
		}
		container.append(block)
	}
}

const linkedEntry = (
	entry: DetailEntry,
	inspect: Inspect,
	navigate: (options: Record<string, string | null>) => void
): HTMLElement | null => {
	const edge = entry.references.find((reference) => reference.type === 'edge')
	const source = entry.references.find(
		(reference) => reference.type === 'source'
	)
	if (edge) {
		const other = entry.references.find(
			(reference) => reference.type === 'node'
		)
		return button(
			`${entry.description} · ${entry.label} → ${other?.label ?? ''}`,
			async () => await inspect('edge', edge.id),
			styles.connectionEntry
		)
	}
	if (!source) {
		return null
	}
	const block = element('section', undefined, styles.sourceLocator)
	const details = element('details')
	details.append(
		element('summary', 'Locator details'),
		element('p', entry.description, styles.muted),
		code(entry.data)
	)
	block.append(
		referenceButton(source, inspect, navigate, sourceLine(entry.data)),
		details
	)
	return block
}

const sourceLine = (data: unknown): string | null => {
	if (!data || typeof data !== 'object' || !('start' in data)) {
		return null
	}
	const start = data.start
	return start &&
		typeof start === 'object' &&
		'line' in start &&
		typeof start.line === 'number'
		? String(start.line)
		: null
}

const renderProperties = (container: HTMLElement, detail: Detail): void => {
	const properties = element('dl')
	const identity = element('details')
	const identifiers = element('dl')
	identity.append(
		element('summary', 'Identity and source revision'),
		identifiers
	)
	for (const [name, value] of Object.entries(detail.columns)) {
		const target = ['ID', 'Expected SHA256', 'Revision', 'Path'].includes(name)
			? identifiers
			: properties
		target.append(element('dt', name, styles.muted), element('dd', value))
	}
	container.append(properties)
	if (identifiers.children.length) {
		container.append(identity)
	}
}
