import type { Worker } from 'node:worker_threads'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { XMLHttpRequest } from '../dist/xhr.js'
import { completed, startServer } from './test-support/xhr.mjs'

let server: Worker
let url: string

beforeAll(async () => {
	;({ server, url } = await startServer())
})

afterAll(async () => {
	await server.terminate()
})

describe.each([false, true])('sync=%s', (sync) => {
	const latin1 = 'Héllo wørld naïve'
	const bytes = Buffer.from(latin1, 'latin1')
	const utf8 = new TextDecoder().decode(bytes)
	const dataURL = (charset: string) =>
		`data:text/plain;charset=${charset};base64,${bytes.toString('base64')}`

	it.each([
		['/latin1', '', 'text/plain;charset=iso-8859-1'],
		[
			'data:multipart/mixed;boundary=AbC;profile="one two",payload',
			'',
			'multipart/mixed;boundary=abc;profile="one two"',
		],
		[
			'/latin1',
			'application/custom;charset=UTF-8;version=2',
			'application/custom;charset=utf-8;version=2',
		],
		['/latin1', 'text/plain', 'text/plain'],
	])(
		'preserves complete Blob MIME type for %s, override "%s"',
		async (path, override, expected) => {
			const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
			xhr.open('GET', path.startsWith('data:') ? path : url + path, !sync)
			xhr.responseType = 'blob'

			if (override) {
				xhr.overrideMimeType(override)
			}

			const done = sync ? undefined : completed(xhr)

			xhr.send()
			await done

			const blob = xhr.response as Blob

			expect(xhr.status).toBe(200)
			expect(blob).toBeInstanceOf(Blob)
			expect(blob.type).toBe(expected)
			expect(Buffer.from(await blob.arrayBuffer())).toEqual(
				path === '/latin1' ? bytes : Buffer.from('payload'),
			)
			expect(xhr.response).toBe(blob)
		},
	)

	it('preserves MIME override set before the first open', async () => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
		xhr.overrideMimeType('text/plain;charset=UTF-8')
		xhr.open('GET', dataURL('ISO-8859-1'), !sync)
		const done = sync ? undefined : completed(xhr)

		xhr.send()
		await done

		expect(xhr.status).toBe(200)
		expect(xhr.responseText).toBe(utf8)
	})

	it('preserves MIME override when reopening an unsent request', async () => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
		xhr.open('GET', 'data:,unused', !sync)
		xhr.overrideMimeType('text/plain;charset=ISO-8859-1')
		xhr.open('GET', dataURL('UTF-8'), !sync)
		const done = sync ? undefined : completed(xhr)

		xhr.send()
		await done

		expect(xhr.status).toBe(200)
		expect(xhr.responseText).toBe(latin1)
	})

	it('preserves MIME override across completed requests and permits replacing it', async () => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
		xhr.open('GET', dataURL('UTF-8'), !sync)
		xhr.overrideMimeType('text/plain;charset=ISO-8859-1')
		let done = sync ? undefined : completed(xhr)

		xhr.send()
		await done

		expect(xhr.responseText).toBe(latin1)

		xhr.open('GET', url + '/latin1-invalid', !sync)
		done = sync ? undefined : completed(xhr)

		xhr.send()
		await done

		expect(xhr.responseText).toBe(latin1)

		xhr.open('GET', dataURL('ISO-8859-1'), !sync)
		xhr.overrideMimeType('text/plain;charset=UTF-8')
		done = sync ? undefined : completed(xhr)

		xhr.send()
		await done

		expect(xhr.status).toBe(200)
		expect(xhr.responseText).toBe(utf8)
	})

	it.each([
		['UTF-8', 'efbbbfc3a9'],
		['UTF-16LE', 'fffee900'],
		['UTF-16BE', 'feff00e9'],
	])('prefers %s BOM over response and override charsets', async (_encoding, hex) => {
		for (const override of ['', 'text/plain;charset=windows-1252']) {
			const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
			const bytes = Buffer.from(hex, 'hex')
			xhr.open(
				'GET',
				`data:text/plain;charset=windows-1252;base64,${bytes.toString('base64')}`,
				!sync,
			)

			if (override) {
				xhr.overrideMimeType(override)
			}

			const done = sync ? undefined : completed(xhr)

			xhr.send()
			await done

			expect(xhr.status).toBe(200)
			expect(xhr.responseText).toBe('é')
		}
	})

	it.each([
		['/latin1', '', latin1],
		['/latin1', 'text/plain', latin1],
		['/latin1', 'application/octet-stream', latin1],
		['/latin1-invalid', 'text/plain; charset=ISO-8859-1', latin1],
		['/latin1-invalid', '', utf8],
		['/latin1-invalid', 'text/plain; charset=lorem_ipsum', utf8],
		[dataURL('ISO-8859-1'), '', latin1],
		[dataURL('ISO-8859-1'), 'text/plain', latin1],
		[dataURL('ISO-8859-1'), 'text/plain; charset=UTF-8', utf8],
		[dataURL('UTF-8'), 'text/plain; charset=ISO-8859-1', latin1],
		[dataURL('lorem_ipsum'), '', utf8],
		[dataURL('ISO-8859-1'), 'text/plain; charset=lorem_ipsum', utf8],
	])('decodes MIME charset %s, override "%s"', async (path, override, expected) => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled', textDecoder: null })
		xhr.open('GET', path.startsWith('data:') ? path : url + path, !sync)

		if (override) {
			xhr.overrideMimeType(override)
		}

		const done = sync ? undefined : completed(xhr)

		xhr.send()
		await done

		expect(xhr.status).toBe(200)
		expect(xhr.responseText).toBe(expected)
	})

	it('reuses an instance for exact binary, UTF-8 text, Blob and JSON round trips', async () => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
		const floats = new Float32Array([1, 5, 6, 7, 2, 8])
		const bytes = new Uint8Array(floats.buffer)
		const text = Buffer.from(bytes).toString('latin1')
		const json = { ralph: [1, 2], count: floats.length, text: 'hello ✓' }

		await upload(xhr, '/storage/small', bytes, sync)
		await download(xhr, '/storage/small', 'arraybuffer', sync)

		const buffer = xhr.response as ArrayBuffer

		expect(buffer).toBeInstanceOf(ArrayBuffer)
		expect(buffer.byteLength).toBe(bytes.length)
		expect(new Float32Array(buffer)).toEqual(floats)
		expect(new Float32Array(buffer).byteOffset).toBe(0)

		await download(xhr, '/storage/small', 'blob', sync)

		const blob = xhr.response as Blob

		expect(blob).toBeInstanceOf(Blob)
		expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes)

		await upload(xhr, '/storage/text', text, sync)

		for (const type of ['text', ''] as const) {
			await download(xhr, '/storage/text', type, sync)

			expect(xhr.responseText).toBe(text)
			expect(Buffer.from(xhr.responseText, 'latin1')).toEqual(Buffer.from(bytes))
		}

		await upload(xhr, '/storage/json', JSON.stringify(json), sync)
		await download(xhr, '/storage/json', 'json', sync)

		expect(xhr.response).toEqual(json)
	})
})

