import { readFile } from 'node:fs/promises'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { pipeline, type Readable, type Transform } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import { encodeBody, type Body } from './body.js'
import { utf8ContentType } from './mime.js'
import type { Options } from './options.js'

export interface RequestData {
	url: string
	method: string
	headers: Record<string, string>
	body: Body
	options: Options
}

export interface ResponseHead {
	url: string
	status: number
	statusText: string
	headers: Record<string, string>
}

export interface Result extends ResponseHead {
	bytes: Uint8Array<ArrayBuffer>
}

export interface Observer {
	headers?: (head: ResponseHead) => void
	chunk?: (bytes: Buffer) => void
	upload?: (loaded: number, total: number) => void
}

interface EncodedRequest extends Omit<RequestData, 'body'> {
	body: Uint8Array<ArrayBuffer> | null
}

interface Context {
	signal: AbortSignal
	observer: Observer
	redirects: number
}

export const performRequest = async (
	data: RequestData,
	signal: AbortSignal,
	observer: Observer = {},
): Promise<Result> => {
	const encoded = await encodeBody(data.body)
	signal.throwIfAborted()

	const headers = Object.assign(
		Object.create(null) as Record<string, string>,
		{ accept: '*/*', 'user-agent': 'node-XMLHttpRequest' },
		data.headers,
	)
	if (encoded.contentType && !headers['content-type']) {
		headers['content-type'] = encoded.contentType
	}

	if (encoded.forceUTF8 && headers['content-type']) {
		headers['content-type'] = utf8ContentType(headers['content-type'])
	}

	if (encoded.bytes !== null) {
		headers['content-length'] = String(encoded.bytes.byteLength)
	} else if (['POST', 'PUT'].includes(data.method)) {
		headers['content-length'] = '0'
	}

	return requestURL({ ...data, headers, body: encoded.bytes }, { signal, observer, redirects: 0 })
}

const requestURL = (data: EncodedRequest, context: Context): Promise<Result> => {
	const url = new URL(data.url)

	if (url.protocol === 'data:' || url.protocol === 'file:') {
		return readResource(url, data, context)
	}

	if (!['http:', 'https:'].includes(url.protocol)) {
		return Promise.reject(new Error('Protocol not supported.'))
	}

	return requestHTTP(url, data, context)
}

const requestHTTP = (url: URL, data: EncodedRequest, context: Context): Promise<Result> => {
	const { method, headers, body, options } = data
	const { signal, observer } = context

	return new Promise((resolve, reject) => {
		const request = url.protocol === 'https:' ? httpsRequest : httpRequest
		const req = request(
			url,
			{ ...tlsOptions(options), method, agent: options.agent ?? false, signal },
			(res) => {
				res.on('error', reject)
				resolve(handleResponse(res, url, data, context))
			},
		)

		req.method = method
		for (const [name, value] of Object.entries(headers)) {
			req.setHeader(name, value)
		}

		req.on('error', reject)
		req.on('upgrade', (_res, socket) => {
			socket.destroy()
			reject(new Error('Protocol upgrades are not supported'))
		})
		req.on('socket', (socket) => {
			if (options.autoUnref) {
				socket.unref()
			}
		})

		if (body !== null) {
			req.write(body)
		}

		req.end(() => {
			if (body !== null && !signal.aborted) {
				observer.upload?.(body.byteLength, body.byteLength)
			}
		})
	})
}

const handleResponse = (
	res: IncomingMessage,
	url: URL,
	data: EncodedRequest,
	context: Context,
): Promise<Result> => {
	const status = res.statusCode ?? 0

	if (status === 101) {
		res.destroy()
		return Promise.reject(new Error('Protocol upgrades are not supported'))
	}

	if ([301, 302, 303, 307, 308].includes(status) && res.headers.location !== undefined) {
		res.resume()
		return followRedirect(res.headers.location, status, url, data, context)
	}

	const headers = Object.fromEntries(
		Object.entries(res.headers)
			.filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
			.map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]),
	)
	const head: ResponseHead = {
		url: url.href.replace(/#.*$/, ''),
		status,
		statusText: res.statusMessage ?? '',
		headers,
	}

	context.observer.headers?.(head)

	const stream = decodedStream(res, data.method)

	return readResponse(stream, res, context.observer).then((bytes) => ({ ...head, bytes }))
}

