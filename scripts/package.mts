import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync, mkdtempSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const directory = mkdtempSync(join(tmpdir(), 'xhr-package-'))
const archiveName = `xhr-package-${randomUUID()}.tgz`
const archive = join(root, archiveName)

const run = (command: string, args: string[], options: SpawnSyncOptions = {}): string => {
	const result = spawnSync(command, args, { ...options, encoding: 'utf8' })

	if (result.error) {
		throw result.error
	}

	if (result.status !== 0) {
		throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`)
	}

	return result.stdout
}

try {
	run('pnpm', ['pack', '--out', archiveName], { shell: process.platform === 'win32' })
	run('tar', ['-xf', archive, '-C', directory])

	mkdirSync(join(directory, 'node_modules'))
	renameSync(join(directory, 'package'), join(directory, 'node_modules', 'xmlhttprequest-ssl'))
	cpSync(new URL('./fixtures/package/', import.meta.url), directory, { recursive: true })

	run(process.execPath, ['smoke.mts'], { cwd: directory })
	run(
		process.execPath,
		[
			join(root, 'node_modules/typescript/bin/tsc'),
			'--strict',
			'--noEmit',
			'--module',
			'NodeNext',
			'--target',
			'ES2023',
			'--lib',
			'ES2023,DOM,DOM.Iterable',
			'--typeRoots',
			join(root, 'node_modules/@types'),
			'--types',
			'node',
			'smoke.mts',
			'consumer.mts',
			'consumer.cts',
		],
		{ cwd: directory },
	)

	console.log(
		'Packed CJS/ESM constructor identity, sync/async transport, DOM declarations and zero production dependencies verified.',
	)
} finally {
	rmSync(archive, { force: true })
	rmSync(directory, { recursive: true, force: true })
}
