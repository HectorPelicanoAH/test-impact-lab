import type { Page, ViewRow } from '../../src/viewer/types.ts'
import { button, element } from './elements.ts'
import type { Navigate } from './navigation.ts'
import { renderPager } from './renderPage.ts'
import styles from './styles.module.css'

const fileButton = (
	row: ViewRow,
	selected: string | undefined,
	navigate: Navigate
): HTMLButtonElement => {
	const item = button(
		'',
		() =>
			navigate({
				sourceId: row.id,
				line: null,
				find: null,
				recordType: 'source',
				recordId: row.id,
			}),
		styles.fileButton
	)
	item.title = `${row.path} · ${row.columns.Snapshot}`
	item.setAttribute('aria-label', item.title)
	item.setAttribute('aria-current', String(row.id === selected))
	item.append(
		element(
			'span',
			compactName(row.path.split('/').at(-1) ?? row.path),
			styles.fileName
		)
	)
	item.append(element('small', row.columns.Snapshot, styles.muted))
	return item
}
const compactName = (name: string): string =>
	name.length > 24 ? `${name.slice(0, 11)}…${name.slice(-11)}` : name
export const renderFileTree = (
	page: Page,
	selected: string | undefined,
	navigate: Navigate
): HTMLElement => {
	const files = element('aside', undefined, styles.fileTree)
	files.setAttribute('aria-label', 'Source files')
	files.append(element('h3', `Files · ${page.matched}`))
	const folders = new Map<string, HTMLDetailsElement>()
	for (const row of page.items) {
		const folder = row.path.split('/').slice(0, -1).join('/') || '(root)'
		let group = folders.get(folder)
		if (!group) {
			group = element('details')
			group.open = true
			const title = element('summary', folder.split('/').slice(-2).join('/'))
			title.title = folder
			group.append(title)
			folders.set(folder, group)
			files.append(group)
		}
		group.append(fileButton(row, selected, navigate))
	}
	if (!page.items.length) {
		files.append(
			element('p', 'No files match. Clear the search or filters.', styles.muted)
		)
	}
	renderPager(files, page, 'code', { change: navigate })
	return files
}
