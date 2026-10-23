import { FACET_KEYS } from '../../src/viewer/queryWorkspace.ts'

export type Navigate = (values: Record<string, string | null>) => void

export const SECTIONS: Record<string, string> = {
	code: 'Code',
	graph: 'Graph',
	groups: 'Dependency scopes',
	cases: 'Test catalogue',
	units: 'File captures',
	runs: 'Recorded results',
	impact: 'Impact decisions',
	summary: 'Overview',
	evidence: 'Evidence',
	diagnostics: 'Diagnostics',
}
export const sectionFamily = (section: string): string => {
	if (['cases', 'units', 'runs'].includes(section)) {
		return 'tests'
	}
	if (section === 'code') {
		return 'code'
	}
	return 'graph'
}
export const changeSection = (navigate: Navigate, section: string): void =>
	navigate(viewState(section))

export const viewState = (
	section: string,
	values: Record<string, string | null> = {}
): Record<string, string | null> => ({
	...Object.fromEntries(FACET_KEYS.map((key) => [key, null])),
	section,
	offset: null,
	q: null,
	nodeQuery: null,
	frame: null,
	path: null,
	kind: null,
	focus: null,
	cause: null,
	category: null,
	evidence: null,
	validity: null,
	status: null,
	uncertainty: null,
	relation: null,
	panX: null,
	panY: null,
	zoom: null,
	table: null,
	tableQuery: null,
	...values,
})
