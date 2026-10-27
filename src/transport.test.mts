import { once } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { XMLHttpRequest } from '../dist/xhr.js'
import { completed, request, startServer } from './test-support/xhr.mjs'

let server: Worker
let methodServer: Worker
let url: string
let methodURLs: { http: string; https: string }
const directory = mkdtempSync(join(tmpdir(), 'xhr-resources-'))
const textURL = pathToFileURL(join(directory, 'text with spaces.txt')).href
const binaryURL = pathToFileURL(join(directory, 'binary')).href
const binary = Buffer.from('0000803f0000a0400000c0400000e040', 'hex')

beforeAll(async () => {
	;({ server, url } = await startServer())
	methodServer = new Worker(new URL('./test-support/method-server.mts', import.meta.url))
	;[methodURLs] = (await once(methodServer, 'message')) as [typeof methodURLs]
	writeFileSync(new URL(textURL), 'Hello World')
	writeFileSync(new URL(binaryURL), binary)
})

afterAll(async () => {
	await server.terminate()
	await methodServer.terminate()
	rmSync(directory, { recursive: true, force: true })
})

it('reports unsolicited HTTP upgrades as asynchronous network errors', async () => {
	const xhr = new XMLHttpRequest()
	xhr.open('GET', url + '/upgrade')

	await failed(xhr, false)

	expect(xhr.status).toBe(0)
})

it('rejects unsolicited HTTP upgrades with unlimited synchronous timeout', async () => {
	const worker = new Worker(new URL('./test-support/sync-upgrade.mts', import.meta.url), {
		workerData: url + '/upgrade',
	})

	try {
		const [result] = await once(worker, 'message', { signal: AbortSignal.timeout(3000) })

		expect(result).toEqual({
			error: 'NetworkError',
			readyState: 4,
			status: 0,
			statusText: '',
			responseText: '',
			events: [],
		})
	} finally {
		await worker.terminate()
	}
})

