export interface MeshState { id: string; directory: string; cluster: string; kubeconfig: string; inventoryRoot: string; inventoryRevision: string; revision: string; appImage: string; inventoryImage: string; phase: string; versions: Record<string, string>; server?: string }
export function readState(id: string): MeshState;
export function assertOwned(state: MeshState): Promise<string>;
export function kubectl(state: MeshState, args: string[], timeout?: number): Promise<string>;
export function up(revision: string): Promise<MeshState>;
export function down(state: MeshState): Promise<void>;
export function forward(state: MeshState, service: string, namespace: string, remotePort: number): Promise<{ origin: string; close(): Promise<void> }>;
