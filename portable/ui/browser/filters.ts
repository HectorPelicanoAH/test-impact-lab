import { FACET_KEYS } from '../../src/viewer/queryWorkspace.ts'
import { button, element } from './elements.ts'
import styles from './styles.module.css'

export const buildFilters = (
	facets: Record<string, string[]>,
	change: (values: Record<string, string | null>) => void
): { container: HTMLElement; sync: (state: URLSearchParams) => void } => {
	const container = element(
		'section',
		undefined,
		`${styles.panel} ${styles.filterPanel}`
	)
	container.setAttribute('aria-label', 'Artifact filters')
	const primary = element(
		'div',
		undefined,
		`${styles.filters} ${styles.primaryFilters}`
	)
	const secondary = element('div', undefined, styles.filters)
	const fields = new Map<string, HTMLInputElement | HTMLSelectElement>()
	for (const key of ['q', 'path', ...FACET_KEYS]) {
		const label = element('label', labelOf(key), styles.field)
		const input = createField(key, facets[key] ?? [])
		input.id = `filter-${key}`
		input.name = key
		label.htmlFor = input.id
		label.append(input)
		fields.set(key, input)
		if (['q', 'path'].includes(key)) {
			primary.append(label)
		} else {
			secondary.append(label)
		}
		let timer: ReturnType<typeof setTimeout>
		input.addEventListener(
			key === 'q' || key === 'path' ? 'input' : 'change',
			() => {
				clearTimeout(timer)
				if (key === 'q' || key === 'path') {
					timer = setTimeout(
						() => change({ [key]: input.value || null, offset: null }),
						150
					)
				} else {
					change({ [key]: input.value || null, offset: null })
				}
			}
		)
	}
	const disclosure = element('details')
	disclosure.append(element('summary', 'Filters'), secondary)
	const bar = element('div', undefined, styles.filterBar)
	bar.append(
		primary,
		button('Reset filters', () =>
			change(
				Object.fromEntries(
					['q', 'path', ...FACET_KEYS, 'focus', 'cause', 'offset'].map(
						(key) => [key, null]
					)
				)
			)
		)
	)
	container.append(bar, disclosure)
	return {
		container,
		sync: (state) => {
			for (const [key, field] of fields) {
				field.value = state.get(key) ?? ''
			}
		},
	}
}
const labelOf = (key: string): string =>
	({
		q: 'Search every record',
		path: 'Path contains',
		workspace: 'Path group / workspace',
		kind: 'Node kind',
		relation: 'Relationship',
		category: 'Test category',
		evidence: 'Evidence class',
		changed: 'Changed file',
		uncertainty: 'Uncertainty',
	})[key] ?? key[0].toUpperCase() + key.slice(1)
const createField = (
	key: string,
	values: string[]
): HTMLInputElement | HTMLSelectElement => {
	if (key === 'q' || key === 'path') {
		const input = element('input')
		input.type = 'search'
		input.autocomplete = 'off'
		input.spellcheck = false
		return input
	}
	const input = element('select')
	input.append(element('option', 'All'))
	input.options[0].value = ''
	for (const value of values) {
		const option = element('option', value)
		option.value = value
		input.append(option)
	}
	return input
}
