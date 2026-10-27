import { once } from 'node:events'
import { Agent, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { setTimeout } from 'node:timers/promises'
import type { Worker } from 'node:worker_threads'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { XMLHttpRequest } from '../dist/xhr.js'
import { normalizeOptions, type Options } from './options.js'
import { completed, request, startServer } from './test-support/xhr.mjs'

let server: Worker
let url: string

beforeAll(async () => {
	;({ server, url } = await startServer())
})

afterAll(async () => {
	await server.terminate()
})

it.each([undefined, 'warn', 'enabled'] as const)(
	'sync policy %s controls warnings',
	(syncPolicy) => {
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})

		try {
			const xhr = new XMLHttpRequest(syncPolicy === undefined ? {} : { syncPolicy })
			xhr.open('GET', 'data:,Hello World', false)

			xhr.send()

			expect(xhr.responseText).toBe('Hello World')
			expect(warning.mock.calls).toEqual(
				syncPolicy === 'enabled'
					? []
					: [
							[
								"[Deprecation] Synchronous XMLHttpRequest is deprecated because of its detrimental effects to the end user's experience. For more information, see https://xhr.spec.whatwg.org/#sync-flag",
							],
						],
			)
		} finally {
			warning.mockRestore()
		}
	},
)

it('disabled sync policy rejects send without warnings', () => {
	const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})

	try {
		const xhr = new XMLHttpRequest({ syncPolicy: 'disabled' })
		xhr.open('GET', 'data:,disabled', false)

		expect(() => xhr.send()).toThrow('Synchronous requests are disabled for this instance.')
		expect(warning).not.toHaveBeenCalled()
	} finally {
		warning.mockRestore()
	}
})

describe.each([false, true])('sync=%s', (sync) => {
	it.each(['text', ''])('resolves relative URL "%s" against origin', async (path) => {
		const xhr = await request(path, sync, undefined, { origin: url + '/text' })

		expect(xhr.status).toBe(200)
		expect(xhr.responseURL).toBe(url + '/text')
		expect(xhr.getResponseHeader('content-type')).toBe('text/plain')
		expect(xhr.responseText).toBe('Hello world!')
	})
})

it('reuses a caller-supplied async keep-alive agent across repeated requests', async () => {
	const agent = new Agent({ keepAlive: true, keepAliveMsecs: 2000, maxSockets: 1 })
	const xhr = new XMLHttpRequest({ agent })
	const sockets = new Set<number>()

	try {
		for (let index = 0; index < 22; index++) {
			xhr.open('GET', url + '/echo')
			const done = completed(xhr)

			xhr.send()
			await done

			expect(xhr.status).toBe(200)
			const response = JSON.parse(xhr.responseText) as { socket: number }
			sockets.add(response.socket)
		}

		expect(sockets.size).toBe(1)
	} finally {
		agent.destroy()
	}
})

it('supports repeated async requests across short server keep-alive timeouts', async () => {
	const server = createServer({ keepAliveTimeout: 200 }, (_req, res) => res.end('hello\n'))
	const agent = new Agent({ keepAlive: true, keepAliveMsecs: 2000 })
	const xhr = new XMLHttpRequest({ agent })

	try {
		server.listen(0, '127.0.0.1')
		await once(server, 'listening')
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

		for (let index = 0; index < 22; index++) {
			await setTimeout(200)
			xhr.open('GET', url)
			const done = completed(xhr)

			xhr.send()
			await done

			expect(xhr.status).toBe(200)
			expect(xhr.responseText).toBe('hello\n')
		}
	} finally {
		agent.destroy()
		await new Promise<void>((resolve) => server.close(() => resolve()))
	}
})

it.each(['value', 'accessor', 'response accessor'])(
	'ignores prototype pollution through %s',
	(kind) => {
		const keys = ['textDecoder', 'responseText']
		const previous = keys.map((key) => Object.getOwnPropertyDescriptor(Object.prototype, key))
		let text: string
		let normalized: Options

		try {
			Object.defineProperty(Object.prototype, 'textDecoder', {
				configurable: true,
				...(kind === 'value'
					? { value: () => 'Polluted!' }
					: { get: () => () => 'Polluted!', set: () => {} }),
			})

			if (kind === 'response accessor') {
				Object.defineProperty(Object.prototype, 'responseText', {
					configurable: true,
					get: () => 'Polluted!',
					set: () => {},
				})
			}

			normalized = normalizeOptions({})
			const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
			xhr.open('GET', 'data:,Hello World', false)

			xhr.send()
			text = xhr.responseText
		} finally {
			for (const [index, key] of keys.entries()) {
				const descriptor = previous[index]

				if (descriptor) {
					Object.defineProperty(Object.prototype, key, descriptor)
				} else {
					Reflect.deleteProperty(Object.prototype, key)
				}
			}
		}

		expect(Object.getPrototypeOf(normalized)).toBeNull()
		expect(normalized.textDecoder).toBeUndefined()
		expect(text).toBe('Hello World')
	},
)
