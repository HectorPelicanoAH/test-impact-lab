import { type IncomingMessage, type ServerResponse } from 'node:http';
import { type LegacySnapshot } from '../core.mjs';
import type { Workspace } from './types.ts';
interface ExplorerOptions {
    readonly legacy?: LegacySnapshot;
    readonly sourceRoot?: string;
}
export declare const createExplorer: (model: Workspace, options?: ExplorerOptions) => import("http").Server<typeof IncomingMessage, typeof ServerResponse>;
export declare const listenExplorer: (model: Workspace, port?: number, options?: ExplorerOptions) => Promise<import("http").Server<typeof IncomingMessage, typeof ServerResponse>>;
export declare const explorerFromLegacy: (snapshot: LegacySnapshot) => import("http").Server<typeof IncomingMessage, typeof ServerResponse>;
export {};