const followRedirect = (
	location: string,
	status: number,
	url: URL,
	data: EncodedRequest,
	context: Context,
): Promise<Result> => {
	if (context.redirects >= (data.options.maxRedirects ?? 20)) {
		return Promise.reject(new Error('Too many redirects'))
	}

	let next: URL

	try {
		next = new URL(location, url)
	} catch {
		return Promise.reject(new Error('Unsafe redirect'))
	}

	if (
		!['https:', 'http:'].includes(next.protocol) ||
		((next.username || next.password) && next.origin !== url.origin)
	) {
		return Promise.reject(new Error('Unsafe redirect'))
	}

	const headers = { ...data.headers }

	if (next.origin !== url.origin) {
		for (const name of ['authorization', 'proxy-authorization', 'cookie', 'host']) {
			delete headers[name]
		}
	}

	const toGet =
		((status === 301 || status === 302) && data.method === 'POST') ||
		(status === 303 && data.method !== 'GET' && data.method !== 'HEAD')
	if (toGet) {
		for (const name of [
			'content-length',
			'content-type',
			'content-encoding',
			'content-language',
			'content-location',
		]) {
			delete headers[name]
		}
	}

	return requestURL(
		{
			...data,
			url: next.href,
			headers,
			method: toGet ? 'GET' : data.method,
			body: toGet ? null : data.body,
		},
		{ ...context, redirects: context.redirects + 1 },
	)
}

const readResponse = (
	stream: Readable,
	response: IncomingMessage,
	observer: Observer,
): Promise<Buffer<ArrayBuffer>> => {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = []
		response.on('error', reject)
		stream.on('error', reject)
		stream.on('data', (chunk: Buffer) => {
			chunks.push(chunk)
			observer.chunk?.(chunk)
		})
		stream.on('end', () => resolve(Buffer.concat(chunks)))
	})
}

const decodedStream = (response: IncomingMessage, method: string): Readable => {
	if (method === 'HEAD' || [204, 304].includes(response.statusCode ?? 0)) {
		return response
	}

	const factories = (response.headers['content-encoding'] ?? '')
		.split(',')
		.map((coding) => coding.trim().toLowerCase())
		.filter((coding) => coding !== '')
		.map((coding) => contentDecoders.get(coding))

	if (factories.length === 0 || !factories.every((factory) => factory !== undefined)) {
		return response
	}

	const streams = factories.reverse().map((create) => create())
	pipeline([response, ...streams], () => {})

	return streams.at(-1) ?? response
}

const contentDecoders = new Map<string, () => Transform>([
	['gzip', createGunzip],
	['x-gzip', createGunzip],
	['deflate', createInflate],
	['br', createBrotliDecompress],
])

const readResource = async (url: URL, data: EncodedRequest, context: Context): Promise<Result> => {
	let bytes: Uint8Array<ArrayBuffer>
	let contentType = ''

	if (url.protocol === 'file:') {
		if (data.options.allowFileSystemResources === false) {
			throw new Error(`Not allowed to load local resource: ${url.href}`)
		}

		if (data.method !== 'GET') {
			throw new Error('XMLHttpRequest: Only GET method is supported')
		}
		bytes = new Uint8Array(await readFile(fileURLToPath(url), { signal: context.signal }))
	} else {
		const response = await fetch(url, { signal: context.signal })
		bytes = new Uint8Array(await response.arrayBuffer())
		contentType = response.headers.get('content-type') ?? ''
	}

	context.signal.throwIfAborted()

	const head: ResponseHead = {
		url: url.href.replace(/#.*$/, ''),
		status: 200,
		statusText: 'OK',
		headers: contentType ? { 'content-type': contentType } : {},
	}

	context.observer.headers?.(head)
	if (bytes.length) {
		context.observer.chunk?.(Buffer.from(bytes))
	}

	return { ...head, bytes }
}

const tlsOptions = (
	options: Options,
): Pick<
	Options,
	'pfx' | 'key' | 'passphrase' | 'cert' | 'ca' | 'ciphers' | 'rejectUnauthorized'
> => {
	return Object.fromEntries(
		['pfx', 'key', 'passphrase', 'cert', 'ca', 'ciphers', 'rejectUnauthorized']
			.filter((key) => Object.hasOwn(options, key))
			.map((key) => [key, Reflect.get(options, key)]),
	)
}
