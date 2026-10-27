import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createSecureServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import { parentPort } from 'node:worker_threads'
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib'

const storage = new Map<string, { chunks: Buffer[]; length: number }>()
const sockets = new WeakMap<IncomingMessage['socket'], number>()
let socketCount = 0
let otherURL: string

const handler = (req: IncomingMessage, res: ServerResponse): void => {
	const url = new URL(req.url ?? '/', 'http://localhost')

	switch (url.pathname) {
		case '/upgrade':
			res.writeHead(101, { connection: 'Upgrade', upgrade: 'websocket' })
			res.flushHeaders()
			return
		case '/slow':
			setTimeout(() => res.end('late'), 200)
			return
		case '/trickle':
			res.writeHead(200, { 'content-type': 'text/plain;charset=utf-8', 'content-length': '6' })
			res.write(Buffer.from([0x61, 0xe2]))
			setTimeout(() => res.write(Buffer.from([0x82, 0xac])), 60)
			setTimeout(() => res.end('bc'), 120)
			return
		case '/redirect':
			redirect(
				res,
				Number(url.searchParams.get('status') ?? 302),
				url.searchParams.get('to') ?? '/echo',
			)
			return
		case '/cross':
			redirect(res, 302, otherURL + '/echo')
			return
		case '/loop':
			redirect(res, 302, '/loop')
			return
		case '/unsafe':
			redirect(res, 302, 'file:///etc/passwd')
			return
		case '/chain': {
			const remaining = Number(url.searchParams.get('remaining') ?? 0)
			redirect(res, 302, remaining > 1 ? `/chain?remaining=${remaining - 1}` : '/text')
			return
		}
		case '/broken':
			res.writeHead(200, { 'content-length': '1000' })
			res.write('short')
			setTimeout(() => res.destroy(), 20)
			return
		case '/gzip':
			res.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/plain' })
			res.end(gzipSync('compressed ✓'))
			return
		case '/encoded':
			encodedResponse(res, url)
			return
		case '/headers':
			res.writeHead(200, {
				'x-b': 'b',
				'x-a': 'a',
				'set-cookie': 'session=secret',
				'set-cookie2': 'other=secret',
			})
			res.end('headers')
			return
		case '/fixed-headers':
			res.writeHead(200, {
				'Content-Type': 'text/plain',
				'Content-Length': '11',
				'Set-Cookie': 'foo=bar',
				'Set-Cookie2': 'bar=baz',
				Date: 'Thu, 30 Aug 2012 18:17:53 GMT',
				Connection: 'close',
			})
			res.end('Hello World')
			return
		case '/xml':
			res.writeHead(200, { 'content-type': 'application/xml' })
			res.end('<root/>')
			return
		case '/empty':
			res.writeHead(204)
			res.end()
			return
		case '/text':
			res.writeHead(200, { 'content-type': 'text/plain' })
			res.end('Hello world!')
			return
		case '/binary':
			res.writeHead(200, { 'content-type': 'application/octet-stream' })
			res.end(Buffer.from([1, 5, 6, 7]))
			return
		case '/latin1':
		case '/latin1-invalid':
			res.writeHead(200, {
				'content-type': `text/plain;charset=${url.pathname === '/latin1' ? 'iso-8859-1' : 'utf-8'}`,
			})
			res.end(Buffer.from('Héllo wørld naïve', 'latin1'))
			return
	}

	storeOrEcho(req, res, url)
}

const storeOrEcho = (req: IncomingMessage, res: ServerResponse, url: URL): void => {
	if (url.pathname.startsWith('/storage/') && req.method === 'GET') {
		const item = storage.get(url.pathname)

		if (!item) {
			res.writeHead(404)
			res.end()
			return
		}

		res.writeHead(200, {
			'content-type': 'application/octet-stream',
			'content-length': item.length,
		})
		Readable.from(item.chunks).pipe(res)
		return
	}

	const chunks: Buffer[] = []
	req.on('data', (chunk: Buffer) => chunks.push(chunk))
	req.on('end', () => {
		if (url.pathname.startsWith('/storage/')) {
			const length = chunks.reduce((size, chunk) => size + chunk.length, 0)
			storage.set(url.pathname, { chunks, length })
			res.end(String(length))
			return
		}

		if (!sockets.has(req.socket)) {
			sockets.set(req.socket, ++socketCount)
		}

		res.writeHead(200, { 'content-type': 'application/json', 'x-method': req.method ?? '' })
		res.end(
			JSON.stringify({
				method: req.method,
				path: req.url,
				headers: req.headers,
				body: Buffer.concat(chunks).toString('utf8'),
				socket: sockets.get(req.socket),
			}),
		)
	})
}

const redirect = (res: ServerResponse, status: number, location: string): void => {
	res.writeHead(status, { location })
	res.end()
}

const encodedResponse = (res: ServerResponse, url: URL): void => {
	const codings = url.searchParams.get('codings') ?? 'gzip'
	let bytes: Buffer = Buffer.from('compressed ✓')

	for (const [index, coding] of codings.split(',').entries()) {
		switch (coding.trim().toLowerCase()) {
			case 'gzip':
			case 'x-gzip':
				bytes = gzipSync(bytes)
				break
			case 'deflate':
				bytes = deflateSync(bytes)
				break
			case 'br':
				bytes = brotliCompressSync(bytes)
				break
		}

		if (index === 0 && url.searchParams.get('corrupt') === 'inner') {
			bytes = Buffer.from('corrupt')
		}
	}

	if (url.searchParams.get('corrupt') === 'outer') {
		bytes = Buffer.from('corrupt')
	}

	res.writeHead(Number(url.searchParams.get('status') ?? 200), {
		'content-encoding': codings,
		'content-type': 'text/plain;charset=utf-8',
	})
	res.end(bytes)
}

const address = (server: ReturnType<typeof createServer>, protocol: string): string => {
	return `${protocol}://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const server = createServer(handler)
const second = createServer(handler)
const secure = createSecureServer(
	{
		key: readFileSync(new URL('./tls/key.pem', import.meta.url)),
		cert: readFileSync(new URL('./tls/cert.pem', import.meta.url)),
	},
	handler,
)

await Promise.all(
	[server, second, secure].map(
		(server) => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)),
	),
)

otherURL = address(second, 'http')
parentPort?.postMessage({ url: address(server, 'http'), tlsURL: address(secure, 'https') })
