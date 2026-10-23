import type { ViewRow, Workspace } from './types.ts';
export declare const sourceRows: (model: Workspace) => ViewRow[];
export declare const caseRows: (model: Workspace) => ViewRow[];
export declare const unitRows: (model: Workspace, cases: ViewRow[]) => ViewRow[];
