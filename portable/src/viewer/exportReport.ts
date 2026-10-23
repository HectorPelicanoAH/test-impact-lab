import { createHash, randomUUID } from 'node:crypto'
import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { bytesHash, requireCondition } from './sourceIntegrity.ts'
import { readSourceRecord } from './sourceRecord.ts'
import type { Workspace } from './types.ts'

const sha256 = (text: string): string =>
	createHash('sha256').update(text).digest('base64')
export const exportReport = (
	model: Workspace,
	out: string,
	options: { sourceRoot?: string; includeSources?: boolean } = {}
): { bytes: number; decodedBytes: number } => {
	requireCondition(
		!options.includeSources || options.sourceRoot,
		'--include-sources requires --source-root'
	)
	let sourceBytes = 0
	const sources = !options.includeSources
		? model.sources.map(({ content: _content, ...source }) => ({
				...source,
				status: 'locator-only',
			}))
		: model.sources.map((source) => {
				const record = readSourceRecord(source, options.sourceRoot)
				sourceBytes += Buffer.byteLength(record.content ?? '')
				requireCondition(
					sourceBytes <= 16777216,
					'Included sources exceed the report 16 MiB budget'
				)
				return record
			})
	const content = JSON.stringify({ ...model, sources })
	const decodedBytes = Buffer.byteLength(content)
	requireCondition(
		decodedBytes <= 134217728,
		'Compact report exceeds 128 MiB; narrow the supplied artifact scope'
	)
	const envelope = JSON.stringify({
		encoding: 'gzip-base64',
		sha256: bytesHash(content),
		data: gzipSync(content, { level: 9 }).toString('base64'),
	})
	const script = readFileSync(
		new URL('../../ui/dist/explorer.js', import.meta.url),
		'utf8'
	)
	const style = readFileSync(
		new URL('../../ui/dist/explorer.css', import.meta.url),
		'utf8'
	)
	const policy = `default-src 'none'; script-src 'sha256-${sha256(script)}'; style-src 'sha256-${sha256(style)}'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>Test Impact · Portable report</title><style>${style}</style></head><body><div id="app"></div><script id="impact-data" type="application/json">${envelope}</script><script>${script}</script></body></html>\n`
	const bytes = Buffer.byteLength(html)
	requireCondition(bytes <= 262144000, 'Report exceeds 250 MiB')
	mkdirSync(dirname(out), { recursive: true })
	const temporary = `${out}.${randomUUID()}.tmp`
	try {
		writeFileSync(temporary, html, { flag: 'wx' })
		renameSync(temporary, out)
	} finally {
		rmSync(temporary, { force: true })
	}
	return { bytes, decodedBytes }
}
