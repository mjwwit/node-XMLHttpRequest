import type { Worker } from 'node:worker_threads'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { XMLHttpRequest } from '../dist/xhr.js'
import { startServer } from './test-support/xhr.mjs'

// Adapted from web-platform-tests/xhr; source map and BSD license: src/wpt.test.md.
let server: Worker
let url: string

beforeAll(async () => {
	;({ server, url } = await startServer())
})

afterAll(async () => {
	await server.terminate()
})

it.each([0, 1])('WPT abort during state %i emits no readystatechange', (state) => {
	const xhr = new XMLHttpRequest()
	if (state === 1) {
		xhr.open('GET', url)
	}
	let events = 0
	xhr.onreadystatechange = () => events++

	xhr.abort()

	expect([xhr.readyState, xhr.status, xhr.statusText, events]).toEqual([state, 0, '', 0])
})

it.each([true, false])(
	'WPT withCredentials accepts UNSENT/OPENED; rejects sent/DONE; async=%s',
	(async) => {
		const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })

		expect(xhr.withCredentials).toBe(false)

		xhr.withCredentials = true

		expect(xhr.withCredentials).toBe(true)

		xhr.open('GET', url + '/trickle', async)
		xhr.withCredentials = false
		const done = new Promise<void>((resolve) => {
			xhr.onloadend = () => resolve()
		})

		xhr.send()

		expect(() => {
			xhr.withCredentials = true
		}).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))

		return done.then(() => {
			expect(() => {
				xhr.withCredentials = true
			}).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))
		})
	},
)

it('WPT repeated LOADING state notifications retain split UTF-8', async () => {
	const xhr = new XMLHttpRequest()
	let count = 0
	xhr.onreadystatechange = () => {
		if (xhr.readyState === 3) {
			count++
		}
	}
	xhr.open('GET', url + '/trickle')
	const done = new Promise<void>((resolve) => {
		xhr.onloadend = () => resolve()
	})

	xhr.send()
	await done

	expect(count).toBeGreaterThan(1)
	expect(xhr.responseText).toBe('a€bc')
})
