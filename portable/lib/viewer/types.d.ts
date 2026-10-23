export interface SourceRange {
    readonly columnBase: 0;
    readonly columnUnit: 'utf16';
    readonly end: {
        readonly line: number;
        readonly column: number;
    };
    readonly endExclusive: true;
    readonly lineBase: 1;
    readonly start: {
        readonly line: number;
        readonly column: number;
    };
}
export type RowType = 'node' | 'case' | 'source' | 'edge' | 'unit' | 'impact' | 'run' | 'evidence' | 'diagnostic';
export interface Reference {
    readonly id: string;
    readonly label: string;
    readonly type: RowType | 'source' | 'cause';
}
export interface DetailEntry {
    readonly data?: unknown;
    readonly description: string;
    readonly label: string;
    readonly references: Reference[];
}
export interface ViewRow {
    readonly columns: Record<string, string>;
    readonly entries: DetailEntry[];
    readonly facets: Record<string, string[]>;
    readonly id: string;
    readonly label: string;
    readonly path: string;
    readonly type: RowType;
}
export interface ViewEdge {
    readonly evidenceIds: string[];
    readonly from: string;
    readonly id: string;
    readonly relationship: string;
    readonly snapshots: string[];
    readonly to: string;
}
export interface SourceRecord {
    readonly content?: string;
    readonly hash: string | null;
    readonly id: string;
    readonly path: string;
    readonly revision: string | null;
    readonly snapshot: string;
    readonly status: string;
}
export interface CauseScope {
    readonly edgeIds: string[];
    readonly label: string;
    readonly nodeIds: string[];
}
export interface Workspace {
    readonly causes: Record<string, CauseScope>;
    readonly context: DetailEntry[];
    readonly diagnostics: ViewRow[];
    readonly edges: ViewEdge[];
    readonly evidence: ViewRow[];
    readonly format: 'test-impact-workspace/1';
    readonly identities: Record<string, string>;
    readonly impact: ViewRow[];
    readonly metrics: Record<string, string | number>;
    readonly nodes: ViewRow[];
    readonly notices: string[];
    readonly runs: ViewRow[];
    readonly sources: SourceRecord[];
    readonly title: string;
    readonly units: ViewRow[];
    readonly verification: string[];
}
export interface Page {
    readonly edges: ViewEdge[];
    readonly groupCount: number;
    readonly groups?: {
        readonly id: string;
        readonly nodes: number;
        readonly edges: number;
    }[];
    readonly hidden: number;
    readonly items: ViewRow[];
    readonly limit: number;
    readonly matched: number;
    readonly neighborhoodLimited: boolean;
    readonly offset: number;
    readonly total: number;
    readonly totalPageEdges: number;
}
export interface Detail {
    readonly columns: Record<string, string>;
    readonly entries: DetailEntry[];
    readonly id: string;
    readonly offset: number;
    readonly source?: SourceRecord;
    readonly sourcePreviews?: SourcePreview[];
    readonly title: string;
    readonly total: number;
}
export interface SourcePreview {
    readonly evidenceId?: string;
    readonly label: string;
    readonly range?: SourceRange;
    readonly sourceId: string;
}
export interface WorkspaceIndex {
    readonly evidence: Map<string, ViewRow>;
    readonly facets: Map<string, Map<string, Set<string>>>;
    readonly model: Workspace;
    readonly neighbors: Map<string, ViewEdge[]>;
    readonly rows: Map<string, ViewRow>;
    readonly search: Map<string, string>;
    readonly sections: Record<string, ViewRow[]>;
    readonly sources: Map<string, SourceRecord>;
}
