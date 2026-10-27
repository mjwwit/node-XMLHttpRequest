import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { performSync as PerformSync } from './sync.js'

const isolatedTransport = (): { directory: string; run: typeof PerformSync } => {
	const directory = mkdtempSync(join(tmpdir(), 'xhr-worker-test-'))
	cpSync(new URL('../dist/', import.meta.url), directory, { recursive: true })

	const require = createRequire(import.meta.url)
	const module = require(join(directory, 'sync.js')) as { performSync: typeof PerformSync }
	return { directory, run: module.performSync }
}

it('reports transport module startup failures through shared reply', () => {
	const { directory, run } = isolatedTransport()

	try {
		rmSync(join(directory, 'transport.js'))

		expect(() =>
			run({ url: 'data:,x', method: 'GET', headers: {}, body: null, options: {} }, 0),
		).toThrow(expect.objectContaining({ name: 'NetworkError' }))
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
})

it('detects worker exit even with unlimited request timeout', () => {
	const { directory, run } = isolatedTransport()

	try {
		writeFileSync(join(directory, 'sync-worker.js'), 'process.exit(2);\n')

		expect(() =>
			run({ url: 'data:,x', method: 'GET', headers: {}, body: null, options: {} }, 0),
		).toThrow(
			expect.objectContaining({
				name: 'NetworkError',
				message: 'Synchronous transport worker stopped responding',
			}),
		)
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
}, 40000)
