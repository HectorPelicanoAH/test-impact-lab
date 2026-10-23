import type { WorkspaceIndex } from './types.ts';
export declare const neighborhood: (index: WorkspaceIndex, options: Record<string, string>) => {
    ids: Set<string> | null;
    limited: boolean;
};
