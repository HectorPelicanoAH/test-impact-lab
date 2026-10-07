import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DiscoveryArchive } from '../../packages/impact-engine/src/schema-v2';
import { canonical, fileHashes, hash } from './core';
import { buildArchive, loadWorkspace, validateArchive, type WorkspaceInput } from './snapshot';
import { progressStep, type ProgressEvent, type ProgressObserver } from './progress';

export class SnapshotStore {
  constructor(readonly directory: string) {}
  private atomic(path: string, text: string) {
    mkdirSync(this.directory, { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, text, { flag: 'wx' }); renameSync(temporary, path); }
    finally { rmSync(temporary, { force: true }); }
  }
  publish(archive: DiscoveryArchive, current = true) {
    validateArchive(archive);
    const path = resolve(this.directory, `${archive.graph.id}.json`);
    if (!existsSync(path)) this.atomic(path, canonical(archive));
    else this.read(archive.graph.id); // Never point current at a corrupted existing archive.
    if (current) this.atomic(resolve(this.directory, 'current.json'), canonical({ id: archive.graph.id }));
  }
  read(id?: string): DiscoveryArchive {
    const selected = id ?? (JSON.parse(readFileSync(resolve(this.directory, 'current.json'), 'utf8')) as { id: string }).id;
    if (!/^[a-f0-9]{64}$/.test(selected)) throw new Error('Invalid snapshot identity.');
    const archive = JSON.parse(readFileSync(resolve(this.directory, `${selected}.json`), 'utf8')) as DiscoveryArchive;
    if (archive.graph.id !== selected) throw new Error('Snapshot archive identity mismatch.');
    validateArchive(archive);
    return archive;
  }
}

export class WorkspaceSnapshots {
  current: DiscoveryArchive;
  lastError?: string;
  progress: ProgressEvent[] = [];
  private fingerprint: string;
  constructor(readonly root: string, readonly store = new SnapshotStore(resolve(root, '.impact-snapshots')), private readonly loader: () => WorkspaceInput = () => loadWorkspace(root)) {
    const input = loader();
    this.fingerprint = this.key(input);
    this.current = buildArchive(input, event => { if (event.status !== 'running') this.progress.push(event); });
    store.publish(this.current);
  }
  private key(input: WorkspaceInput) { return hash({ sources: fileHashes(input.sources), config: fileHashes(input.configuration), execution: fileHashes(input.executionFiles),
    inventoryRevision: input.inventoryRevision ?? null, observations: input.observationDataset ?? null, mesh: input.meshDataset ?? null }); }
  /** Explicit rebuilding bypasses the unchanged-input shortcut, with atomic publication. */
  rebuild(observe?: ProgressObserver): DiscoveryArchive {
    const events: ProgressEvent[] = [];
    try {
      const input = progressStep(observe, { phase: 'capture', title: 'Capturar las fuentes', message: 'Leo las fuentes y la configuración para una construcción completa.', technique: 'Lectura del workspace y fijación de la revisión Git externa.' }, () => this.loader());
      const next = buildArchive(input, event => { if (event.status !== 'running') events.push(event); observe?.(event); });
      this.store.publish(next);
      this.current = next; this.fingerprint = this.key(input); this.progress = events; this.lastError = undefined;
      return next;
    } catch (error) { this.lastError = error instanceof Error ? error.message : 'Rebuild failed.'; throw error; }
  }
  refresh(): DiscoveryArchive {
    try {
      const input = this.loader(), fingerprint = this.key(input);
      if (fingerprint !== this.fingerprint) {
        const events: ProgressEvent[] = [];
        const next = buildArchive(input, event => { if (event.status !== 'running') events.push(event); }); // all-or-nothing
        this.store.publish(next);
        this.current = next;
        this.fingerprint = fingerprint;
        this.progress = events;
      }
      this.lastError = undefined;
      return this.current;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Rebuild failed.';
      throw error;
    }
  }
  watch(onChange: (archive: DiscoveryArchive) => void, onError: (error: Error) => void): () => void {
    let timer: NodeJS.Timeout | undefined;
    // Filesystem events can be dropped under resource pressure; periodic refresh is a safety net.
    const polling = setInterval(() => rebuild(), 2_000);
    let watcher: FSWatcher | undefined;
    const rebuild = () => {
      try { const before = this.current.graph.id; const after = this.refresh(); if (after.graph.id !== before) onChange(after); }
      catch (error) { onError(error instanceof Error ? error : new Error(String(error))); }
    };
    const fallBackOnFileLimit = (error: Error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EMFILE') { onError(error); return; }
      watcher?.close(); watcher = undefined;
    };
    try { watcher = watch(this.root, { recursive: true }, (_event, filename) => {
      const path = filename?.toString().replaceAll('\\', '/') ?? '';
      if (path.split('/').some(part => part.startsWith('.') || ['node_modules', 'dist', 'dist-server', 'test-results'].includes(part))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(rebuild, 100);
    }); }
    catch (error) { fallBackOnFileLimit(error instanceof Error ? error : new Error(String(error))); }
    watcher?.on('error', fallBackOnFileLimit);
    return () => { if (timer) clearTimeout(timer); clearInterval(polling); watcher?.close(); };
  }
}
