import type { CauseScope, WorkspaceIndex } from './types.ts';
export interface SceneNode {
    readonly changed: boolean;
    readonly id: string;
    readonly kind: string;
    readonly label: string;
    readonly language: string;
    readonly path: string;
    readonly role: string;
    readonly snapshots: string[];
    readonly workspace: string;
}
export interface SceneEdge {
    readonly from: string;
    readonly id: string;
    readonly relationship: string;
    readonly snapshots: string[];
    readonly to: string;
}
export interface GraphScene {
    readonly causes: Record<string, CauseScope>;
    readonly edges: SceneEdge[];
    readonly nodes: SceneNode[];
    readonly preferredWorkspace: string | null;
}
export declare const graphScene: (index: WorkspaceIndex) => GraphScene;
