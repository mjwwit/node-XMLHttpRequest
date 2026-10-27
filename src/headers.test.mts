import type { Worker } from 'node:worker_threads'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { XMLHttpRequest } from '../dist/xhr.js'
import { completed, request, startServer } from './test-support/xhr.mjs'

let server: Worker
let url: string

beforeAll(async () => {
	;({ server, url } = await startServer())
})

afterAll(async () => {
	await server.terminate()
})

it.each([
	'accept-charset',
	'accept-encoding',
	'access-control-request-headers',
	'access-control-request-method',
	'connection',
	'content-length',
	'content-transfer-encoding',
	'cookie',
	'cookie2',
	'date',
	'expect',
	'host',
	'keep-alive',
	'origin',
	'referer',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'via',
])('ignores forbidden request header %s', (name) => {
	const xhr = new XMLHttpRequest()
	xhr.open('GET', url)

	expect(xhr.setRequestHeader(name, 'Test')).toBeUndefined()
	expect(xhr.getRequestHeader(name)).toBeNull()
})

describe.each([false, true])('sync=%s', (sync) => {
	it('sends allowed headers and suppresses Referer unless explicitly enabled', async () => {
		for (const disableHeaderCheck of [false, true]) {
			const xhr = new XMLHttpRequest({ syncPolicy: 'enabled', disableHeaderCheck })
			xhr.open('POST', url + '/echo', !sync)
			xhr.setRequestHeader('X-Test', 'Foobar')
			xhr.setRequestHeader('user-agent', 'node-XMLHttpRequest-test')
			xhr.setRequestHeader('content-type', 'text/plain')
			xhr.setRequestHeader('Referer', 'http://github.com')
			const done = sync ? undefined : completed(xhr)

			xhr.send('Hello World')
			await done

			expect(xhr.status).toBe(200)
			const { headers } = JSON.parse(xhr.responseText) as { headers: Record<string, string> }

			expect(headers['x-test']).toBe('Foobar')
			expect(headers['user-agent']).toBe('node-XMLHttpRequest-test')
			expect(headers['content-type']).toBe('text/plain')
			expect(headers['referer']).toBe(disableHeaderCheck ? 'http://github.com' : undefined)
		}
	})

	it('sorts response headers with CRLF, hides both cookie headers, clears on abort', async () => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })

		expect(xhr.getResponseHeader('Content-Type')).toBeNull()
		expect(xhr.getAllResponseHeaders()).toBe('')

		xhr.open('GET', url + '/fixed-headers', !sync)
		const done = sync ? undefined : completed(xhr)

		xhr.send()
		await done

		expect(xhr.getAllResponseHeaders()).toBe(
			'connection: close\r\ncontent-length: 11\r\ncontent-type: text/plain\r\ndate: Thu, 30 Aug 2012 18:17:53 GMT\r\n',
		)

		for (const casing of ['Content-Type', 'Content-type', 'content-Type', 'content-type']) {
			expect(xhr.getResponseHeader(casing)).toBe('text/plain')
		}

		expect(xhr.getResponseHeader('Set-Cookie')).toBeNull()
		expect(xhr.getResponseHeader('Set-Cookie2')).toBeNull()

		xhr.abort()

		expect(xhr.getAllResponseHeaders()).toBe('')
		expect(xhr.getResponseHeader('Connection')).toBeNull()
	})
})

it('does not expose inherited response header keys', async () => {
	const xhr = await request(url + '/headers', false)

	expect(xhr.getResponseHeader('__proto__')).toBeNull()
	expect(xhr.getResponseHeader('constructor')).toBeNull()
})