describe.each([false, true])('sync=%s', (sync) => {
	it.each(['none', 'connection', 'upgrade'])(
		'rejects malformed HTTP 101 responses with %s headers',
		async (headers) => {
			const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
			xhr.open('GET', methodURLs.http + '/upgrade?headers=' + headers, !sync)

			await failed(xhr, sync)

			expect(xhr.status).toBe(0)
		},
	)

	it.each(['http', 'https'] as const)(
		'preserves custom method casing over %s',
		async (protocol) => {
			for (const method of ['pAtCh', 'patch', 'PATCH', 'eGg']) {
				const xhr = new XMLHttpRequest({
					syncPolicy: 'enabled',
					rejectUnauthorized: false,
					disableHeaderCheck: true,
				})
				xhr.open(method, methodURLs[protocol] + '/echo', !sync)
				xhr.setRequestHeader('Expect', '100-continue')
				xhr.setRequestHeader('X-Custom', 'retained')
				const done = sync ? undefined : completed(xhr)

				xhr.send('payload ✓')
				await done

				expect(xhr.status).toBe(200)
				expect(JSON.parse(xhr.responseText)).toMatchObject({
					method,
					body: 'payload ✓',
					headers: { expect: '100-continue', 'x-custom': 'retained' },
				})
			}
		},
	)

	it.each([301, 302, 303, 307, 308])(
		'handles custom method casing through %s redirects',
		async (status) => {
			const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
			xhr.open('pAtCh', methodURLs.http + '/?redirect=' + status, !sync)
			const done = sync ? undefined : completed(xhr)

			xhr.send('payload')
			await done

			expect(xhr.status).toBe(200)
			expect(JSON.parse(xhr.responseText)).toMatchObject({
				method: status === 303 ? 'GET' : 'pAtCh',
				body: status === 303 ? '' : 'payload',
				path: '/echo',
			})
		},
	)

	it.each([
		'gzip',
		'GZip',
		'x-GZip',
		'DEFLATE',
		'BR',
		'gzip, br',
		'br, gzip',
		'gzip, deflate, br',
		'gzip, gzip',
		'gzip,',
		', gzip',
		'gzip,,br',
		', gzip, , br,',
	])('decodes content codings %s', async (codings) => {
		const xhr = await request(url + '/encoded?codings=' + encodeURIComponent(codings), sync)

		expect(xhr.status).toBe(200)
		expect(xhr.responseText).toBe('compressed ✓')
		expect(xhr.getResponseHeader('content-encoding')).toBe(codings)
	})

	it.each(['', ',', ' , , '])('passes through an empty coding list %j', async (codings) => {
		const xhr = await request(url + '/encoded?codings=' + encodeURIComponent(codings), sync)

		expect(xhr.status).toBe(200)
		expect(xhr.responseText).toBe('compressed ✓')
	})

	it.each(['inner', 'outer'])('rejects corrupt %s compressed layers', async (layer) => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
		xhr.open('GET', url + '/encoded?codings=gzip,br&corrupt=' + layer, !sync)

		await failed(xhr, sync)

		expect(xhr.status).toBe(0)
	})

	it('preserves encoded bytes when the coding list includes an unsupported coding', async () => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
		xhr.open('GET', url + '/encoded?codings=unsupported,gzip', !sync)
		xhr.responseType = 'arraybuffer'
		const done = sync ? undefined : completed(xhr)

		xhr.send()
		await done

		expect(xhr.status).toBe(200)
		expect(Buffer.from(xhr.response as ArrayBuffer)).toEqual(gzipSync('compressed ✓'))
	})

	it.each([
		['HEAD', 200],
		['GET', 204],
		['GET', 304],
	] as const)('ignores content coding for bodyless %s %s responses', async (method, status) => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
		xhr.open(method, url + `/encoded?codings=gzip,br&corrupt=outer&status=${status}`, !sync)
		const done = sync ? undefined : completed(xhr)

		xhr.send()
		await done

		expect(xhr.status).toBe(status)
		expect(xhr.responseText).toBe('')
	})

	it('reads local text and exact binary file bytes', async () => {
		const text = await request(textURL, sync)

		expect(text.status).toBe(200)
		expect(text.responseText).toBe('Hello World')

		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
		xhr.open('GET', binaryURL, !sync)
		xhr.responseType = 'arraybuffer'
		const done = sync ? undefined : completed(xhr)

		xhr.send()
		await done

		expect(xhr.status).toBe(200)
		expect(xhr.response).toBeInstanceOf(ArrayBuffer)
		expect(Buffer.from(xhr.response as ArrayBuffer)).toEqual(binary)
	})

	it('rejects local files when filesystem resources are disabled', async () => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled', allowFileSystemResources: false })
		xhr.open('GET', textURL, !sync)

		await failed(xhr, sync)

		expect(xhr.status).toBe(0)
	})

	it.each([
		['percent escaping', 'data:,Hello%20World', 'Hello World'],
		['literal spaces', 'data:, Hello World', ' Hello World'],
		['non-final base64 metadata', 'data:base64;example=1;args=2,Hello%20World', 'Hello World'],
		['base64', 'data:text;base64,SGVsbG8gV29ybGQ=', 'Hello World'],
		['base64 whitespace', 'data:text;base64,SGV sbG8gV\n29ybGQ=', 'Hello World'],
		['escaped base64 whitespace', 'data:text;base64,SGV%20sbG8gV%0a29ybGQ=', 'Hello World'],
		['unpadded base64', 'data:text;base64,SGVsbG8gV29ybGQ', 'Hello World'],
	])('decodes data URL: %s', async (_name, dataURL, expected) => {
		const xhr = await request(dataURL, sync)

		expect(xhr.status).toBe(200)
		expect(xhr.responseText).toBe(expected)
	})

	it.each([
		'data:text;base64,SGV&&&&sbG8gV{29ybGQ=',
		'data:text;base64,SGV%26%26%26%26sbG8gV%7B29ybGQ%3D',
		'data:text;base64,SGVsbG8gV29ybGQ==',
	])('rejects malformed data URL: %s', async (dataURL) => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
		xhr.open('GET', dataURL, !sync)

		await failed(xhr, sync)

		expect(xhr.status).toBe(0)
	})

	it.each(['GET', 'POST', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'])(
		'sends %s with correct path',
		async (method) => {
			const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
			xhr.open(method.toLowerCase(), url + '/' + method, !sync)
			const done = sync ? undefined : completed(xhr)

			xhr.send()
			await done

			expect(xhr.status).toBe(200)
			expect(xhr.getResponseHeader('x-method')).toBe(method)

			const result = xhr.responseText
				? (JSON.parse(xhr.responseText) as { method: string; path: string })
				: undefined

			expect([result?.method, result?.path, xhr.responseText === '']).toEqual(
				method === 'HEAD' ? [undefined, undefined, true] : [method, '/' + method, false],
			)
		},
	)

	it.each(['/chain?remaining=20', '/unsafe'])('rejects redirects: %s', async (path) => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled', maxRedirects: 10 })
		xhr.open('GET', url + path, !sync)

		await failed(xhr, sync)

		expect(xhr.status).toBe(0)
	})
})

const failed = async (xhr: XMLHttpRequest, sync: boolean): Promise<void> => {
	const events: string[] = []
	for (const type of ['error', 'load', 'loadend']) {
		xhr.addEventListener(type, () => events.push(type))
	}

	const send = {
		sync: () => expect(() => xhr.send()).toThrow(expect.objectContaining({ name: 'NetworkError' })),
		async: async () => {
			const done = completed(xhr)

			xhr.send()
			await done
		},
	}

	await send[sync ? 'sync' : 'async']()

	expect([xhr.readyState, xhr.status, xhr.statusText, xhr.responseText]).toEqual([4, 0, '', ''])
	expect(events).toEqual(sync ? [] : ['error', 'loadend'])
}
