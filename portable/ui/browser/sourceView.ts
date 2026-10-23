import type { SourceRecord } from '../../src/viewer/types.ts'
import { button, element, number } from './elements.ts'
import { highlightCode } from './highlightCode.ts'
import type { Navigate } from './navigation.ts'
import styles from './styles.module.css'

const LINE_PAGE = 160
export const renderSourceView = (
	container: HTMLElement,
	source: SourceRecord,
	state: URLSearchParams,
	navigate: Navigate
): void => {
	container.replaceChildren()
	const heading = element('header', undefined, styles.editorHeader)
	heading.append(
		element('span', source.path),
		element('span', `${source.snapshot} · ${source.status}`, styles.badge)
	)
	container.append(heading)
	if (source.content === undefined) {
		container.append(
			element(
				'p',
				'Source bytes are unavailable for this version. Include source contents when preparing the inspection artifact.',
				styles.notice
			)
		)
		return
	}
	const lines = source.content.split('\n')
	const current = Math.min(
		lines.length,
		Math.max(1, Number(state.get('line')) || 1)
	)
	const first = Math.floor((current - 1) / LINE_PAGE) * LINE_PAGE
	const toolbar = element('div', undefined, styles.toolbar)
	const searchLabel = element('label', 'Find in file', styles.field)
	const search = element('input')
	search.type = 'search'
	search.name = 'sourceSearch'
	search.autocomplete = 'off'
	search.spellcheck = false
	search.value = state.get('find') ?? ''
	searchLabel.append(search)
	const result = element('span', '', styles.muted)
	toolbar.append(
		searchLabel,
		button('Find next', () => {
			const query = search.value.toLowerCase()
			if (!query) {
				return
			}
			const positions = lines.flatMap((line, index) =>
				line.toLowerCase().includes(query) ? [index + 1] : []
			)
			const next = positions.find((line) => line > current) ?? positions[0]
			if (next) {
				navigate({ line: String(next), find: search.value })
			}
			result.textContent = `${positions.length} matching lines`
		}),
		result
	)
	const content = element('pre', undefined, styles.sourceCode)
	content.tabIndex = 0
	content.setAttribute('aria-label', `Source: ${source.path}`)
	for (const [offset, text] of lines
		.slice(first, first + LINE_PAGE)
		.entries()) {
		const line = element('span', undefined, styles.sourceLine)
		line.dataset.selected = String(first + offset + 1 === current)
		const lineNumber = element('span', first + offset + 1, styles.lineNumber)
		lineNumber.setAttribute('aria-hidden', 'true')
		line.append(lineNumber, highlightCode(text))
		content.append(line)
	}
	const previous = button('Previous lines', () =>
		navigate({ line: String(Math.max(1, first - LINE_PAGE + 1)) })
	)
	const next = button('Next lines', () =>
		navigate({ line: String(first + LINE_PAGE + 1) })
	)
	previous.disabled = first === 0
	next.disabled = first + LINE_PAGE >= lines.length
	const pager = element('div', undefined, styles.toolbar)
	pager.append(
		previous,
		element(
			'span',
			`${first + 1}–${Math.min(first + LINE_PAGE, lines.length)} / ${number(lines.length)} lines`,
			styles.muted
		),
		next
	)
	container.append(toolbar, content, pager)
	content
		.querySelector('[data-selected="true"]')
		?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
