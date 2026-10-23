import type { ViewRow } from './types.ts';
interface PackageNode {
    readonly kind: string;
    readonly path?: string;
}
export declare const languageOf: (path: string) => string;
export declare const workspaceOf: (path: string, nodes?: readonly PackageNode[]) => string;
export declare const rowKey: (row: Pick<ViewRow, "type" | "id">) => string;
export declare const facet: (row: ViewRow, name: string, value: string) => void;
export declare const unique: (values: string[]) => string[];
export {};