it.each([
	['text', '/text', 'text/plain', 'Hello world!'],
	['arraybuffer', '/binary', 'application/octet-stream', [1, 5, 6, 7]],
] as const)('sync DONE exposes complete %s before send returns', (type, path, mime, expected) => {
	const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
	xhr.open('GET', url + path, false)
	xhr.responseType = type
	let seen = false
	let result: unknown
	let contentType: string | null = null

	xhr.onreadystatechange = () => {
		if (xhr.readyState !== xhr.DONE) {
			return
		}

		seen = true
		result = type === 'text' ? xhr.responseText : [...new Uint8Array(xhr.response as ArrayBuffer)]
		contentType = xhr.getResponseHeader('content-type')
	}

	xhr.send()

	expect(seen).toBe(true)
	expect(xhr.status).toBe(200)
	expect(result).toEqual(expected)
	expect(contentType).toBe(mime)
})

it.each([false, true])(
	'reconstructs million-float bytes without tearing; UTF-8=%s',
	async (utf8) => {
		const floats = new Float32Array(1_000_000)
		for (let index = 0; index < floats.length; index++) {
			floats[index] = index / 7
		}

		const bytes = Buffer.from(floats.buffer)
		const text = bytes.toString('latin1')
		const encoded = utf8 ? Buffer.from(text) : bytes
		const path = utf8 ? '/storage/large-utf8' : '/storage/large-binary'
		const xhr = new XMLHttpRequest()

		await upload(xhr, path, encoded)
		await download(xhr, path, 'text')
		const decoded = xhr.responseText

		await download(xhr, path, 'arraybuffer')
		const buffer = xhr.response as ArrayBuffer
		const raw = Buffer.from(buffer)
		const restored = utf8 ? Buffer.from(decoded, 'latin1') : raw
		const reconstructed = new Float32Array(new Uint8Array(restored).buffer)

		expect(decoded).toBe(encoded.toString('utf8'))
		expect(buffer.byteLength).toBe(encoded.length)
		expect(raw.equals(encoded)).toBe(true)
		expect(restored.equals(bytes)).toBe(true)
		expect(reconstructed.byteOffset).toBe(0)
		expect(reconstructed.length).toBe(floats.length)
		expect(reconstructed.subarray(0, 1000)).toEqual(floats.subarray(0, 1000))
	},
)

it('uploads and downloads 400 MB with a five-second download gate', async () => {
	const bytes = Buffer.alloc(400_000_000, 0xa5)
	const xhr = new XMLHttpRequest()

	await upload(xhr, '/storage/performance', bytes)

	expect(xhr.responseText).toBe(String(bytes.length))

	const started = performance.now()
	await download(xhr, '/storage/performance', 'arraybuffer')
	const result = xhr.response as ArrayBuffer
	const elapsed = performance.now() - started

	expect(elapsed).toBeLessThan(5000)
	expect(result.byteLength).toBe(bytes.length)
	expect(Buffer.from(result).equals(bytes)).toBe(true)
}, 60000)

const upload = async (
	xhr: XMLHttpRequest,
	path: string,
	body: XMLHttpRequestBodyInit,
	sync = false,
): Promise<void> => {
	xhr.open('POST', url + path, !sync)
	xhr.responseType = ''
	const done = sync ? undefined : completed(xhr)

	xhr.send(body)
	await done

	expect(xhr.status).toBe(200)
}

const download = async (
	xhr: XMLHttpRequest,
	path: string,
	type: XMLHttpRequestResponseType,
	sync = false,
): Promise<void> => {
	xhr.open('GET', url + path, !sync)
	xhr.responseType = type
	const done = sync ? undefined : completed(xhr)

	xhr.send()
	await done

	expect(xhr.status).toBe(200)
}
