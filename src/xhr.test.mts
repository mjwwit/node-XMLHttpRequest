import { readFileSync } from 'node:fs'
import { Agent } from 'node:http'
import type { Worker } from 'node:worker_threads'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { XMLHttpRequest } from '../dist/xhr.js'
import { completed, request, startServer } from './test-support/xhr.mjs'

let server: Worker
let url: string
let tlsURL: string

beforeAll(async () => {
	;({ server, url, tlsURL } = await startServer())
})

afterAll(async () => {
	await server.terminate()
})

const echo = (
	xhr: XMLHttpRequest,
): {
	method: string
	body: string
	headers: Record<string, string>
} => {
	return JSON.parse(xhr.responseText) as {
		method: string
		body: string
		headers: Record<string, string>
	}
}

it('starts with DOM defaults and immutable constants', () => {
	const xhr = new XMLHttpRequest()

	expect([
		xhr.readyState,
		xhr.status,
		xhr.statusText,
		xhr.responseText,
		xhr.response,
		xhr.responseXML,
		xhr.responseURL,
	]).toEqual([0, 0, '', '', '', null, ''])
	for (const [value, key] of [
		'UNSENT',
		'OPENED',
		'HEADERS_RECEIVED',
		'LOADING',
		'DONE',
	].entries()) {
		expect(Reflect.get(XMLHttpRequest, key)).toBe(value)
		expect(Reflect.get(xhr, key)).toBe(value)
	}

	expect(Reflect.set(XMLHttpRequest, 'DONE', 12)).toBe(false)
	expect(Reflect.set(xhr, 'DONE', 12)).toBe(false)
})

it('validates methods, URLs, states and headers', () => {
	const xhr = new XMLHttpRequest()

	expect(() => xhr.send()).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))
	expect(() => xhr.open('TRaCE', url)).toThrow(expect.objectContaining({ name: 'SecurityError' }))
	expect(() => xhr.open('bad method', url)).toThrow(
		expect.objectContaining({ name: 'SyntaxError' }),
	)
	expect(() => xhr.open('GET', 'relative')).toThrow(
		expect.objectContaining({ name: 'SyntaxError' }),
	)

	xhr.open('GET', url)

	expect(() => xhr.setRequestHeader('bad\nname', 'x')).toThrow(
		expect.objectContaining({ name: 'SyntaxError' }),
	)
	expect(xhr.setRequestHeader('Cookie', 'x=y')).toBeUndefined()
	expect(xhr.getRequestHeader('cookie')).toBeNull()

	xhr.setRequestHeader('X-Test', ' first ')
	xhr.setRequestHeader('x-test', 'second')

	expect(xhr.getRequestHeader('X-TEST')).toBe('first, second')
})

it.each(['TRACK', 'TRACE', 'CONNECT'])('rejects forbidden method %s', (method) => {
	const xhr = new XMLHttpRequest()

	expect(() => xhr.open(method, url)).toThrow(expect.objectContaining({ name: 'SecurityError' }))
})

