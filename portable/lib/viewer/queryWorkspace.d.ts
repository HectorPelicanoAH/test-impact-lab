import type { Page, WorkspaceIndex } from './types.ts';
export declare const FACET_KEYS: string[];
export declare const pageBounds: (options: Record<string, string>) => {
    offset: number;
    limit: number;
};
export declare const queryWorkspace: (index: WorkspaceIndex, section: string, options?: Record<string, string>) => Page;
