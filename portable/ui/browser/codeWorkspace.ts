import type { Page } from '../../src/viewer/types.ts'
import type { DataSource } from './dataSource.ts'
import { element, showError } from './elements.ts'
import { renderFileTree } from './fileTree.ts'
import type { Navigate } from './navigation.ts'
import { renderSourceView } from './sourceView.ts'
import styles from './styles.module.css'

export const createCodeWorkspace = (
	source: DataSource,
	container: HTMLElement,
	navigate: Navigate
) => {
	let sequence = 0
	return async (page: Page, state: URLSearchParams): Promise<void> => {
		const token = ++sequence
		const layout = element('div', undefined, styles.codeWorkspace)
		const selected = state.get('sourceId') ?? page.items[0]?.id
		if (!state.has('sourceId') && selected) {
			navigate({ sourceId: selected, recordType: 'source', recordId: selected })
			return
		}
		const files = renderFileTree(page, selected, navigate)
		const editor = element('section', undefined, styles.sourcePane)
		editor.setAttribute('aria-label', 'Source reader')
		editor.append(
			element(
				'p',
				selected ? 'Reading exact source…' : 'Select a source file.',
				styles.muted
			)
		)
		layout.append(files, editor)
		container.replaceChildren(layout)
		if (!selected) {
			return
		}
		await readSource(
			source,
			selected,
			editor,
			state,
			navigate,
			() => token === sequence
		)
	}
}

const readSource = async (
	source: DataSource,
	selected: string,
	editor: HTMLElement,
	state: URLSearchParams,
	navigate: Navigate,
	current: () => boolean
): Promise<void> => {
	try {
		const detail = await source.detail('source', selected, 0)
		if (!current() || !editor.isConnected) {
			return
		}
		if (detail.source) {
			renderSourceView(editor, detail.source, state, navigate)
		}
	} catch (error) {
		if (current()) {
			editor.replaceChildren(
				element(
					'p',
					'Could not read this source. Select another file.',
					styles.notice
				)
			)
			showError(error)
		}
	}
}
