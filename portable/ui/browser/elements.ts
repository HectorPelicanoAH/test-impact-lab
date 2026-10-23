import styles from './styles.module.css'

export const element = <T extends keyof HTMLElementTagNameMap>(
	tag: T,
	text?: string | number,
	className?: string
): HTMLElementTagNameMap[T] => {
	const node = document.createElement(tag)
	if (text !== undefined) {
		node.textContent = String(text)
	}
	if (className) {
		node.className = className
	}
	return node
}
export const button = (
	text: string,
	action: () => void | Promise<void>,
	className?: string
): HTMLButtonElement => {
	const node = element('button', text, className)
	node.type = 'button'
	node.addEventListener('click', () => {
		Promise.resolve().then(action).catch(showError)
	})
	return node
}
export const showError = (error: unknown): void => {
	if (error instanceof DOMException && error.name === 'AbortError') {
		return
	}
	const target = document.getElementById('status')
	if (target) {
		target.textContent =
			error instanceof Error ? error.message : 'Could not read this artifact.'
		target.classList.add(styles.error)
		target.setAttribute('role', 'alert')
	}
}
export const code = (value: unknown): HTMLPreElement => {
	const node = element(
		'pre',
		typeof value === 'string' ? value : JSON.stringify(value, null, 2),
		styles.code
	)
	node.tabIndex = 0
	node.setAttribute('aria-label', 'Record content')
	return node
}
export const number = (value: number): string =>
	new Intl.NumberFormat().format(value)
