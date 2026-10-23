import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { bytesHash, relativePath } from "./sourceIntegrity.js";
const EXCLUDED_SOURCE = /(?:^|\/)(?:\.git|node_modules|\.env[^/]*)(?:\/|$)|\.pem$/;
export const readSourceRecord = (source, root) => {
    if (!root || !source.hash) {
        return source;
    }
    try {
        relativePath(source.path);
        if (EXCLUDED_SOURCE.test(source.path)) {
            return { ...source, status: 'excluded' };
        }
        const path = resolve(realpathSync(root), source.path);
        if (!lstatSync(path).isFile() || realpathSync(path) !== path) {
            return { ...source, status: 'not-an-ordinary-file' };
        }
        if (lstatSync(path).size > 1048576) {
            return { ...source, status: 'exceeds-1-MiB-source-limit' };
        }
        const bytes = readFileSync(path);
        if (bytesHash(bytes) !== source.hash) {
            return {
                ...source,
                status: 'hash-mismatch; historical-or-changed-source',
            };
        }
        return {
            ...source,
            status: 'verified-exact-bytes',
            content: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        };
    }
    catch {
        return { ...source, status: 'source-unavailable' };
    }
};
