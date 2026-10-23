export interface LegacyNode {
	readonly id: string
	readonly label: string
	readonly kind: string
	readonly group?: string
	readonly repositoryId?: string
	readonly locations?: { path: string; sourceHash?: string }[]
}
export interface LegacySnapshot {
	readonly format: 'test-impact-view/1'
	readonly id: string
	readonly metadata: { title: string; sample?: boolean; note?: string }
	readonly nodes: LegacyNode[]
	readonly edges: { id: string; from: string; to: string; type: string; evidenceIds: string[] }[]
	readonly evidence: { id: string; kind: string; locator?: { path: string; sourceHash?: string } }[]
	readonly diagnostics: { id: string; code?: string; message?: string }[]
	readonly sources: Record<string, string>
}
export function normalizeSnapshot(value: unknown): LegacySnapshot
export function createIndex(value: unknown): { snapshot: LegacySnapshot; nodes: Map<string, LegacyNode>; evidence: Map<string, LegacySnapshot['evidence'][number]>; incoming: Map<string, LegacySnapshot['edges']>; outgoing: Map<string, LegacySnapshot['edges']> }
export function queryGraph(index: ReturnType<typeof createIndex>, options?: Record<string, unknown>): unknown
export function summary(index: ReturnType<typeof createIndex>): unknown
export function hash(value: unknown): string
