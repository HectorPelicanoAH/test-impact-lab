import { expect, test } from 'vitest';
import { filesUnder, moduleReferences, resolveModule, sourceFile } from '../../scripts/source-analysis';

function violations(path: string, text?: string): string[] {
  const layer = path.includes('/domain/') ? 'domain' : 'application';
  const allowed = layer === 'domain'
    ? ['apps/backend/src/auth/domain/']
    : ['apps/backend/src/auth/domain/', 'apps/backend/src/auth/application/'];
  return moduleReferences(sourceFile(path, text)).flatMap(specifier => {
    if (specifier === 'node:crypto' && layer === 'domain') return [];
    const target = resolveModule(specifier, path);
    return target && allowed.some(prefix => target.startsWith(prefix)) ? [] : [`${path} imports forbidden ${specifier}`];
  });
}

test('Domain and application depend only inward, including type imports and re-exports', () => {
  const paths = ['apps/backend/src/auth/domain', 'apps/backend/src/auth/application'].flatMap(filesUnder).filter(path => path.endsWith('.ts') && !path.endsWith('.test.ts'));
  expect(paths.flatMap(path => violations(path))).toEqual([]);
});

test('Architecture guard detects transport, type-only, dynamic and unresolved alias escapes', () => {
  const path = 'apps/backend/src/auth/domain/Probe.ts';
  for (const text of [
    "import type { AuthenticateUser } from '../application/AuthenticateUser';",
    "export { LoginController } from '../infrastructure/inbound/http/LoginController';",
    "const load = () => import('../application/AuthenticateUser');",
    "type Adapter = import('../infrastructure/inbound/http/LoginController').LoginController;",
    "import { x } from '@backend/infrastructure/escape';",
  ]) expect(violations(path, text)).toHaveLength(1);
  expect(() => violations(path, 'const path = process.env.ADAPTER; import(path);')).toThrow('Non-literal');
  expect(violations(path, "import { x } from '../../../../frontend/src/auth/domain/escape';")).toHaveLength(1);
  expect(violations('apps/backend/src/auth/application/Probe.ts', "import { LoginController } from '../infrastructure/inbound/http/LoginController';")).toHaveLength(1);
});
