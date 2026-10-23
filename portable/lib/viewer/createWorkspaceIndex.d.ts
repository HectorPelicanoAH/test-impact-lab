import type { Workspace, WorkspaceIndex } from './types.ts';
export declare const createWorkspaceIndex: (model: Workspace) => WorkspaceIndex;
export declare const workspaceSummary: (index: WorkspaceIndex) => {
    format: "test-impact-workspace/1";
    title: string;
    identities: Record<string, string>;
    verification: string[];
    notices: string[];
    metrics: Record<string, string | number>;
    facets: {
        [k: string]: string[];
    };
    sections: {
        [k: string]: number;
    };
    contextCount: number;
};
