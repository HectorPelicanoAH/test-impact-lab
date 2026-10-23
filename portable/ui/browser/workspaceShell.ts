import { button, element } from './elements.ts'
import {
	changeSection,
	type Navigate,
	SECTIONS,
	sectionFamily,
} from './navigation.ts'
import styles from './styles.module.css'
import tokens from './tokens.module.css'

export const createWorkspaceShell = (navigate: Navigate) => {
	document.body.className = `${styles.document} ${tokens.theme}`
	const shell = element('div', undefined, styles.shell)
	const skip = element('a', 'Skip to workspace', styles.skip)
	skip.href = '#results-heading'
	skip.addEventListener('click', (event) => {
		event.preventDefault()
		document.getElementById('results-heading')?.focus()
	})
	const header = element('header', undefined, styles.header)
	const brand = element('div', undefined, styles.brand)
	const title = element('h1', 'Portable explorer')
	const identity = element('div')
	identity.append(element('span', 'TEST IMPACT', styles.eyebrow), title)
	brand.append(element('span', 'TI', styles.logo), identity)
	const navigation = element('nav', undefined, styles.navigation)
	navigation.setAttribute('aria-label', 'Main workspace')
	for (const [key, label, target] of [
		['code', '01 / Code', 'code'],
		['graph', '02 / Graph', 'graph'],
		['tests', '03 / Tests', 'cases'],
	]) {
		const item = button(
			label,
			() => changeSection(navigate, target),
			styles.navButton
		)
		item.dataset.family = key
		navigation.append(item)
	}
	header.append(
		brand,
		navigation,
		element('span', 'ARTIFACT WORKSPACE', styles.badge)
	)
	const ribbon = element('nav', undefined, styles.workflow)
	ribbon.setAttribute('aria-label', 'Explore the evidence')
	for (const [index, [section, label, description]] of [
		['code', 'Read the source', 'Files and declarations'],
		['graph', 'Follow dependencies', 'Relationships and evidence'],
		['impact', 'Understand impact', 'Recorded engine decisions'],
		['runs', 'Review execution', 'Native runner results'],
	].entries()) {
		const step = button(
			'',
			() => changeSection(navigate, section),
			styles.workflowStep
		)
		step.dataset.section = section
		const text = element('span')
		text.append(element('strong', label), element('small', description))
		step.append(element('span', `0${index + 1}`, styles.stepNumber), text)
		ribbon.append(step)
	}
	const main = element('main', undefined, styles.content)
	const headingBar = element('div', undefined, styles.heading)
	const heading = element('h2', 'Code')
	heading.id = 'results-heading'
	heading.tabIndex = -1
	const subnavigation = element('nav', undefined, styles.subnavigation)
	subnavigation.setAttribute('aria-label', 'Workspace views')
	headingBar.append(heading, subnavigation)
	const explorer = element('div', undefined, styles.explorer)
	const results = element('section', undefined, styles.panel)
	results.setAttribute('aria-label', 'Results')
	const inspector = element(
		'aside',
		undefined,
		`${styles.panel} ${styles.inspector}`
	)
	inspector.setAttribute('aria-label', 'Record inspector')
	inspector.append(
		element('span', 'INSPECTOR', styles.eyebrow),
		element('h2', 'Follow the evidence'),
		element(
			'p',
			'Select a file, graph node or test. Its source, relationships and recorded evidence appear here.',
			styles.muted
		)
	)
	explorer.append(results, inspector)
	const status = element('p', 'Reading artifact…', styles.status)
	status.id = 'status'
	status.setAttribute('role', 'status')
	const footer = element('footer', undefined, styles.footer)
	footer.append(
		status,
		button('Artifact details', () => changeSection(navigate, 'summary'))
	)
	main.append(headingBar)
	shell.append(skip, header, ribbon, main, footer)
	document.getElementById('app')?.replaceChildren(shell)
	return {
		main,
		heading,
		navigation,
		ribbon,
		subnavigation,
		title,
		results,
		inspector,
		explorer,
		status,
	}
}

export const syncWorkspaceNavigation = (
	shell: ReturnType<typeof createWorkspaceShell>,
	section: string,
	navigate: Navigate,
	counts: Record<string, number>
): void => {
	const family = sectionFamily(section)
	shell.heading.textContent = SECTIONS[section] ?? 'Unknown view'
	syncCurrent(shell.navigation, family, 'family', 'page')
	syncCurrent(shell.ribbon, section, 'section', 'step')
	shell.subnavigation.replaceChildren()
	const sections =
		family === 'tests'
			? ['cases', 'units', 'runs']
			: family === 'code'
				? ['code']
				: ['graph', 'groups', 'impact', 'evidence', 'diagnostics']
	for (const key of sections) {
		const item = button(
			SECTIONS[key],
			() => changeSection(navigate, key),
			styles.subnavButton
		)
		if (key === section) {
			item.setAttribute('aria-current', 'page')
		}
		shell.subnavigation.append(item)
		if (counts[key] !== undefined) {
			item.append(element('span', ` ${counts[key]}`, styles.muted))
		}
	}
}

export const graphTools = (navigate: Navigate): HTMLElement => {
	const toolbar = element('div', undefined, styles.toolbar)
	for (const [key, label, values] of [
		['groupBy', 'Group by', ['workspace', 'kind', 'language']],
		['direction', 'Follow', ['both', 'dependencies', 'consumers']],
		['depth', 'Hops', ['1', '2']],
		['layout', 'Layout', ['grid', 'rows']],
	] as const) {
		const field = element('label', label, styles.field)
		const select = element('select')
		select.name = key
		for (const value of values) {
			const option = element('option', value)
			option.value = value
			select.append(option)
		}
		select.addEventListener('change', () =>
			navigate({ [key]: select.value, offset: null })
		)
		field.append(select)
		toolbar.append(field)
	}
	return toolbar
}

const syncCurrent = (
	container: HTMLElement,
	value: string,
	key: string,
	current: string
): void => {
	for (const item of container.querySelectorAll('button')) {
		if (item.dataset[key] === value) {
			item.setAttribute('aria-current', current)
		} else {
			item.removeAttribute('aria-current')
		}
	}
}
