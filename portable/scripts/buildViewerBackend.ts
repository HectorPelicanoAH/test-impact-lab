import { spawnSync } from 'node:child_process'
import { cp, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const compilerRoot = resolve(process.argv[2] ?? '')
const requireCompiler = createRequire(resolve(compilerRoot, 'package.json'))
if (requireCompiler('./package.json').version !== '5.9.3') {
	throw new Error('Viewer backend build requires TypeScript 5.9.3')
}
const source = fileURLToPath(new URL('../src/', import.meta.url))
const destination = fileURLToPath(new URL('../lib/', import.meta.url))
const files = (await readdir(resolve(source, 'viewer')))
	.filter((name) => name.endsWith('.ts'))
	.map((name) => resolve(source, 'viewer', name))
const result = spawnSync(
	process.execPath,
	[
		resolve(compilerRoot, 'bin/tsc'),
		'--strict',
		'--skipLibCheck',
		'--target',
		'es2023',
		'--lib',
		'es2024',
		'--module',
		'nodenext',
		'--declaration',
		'--rewriteRelativeImportExtensions',
		'--noEmitOnError',
		'--types',
		'node',
		'--baseUrl',
		resolve(compilerRoot, '..'),
		'--typeRoots',
		resolve(compilerRoot, '../@types'),
		'--rootDir',
		source,
		'--outDir',
		destination,
		...files,
	],
	{ encoding: 'utf8' }
)
if (result.error || result.status !== 0) {
	throw new Error(
		`Viewer backend compilation failed: ${result.stdout}${result.stderr}`,
		{
			cause: result.error,
		}
	)
}
await mkdir(destination, { recursive: true })
await Promise.all(
	['core.mjs', 'core.d.mts'].map((name) =>
		cp(resolve(source, name), resolve(destination, name))
	)
)
process.stdout.write('Compiled the read-only viewer backend and declarations\n')
