import { once } from 'node:events'
import { Worker } from 'node:worker_threads'
import { XMLHttpRequest } from '../../dist/xhr.js'
import type { Options } from '../options.js'

export const startServer = async (): Promise<{ server: Worker; url: string; tlsURL: string }> => {
	const server = new Worker(new URL('./http-server.mts', import.meta.url))
	const [message] = (await once(server, 'message')) as [{ url: string; tlsURL: string }]

	return { server, ...message }
}

export const completed = (xhr: XMLHttpRequest): Promise<void> => {
	return new Promise((resolve) => xhr.addEventListener('loadend', () => resolve(), { once: true }))
}

export const request = async (
	url: string,
	sync: boolean,
	body?: XMLHttpRequestBodyInit,
	options: Options = {},
): Promise<XMLHttpRequest> => {
	const xhr = new XMLHttpRequest({ syncPolicy: 'enabled', ...options })
	xhr.open(body === undefined ? 'GET' : 'POST', url, !sync)
	const done = sync ? undefined : completed(xhr)

	xhr.send(body)
	await done

	return xhr
}
