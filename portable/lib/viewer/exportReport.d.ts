import type { Workspace } from './types.ts';
export declare const exportReport: (model: Workspace, out: string, options?: {
    sourceRoot?: string;
    includeSources?: boolean;
}) => {
    bytes: number;
    decodedBytes: number;
};
