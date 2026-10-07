import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, relative, sep, extname, matchesGlob } from 'node:path';
import type { DiscoveryConfig, OverlayEdit, SourceFiles } from '../../packages/impact-engine/src/schema-v2';

export function safePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !/[:%\x00-\x1f\x7f]/.test(path)
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !part.startsWith('.'));
}
export function authorizedPath(path: string, config: DiscoveryConfig): boolean {
  return safePath(path) && config.roots.some(root => path.startsWith(`${root}/`))
    && config.extensions.includes(extname(path)) && !config.exclusions.some(pattern => matchesGlob(path, pattern));
}
export function assertNoCollisions(paths: string[]) {
  const seen = new Set<string>();
  for (const path of paths.sort()) {
    if (!safePath(path)) throw new Error(`Unsafe source path: ${path}`);
    const key = path.normalize('NFC').toLowerCase();
    if (seen.has(key) || [...seen].some(other => key.startsWith(`${other}/`) || other.startsWith(`${key}/`))) throw new Error(`Path collision: ${path}`);
    seen.add(key);
  }
}
export function readTree(root: string, entries: string[], exclude: (path: string) => boolean = () => false): SourceFiles {
  const canonicalRoot = realpathSync(root);
  const files: SourceFiles = {};
  function visit(path: string) {
    if (exclude(path)) return;
    if (!safePath(path)) throw new Error(`Unsafe source path: ${path}`);
    const absolute = resolve(canonicalRoot, path);
    if (!absolute.startsWith(`${canonicalRoot}${sep}`)) throw new Error(`Path escapes root: ${path}`);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not an allowed input: ${path}`);
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) visit(`${path}/${name}`);
    } else if (stat.isFile()) {
      const bytes = readFileSync(absolute), text = bytes.toString('utf8');
      if (!Buffer.from(text, 'utf8').equals(bytes) || text.includes('\0')) throw new Error(`Only UTF-8 text inputs are supported: ${path}`);
      files[relative(canonicalRoot, absolute).replaceAll('\\', '/')] = text;
    }
    else throw new Error(`Unsupported filesystem input: ${path}`);
  }
  for (const entry of entries) {
    if (!safePath(entry)) throw new Error(`Unsafe source path: ${entry}`);
    const parts = entry.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      if (lstatSync(resolve(canonicalRoot, ...parts.slice(0, depth))).isSymbolicLink()) throw new Error(`Symlink is not an allowed input: ${entry}`);
    }
    visit(entry);
  }
  assertNoCollisions(Object.keys(files));
  return files;
}
export function inventory(root: string, config: DiscoveryConfig): SourceFiles {
  const files = readTree(root, config.roots, path => config.exclusions.some(pattern => matchesGlob(path, pattern)));
  if (Object.keys(files).length > config.maxFiles) throw new Error('Product inventory file limit exceeded.');
  for (const [path, content] of Object.entries(files)) {
    if (Buffer.byteLength(content) > config.maxFileBytes) throw new Error(`Source exceeds size limit: ${path}`);
  }
  return files; // Unsupported extensions are inventoried and diagnosed, not silently dropped.
}
export function applyEdits(original: SourceFiles, edits: OverlayEdit[], config: DiscoveryConfig): SourceFiles {
  if (!Array.isArray(edits) || edits.length > config.maxFiles) throw new Error('Invalid edit list.');
  const result = { ...original };
  const seen = new Set<string>();
  for (const edit of edits) {
    if (!edit || typeof edit.path !== 'string' || !authorizedPath(edit.path, config) || seen.has(edit.path)) throw new Error('An edit is not allowed.');
    seen.add(edit.path);
    const operation = edit.operation ?? 'modify';
    const keys = Object.keys(edit).sort().join(',');
    if (operation === 'delete') {
      if (keys !== 'operation,path' || original[edit.path] === undefined) throw new Error('Cannot delete an unknown source.');
      delete result[edit.path];
    } else {
      if (!['add', 'modify'].includes(operation) || !['content,path', 'content,operation,path'].includes(keys)
        || !('content' in edit) || typeof edit.content !== 'string' || Buffer.byteLength(edit.content) > config.maxFileBytes) throw new Error('Invalid source replacement.');
      if (operation === 'add' ? original[edit.path] !== undefined : original[edit.path] === undefined) throw new Error('Edit operation does not match baseline.');
      result[edit.path] = edit.content;
    }
  }
  if (Object.keys(result).length > config.maxFiles) throw new Error('Product inventory file limit exceeded.');
  assertNoCollisions(Object.keys(result));
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}