describe.each([false, true])('sync=%s', (sync) => {
	it('supports all standard body forms, including binary slices and multipart files', async () => {
		const bytes = new Uint8Array([120, 65, 66, 120])
		const form = new FormData()
		form.append('field', 'value')
		form.append('file', new Blob(['file contents'], { type: 'text/plain' }), 'sample.txt')

		const bodies: XMLHttpRequestBodyInit[] = [
			'hello ✓',
			bytes.subarray(1, 3),
			new DataView(bytes.buffer, 1, 2),
			new Uint8Array([65, 66]).buffer,
			new URLSearchParams({ x: 'a b' }),
			new Blob(['blob'], { type: 'text/custom' }),
			form,
		]
		const results = []

		for (const body of bodies) {
			results.push(echo(await request(url + '/echo', sync, body)))
		}

		expect(results.map((result) => result.body).slice(0, 6)).toEqual([
			'hello ✓',
			'AB',
			'AB',
			'AB',
			'x=a+b',
			'blob',
		])
		expect(results[4]?.headers['content-type']).toBe(
			'application/x-www-form-urlencoded;charset=utf-8',
		)
		expect(results[6]?.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/)
		expect(results[6]?.body).toContain('name="field"')
		expect(results[6]?.body).toContain('file contents')
		expect(results[6]?.body).toContain('filename="sample.txt"')
	})

	it('handles text, JSON, arraybuffer, Blob, empty responses and response getter guards', async () => {
		for (const type of ['', 'text', 'json', 'arraybuffer', 'blob'] as const) {
			const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
			xhr.open('GET', url + '/echo', !sync)
			xhr.responseType = type
			const done = sync ? undefined : completed(xhr)

			xhr.send()
			await done

			expect(xhr.status).toBe(200)

			const checks = {
				'': () => expect(xhr.response).toBe(xhr.responseText),
				text: () => expect(xhr.response).toBe(xhr.responseText),
				json: () => expect(xhr.response).toMatchObject({ method: 'GET' }),
				arraybuffer: () => expect(xhr.response).toBeInstanceOf(ArrayBuffer),
				blob: () => expect(xhr.response).toBeInstanceOf(Blob),
			}

			checks[type]()

			const text = () => xhr.responseText
			const textChecks = {
				'': () => expect(text()).toBeTypeOf('string'),
				text: () => expect(text()).toBeTypeOf('string'),
				json: () => expect(text).toThrow(expect.objectContaining({ name: 'InvalidStateError' })),
				arraybuffer: () =>
					expect(text).toThrow(expect.objectContaining({ name: 'InvalidStateError' })),
				blob: () => expect(text).toThrow(expect.objectContaining({ name: 'InvalidStateError' })),
			}

			textChecks[type]()

			expect(() => {
				xhr.responseType = 'json'
			}).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))
		}

		expect((await request(url + '/empty', sync)).status).toBe(204)
	})

	it('decodes compressed data and filters response cookies', async () => {
		expect((await request(url + '/gzip', sync)).responseText).toBe('compressed ✓')

		const xhr = await request(url + '/headers', sync)

		expect(xhr.getResponseHeader('set-cookie')).toBeNull()
		expect(xhr.getAllResponseHeaders()).not.toContain('set-cookie')
		expect(xhr.getAllResponseHeaders()).toMatch(/x-a: a\r\nx-b: b\r\n$/)
	})

	it.each([301, 302, 303, 307, 308])(
		'follows %i redirects with correct method/body',
		async (status) => {
			const xhr = await request(url + `/redirect?status=${status}`, sync, 'payload')

			expect(echo(xhr)).toMatchObject({
				method: status === 307 || status === 308 ? 'POST' : 'GET',
				body: status === 307 || status === 308 ? 'payload' : '',
			})
			expect(xhr.responseURL).toBe(url + '/echo')
		},
	)

	it('strips cross-origin credentials and never stores cookies', async () => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled', disableHeaderCheck: true })
		xhr.open('GET', url + '/cross', !sync)
		xhr.setRequestHeader('Authorization', 'secret')
		xhr.setRequestHeader('Cookie', 'secret')
		const done = sync ? undefined : completed(xhr)

		xhr.send()
		await done

		expect(echo(xhr).headers['authorization']).toBeUndefined()
		expect(echo(xhr).headers['cookie']).toBeUndefined()

		await request(url + '/headers', sync)

		expect(echo(await request(url + '/echo', sync)).headers['cookie']).toBeUndefined()
	})

	it('uses caller-thread parser/decoder/serializer hooks', async () => {
		const document = { nodeType: 9 } as Document
		let parsed = ''
		const xhr = await request(url + '/xml', sync, undefined, {
			xmlParser: (text) => {
				parsed = text
				return document
			},
		})

		expect(xhr.responseXML).toBe(document)
		expect(parsed).toBe('<root/>')
		expect(
			(await request('data:,raw', sync, undefined, { textDecoder: () => 'custom' })).responseText,
		).toBe('custom')

		const sender = new XMLHttpRequest({
			syncPolicy: 'enabled',
			documentSerializer: () => '<root/>',
		})
		sender.open('POST', url + '/echo', !sync)
		const done = sync ? undefined : completed(sender)

		sender.send(document)
		await done

		expect(echo(sender).body).toBe('<root/>')
	})

	it('preserves TLS options', async () => {
		const ca = readFileSync(new URL('./test-support/tls/cert.pem', import.meta.url))

		expect((await request(tlsURL + '/echo', sync, undefined, { ca })).status).toBe(200)
		expect(
			(await request(tlsURL + '/echo', sync, undefined, { rejectUnauthorized: false })).status,
		).toBe(200)
	})
})

