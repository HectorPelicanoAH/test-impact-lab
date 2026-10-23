import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type * as Vite from 'vite'

const packageRoot = resolve(process.argv[2] ?? 'node_modules/vite')
const metadata: { version: string } = JSON.parse(
	readFileSync(resolve(packageRoot, 'package.json'), 'utf8')
)
if (metadata.version !== '8.2.2') {
	throw new Error('Viewer build requires Vite 8.2.2')
}
const native: typeof Vite = await import(
	pathToFileURL(resolve(packageRoot, 'dist/node/index.js')).href
)
await native.build({
	configFile: false,
	root: fileURLToPath(new URL('../ui/', import.meta.url)),
	publicDir: false,
	css: {
		postcss: { plugins: [] },
		transformer: 'lightningcss',
		lightningcss: {
			drafts: { customMedia: true },
			cssModules: { pattern: 'impact_[local]_[hash]' },
		},
	},
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		target: 'es2022',
		cssCodeSplit: false,
		lib: {
			entry: fileURLToPath(new URL('../ui/browser/main.ts', import.meta.url)),
			name: 'TestImpactExplorer',
			formats: ['iife'],
			fileName: () => 'explorer.js',
			cssFileName: 'explorer',
		},
	},
})
