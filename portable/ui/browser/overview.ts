import type { createDataSource } from './dataSource.ts'
import { button, element, number } from './elements.ts'
import type { createInspector } from './inspector.ts'
import styles from './styles.module.css'

export const renderOverview = (
	container: HTMLElement,
	summary: Awaited<
		ReturnType<Awaited<ReturnType<typeof createDataSource>>['summary']>
	>,
	inspect: ReturnType<typeof createInspector>
): void => {
	container.replaceChildren(element('h3', 'Evidence, with its limits visible'))
	const metrics = element('section', undefined, styles.metrics)
	metrics.setAttribute('aria-label', 'Artifact summary')
	for (const [label, value] of Object.entries(summary.metrics)) {
		const item = element('div', undefined, styles.metric)
		item.append(
			element('strong', typeof value === 'number' ? number(value) : value),
			element('span', label, styles.muted)
		)
		metrics.append(item)
	}
	container.append(metrics)
	for (const notice of summary.notices.slice(0, 3)) {
		container.append(element('p', notice, styles.notice))
	}
	const details = element('details')
	details.append(
		element('summary', 'Verification, fallback reasons and artifact identities')
	)
	for (const line of [...summary.verification, ...summary.notices.slice(3)]) {
		details.append(element('p', line, styles.muted))
	}
	for (const [key, value] of Object.entries(summary.identities)) {
		details.append(element('p', `${key}: ${value}`, styles.muted))
	}
	container.append(
		details,
		button(
			'Inspect scope and proposed / actual runner plans',
			async () => await inspect('context', 'context')
		)
	)
}
