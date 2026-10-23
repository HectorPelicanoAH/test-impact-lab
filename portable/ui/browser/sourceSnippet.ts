import type {
	SourcePreview,
	SourceRange,
	SourceRecord,
} from '../../src/viewer/types.ts'
import { button, element } from './elements.ts'
import { highlightCode } from './highlightCode.ts'
import styles from './styles.module.css'

const PAGE_LINES = 80
export const renderSourceSnippet = (
	container: HTMLElement,
	source: SourceRecord,
	preview: SourcePreview
): void => {
	container.append(
		element(
			'p',
			`${source.path} · ${source.snapshot} · ${source.status}`,
			styles.muted
		)
	)
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
	const range = preview.range
	let first = Math.min(
		Math.max(0, (range?.start.line ?? 1) - 4),
		Math.max(0, lines.length - 1)
	)
	let pageLines = range
		? Math.min(PAGE_LINES, Math.max(1, range.end.line - first + 3))
		: PAGE_LINES
	const body = element('div')
	const render = (): void => {
		const pre = element('pre', undefined, styles.sourceCode)
		pre.tabIndex = 0
		pre.setAttribute('aria-label', `Source preview: ${source.path}`)
		for (
			let offset = first;
			offset < Math.min(first + pageLines, lines.length);
			offset++
		) {
			pre.append(snippetLine(lines[offset], offset + 1, range))
		}
		const pager = element('div', undefined, styles.toolbar)
		const previous = button('Earlier source lines', () => {
			first = Math.max(0, first - PAGE_LINES)
			pageLines = PAGE_LINES
			render()
		})
		const next = button('Later source lines', () => {
			first += pageLines
			pageLines = PAGE_LINES
			render()
		})
		previous.disabled = first === 0
		next.disabled = first + pageLines >= lines.length
		pager.append(previous, next)
		body.replaceChildren(
			element(
				'p',
				`${first + 1}–${Math.min(first + pageLines, lines.length)} / ${lines.length} lines${range ? ` · recorded range L${range.start.line}:${range.start.column}–L${range.end.line}:${range.end.column} (end exclusive; columns start at 0)` : ' · file preview; no exact range recorded'}`,
				styles.muted
			),
			pre,
			pager
		)
	}
	container.append(body)
	render()
}
const snippetLine = (
	text: string,
	number: number,
	range?: SourceRange
): HTMLElement => {
	const line = element('span', undefined, styles.sourceLine)
	const gutter = element('span', number, styles.lineNumber)
	gutter.setAttribute('aria-hidden', 'true')
	line.append(gutter)
	const start = number === range?.start.line ? range.start.column : 0
	const end = number === range?.end.line ? range.end.column : text.length
	if (
		!range ||
		number < range.start.line ||
		number > range.end.line ||
		end <= start
	) {
		line.append(highlightCode(text))
		return line
	}
	line.dataset.selected = 'true'
	const marked = element('mark', undefined, styles.sourceHighlight)
	marked.append(highlightCode(text.slice(start, end)))
	if (start > 0) {
		line.append(highlightCode(text.slice(0, start)))
	}
	line.append(marked)
	if (end < text.length) {
		line.append(highlightCode(text.slice(end)))
	}
	return line
}
