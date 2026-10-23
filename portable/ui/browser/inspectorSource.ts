import type { Detail, SourcePreview } from '../../src/viewer/types.ts'
import type { DataSource } from './dataSource.ts'
import { button, element } from './elements.ts'
import { type Navigate, viewState } from './navigation.ts'
import { renderSourceSnippet } from './sourceSnippet.ts'
import styles from './styles.module.css'

export const inspectorSource = (
	detail: Detail,
	type: string,
	source: DataSource,
	navigate: Navigate,
	isCurrent: () => boolean
): HTMLElement => {
	const section = element('section', undefined, styles.inspectorSource)
	section.append(
		element('h3', type === 'edge' ? 'Relationship origin' : 'Source code')
	)
	const previews = detail.sourcePreviews ?? []
	if (!previews.length) {
		section.append(
			element(
				'p',
				type === 'edge'
					? 'No source locator was recorded for this relationship. Evidence details remain available below.'
					: 'No source locator was recorded for this element.',
				styles.muted
			)
		)
		return section
	}
	const label = element('label', 'Source version / location', styles.field)
	const select = element('select')
	select.setAttribute('aria-label', 'Source version / location')
	for (const [index, preview] of previews.entries()) {
		const option = element(
			'option',
			`${preview.label}${preview.range ? ` · L${preview.range.start.line}` : ''}`
		)
		option.value = String(index)
		select.append(option)
	}
	select.selectedIndex = Math.max(
		0,
		previews.findIndex((preview) => preview.label.startsWith('target ·'))
	)
	label.append(select)
	const content = element('div')
	section.append(label, content)
	let sequence = 0
	const load = async (): Promise<void> => {
		const token = ++sequence
		const preview = previews[select.selectedIndex]
		if (!preview) {
			return
		}
		await loadPreview(
			preview,
			content,
			source,
			navigate,
			() => isCurrent() && token === sequence
		)
	}

	select.addEventListener('change', () => {
		void load()
	})
	void load()
	return section
}
const openSource = (
	preview: SourcePreview,
	navigate: Navigate
): HTMLButtonElement =>
	button('Open source in Code', () =>
		navigate(
			viewState('code', {
				sourceId: preview.sourceId,
				line: String(preview.range?.start.line ?? 1),
				recordType: 'source',
				recordId: preview.sourceId,
			})
		)
	)

const loadPreview = async (
	preview: SourcePreview,
	content: HTMLElement,
	source: DataSource,
	navigate: Navigate,
	isCurrent: () => boolean
): Promise<void> => {
	content.replaceChildren(element('p', 'Reading exact source…', styles.muted))
	content.setAttribute('aria-busy', 'true')
	try {
		const result = await source.detail('source', preview.sourceId, 0)
		if (!isCurrent()) {
			return
		}
		content.replaceChildren()
		if (result.source) {
			renderSourceSnippet(content, result.source, preview)
		}
		content.append(openSource(preview, navigate))
	} catch (error) {
		if (isCurrent()) {
			content.replaceChildren(
				element(
					'p',
					error instanceof Error ? error.message : 'Could not read source.',
					styles.notice
				)
			)
		}
	} finally {
		if (isCurrent()) {
			content.removeAttribute('aria-busy')
		}
	}
}