it('sync timeout throws without error events, then instance can be reused', () => {
	const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
	const events: string[] = []
	for (const type of ['error', 'timeout', 'loadend', 'readystatechange']) {
		xhr.addEventListener(type, () => events.push(type))
	}
	xhr.open('GET', url + '/slow', false)
	events.length = 0
	xhr.timeout = 100

	expect(() => xhr.send()).toThrow(expect.objectContaining({ name: 'TimeoutError' }))
	expect(events).toEqual([])
	expect(xhr.status).toBe(0)

	xhr.timeout = 0
	xhr.open('GET', 'data:,reused', false)

	xhr.send()

	expect(xhr.responseText).toBe('reused')
})

it.each(['/unsafe', '/loop', '/broken'])(
	'sync %s failure throws NetworkError without events',
	(path) => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled', maxRedirects: 1 })
		xhr.open('GET', url + path, false)
		let events = 0
		xhr.onerror = () => events++

		expect(() => xhr.send()).toThrow(expect.objectContaining({ name: 'NetworkError' }))
		expect(events).toBe(0)
		expect([xhr.readyState, xhr.status, xhr.statusText]).toEqual([4, 0, ''])
	},
)

it('rejects custom sync agents clearly', () => {
	const agent = new Agent()
	const xhr = new XMLHttpRequest({ agent, syncPolicy: 'enabled' })
	xhr.open('GET', url, false)

	expect(() => xhr.send()).toThrow('Custom agents are not supported')

	agent.destroy()
})

it('async timeout emits ordered terminal events and resets response', async () => {
	const xhr = new XMLHttpRequest()
	const events: string[] = []
	xhr.open('GET', url + '/slow')
	xhr.timeout = 30
	for (const type of ['readystatechange', 'timeout', 'error', 'load', 'loadend']) {
		xhr.addEventListener(type, () => events.push(type))
	}
	const done = completed(xhr)

	xhr.send()
	await done

	expect(events).toEqual(['readystatechange', 'timeout', 'loadend'])
	expect([xhr.status, xhr.statusText, xhr.response]).toEqual([0, '', ''])
})

it('abort during HEADERS_RECEIVED stops data and emits abort before loadend', async () => {
	const xhr = new XMLHttpRequest()
	const events: string[] = []
	xhr.onreadystatechange = () => {
		if (xhr.readyState === 2) {
			xhr.abort()
		}
	}
	for (const type of ['abort', 'error', 'load', 'loadend']) {
		xhr.addEventListener(type, () => events.push(type))
	}
	xhr.open('GET', url + '/trickle')
	const done = completed(xhr)

	xhr.send()
	await done

	expect(events).toEqual(['abort', 'loadend'])
	expect(xhr.readyState).toBe(0)
})

it('reentrant open/send prevents stale request completion', async () => {
	const xhr = new XMLHttpRequest()
	let switched = false
	xhr.onreadystatechange = () => {
		if (xhr.readyState === 2 && !switched) {
			switched = true
			xhr.open('GET', 'data:,new')

			xhr.send()
		}
	}
	xhr.open('GET', url + '/trickle')
	const done = completed(xhr)

	xhr.send()
	await done

	expect(xhr.responseText).toBe('new')
})

