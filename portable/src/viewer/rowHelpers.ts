import type { ViewRow } from './types.ts'

interface PackageNode {
	readonly kind: string
	readonly path?: string
}

const EXTENSION = /\.([^./]+)$/
export const languageOf = (path: string): string => {
	const extension = EXTENSION.exec(path)?.[1] ?? ''
	const languages: Record<string, string> = {
		ts: 'TypeScript',
		tsx: 'TypeScript',
		js: 'JavaScript',
		jsx: 'JavaScript',
		mjs: 'JavaScript',
		py: 'Python',
		cs: 'C#',
		java: 'Java',
		go: 'Go',
		rs: 'Rust',
		graphql: 'GraphQL',
		json: 'JSON',
		css: 'CSS',
	}
	return languages[extension] ?? (extension || 'unknown')
}
export const workspaceOf = (
	path: string,
	nodes: readonly PackageNode[] = []
): string => {
	const packages = nodes
		.filter(
			(node) =>
				node.kind === 'package' &&
				node.path &&
				(path === node.path || path.startsWith(`${node.path}/`))
		)
		.sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))
	if (packages[0]?.path) {
		return packages[0].path
	}
	const parts = path.split('/')
	if (
		['packages', 'apps', 'services', 'modules'].includes(parts[0]) &&
		parts.length > 1
	) {
		return parts.slice(0, 2).join('/')
	}
	return parts.length > 1 ? parts[0] : '(root)'
}
export const rowKey = (row: Pick<ViewRow, 'type' | 'id'>): string =>
	`${row.type}:${row.id}`
export const facet = (row: ViewRow, name: string, value: string): void => {
	const values = row.facets[name] ?? []
	if (value && !values.includes(value)) {
		row.facets[name] = [...values, value].sort()
	}
}
export const unique = (values: string[]): string[] =>
	[...new Set(values)].sort()