it('reports upload progress before upload load/loadend', async () => {
	let progress: Event | undefined
	const xhr = new XMLHttpRequest()
	const events: string[] = []
	for (const type of ['loadstart', 'progress', 'load', 'loadend']) {
		xhr.upload.addEventListener(type, (event) => {
			events.push(type)
			if (type === 'progress') {
				progress = event
			}
		})
	}
	xhr.open('POST', url + '/echo')
	const done = completed(xhr)

	xhr.send('payload')
	await done

	expect(events).toEqual(['loadstart', 'progress', 'load', 'loadend'])
	expect(progress).toMatchObject({ loaded: 7, total: 7, lengthComputable: true })
})

it('emits final async progress before DONE, then readystatechange/load/loadend', async () => {
	const xhr = new XMLHttpRequest()
	const events: string[] = []
	xhr.open('GET', url + '/trickle')
	xhr.onprogress = () => {
		events.push(`progress:${xhr.readyState}`)
	}
	xhr.onreadystatechange = () => {
		if (xhr.readyState === 4) {
			events.push('done')
		}
	}
	xhr.onload = () => {
		events.push('load')
	}
	xhr.onloadend = () => {
		events.push('loadend')
	}
	const done = completed(xhr)

	xhr.send()
	await done

	expect(events.slice(-4)).toEqual(['progress:3', 'done', 'load', 'loadend'])
})

it('sync success emits only terminal state and load events before send returns', () => {
	const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
	const events: string[] = []
	xhr.open('GET', url + '/trickle', false)
	for (const type of ['loadstart', 'progress', 'readystatechange', 'load', 'loadend']) {
		xhr.addEventListener(type, () => events.push(`${type}:${xhr.readyState}`))
	}

	xhr.send()

	expect(events).toEqual(['readystatechange:4', 'load:4', 'loadend:4'])
	expect(xhr.responseText).toBe('a€bc')
})

it('uses full unsigned timeout range without Node timer overflow', async () => {
	const xhr = new XMLHttpRequest()
	xhr.timeout = 0xffffffff
	xhr.open('GET', url + '/trickle')
	const done = completed(xhr)

	xhr.send()
	await done

	expect(xhr.status).toBe(200)
})

it('changing timeout measures elapsed time from send, disabling timeout permits completion', async () => {
	const xhr = new XMLHttpRequest()
	xhr.open('GET', url + '/slow')
	xhr.timeout = 10
	const done = completed(xhr)

	xhr.send()
	xhr.timeout = 0
	await done

	expect(xhr.status).toBe(200)

	xhr.open('GET', url + '/slow')
	const next = completed(xhr)

	xhr.send()
	await new Promise((resolve) => setTimeout(resolve, 30))

	xhr.timeout = 10
	await next

	expect(xhr.status).toBe(0)
})

it('sync rejects untrusted TLS certificates', () => {
	const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
	xhr.open('GET', tlsURL, false)

	expect(() => xhr.send()).toThrow(expect.objectContaining({ name: 'NetworkError' }))
})

it('preserves same-origin Basic auth through redirects', async () => {
	const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
	xhr.open('GET', url + '/redirect', false, 'user', 'password')

	xhr.send()

	expect(echo(xhr).headers['authorization']).toBe(
		`Basic ${Buffer.from('user:password').toString('base64')}`,
	)
})

it.each([false, true])('string/Document headers match UTF-8 encoding; sync=%s', async (sync) => {
	const xhr = new XMLHttpRequest({
		syncPolicy: 'enabled',
		documentSerializer: () => '<root>é</root>',
	})

	for (const body of ['é', { nodeType: 9 } as Document]) {
		xhr.open('POST', url + '/echo', !sync)
		xhr.setRequestHeader('Content-Type', 'text/custom; charset="iso-8859-1"')
		const done = sync ? undefined : completed(xhr)

		xhr.send(body)
		await done

		expect(echo(xhr).headers['content-type']).toBe('text/custom;charset=UTF-8')
		expect(echo(xhr).body).toContain('é')
	}
})
