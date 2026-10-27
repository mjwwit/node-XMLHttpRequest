import { readFileSync } from 'node:fs'
import { createServer, type AddressInfo, type Socket } from 'node:net'
import { createServer as createSecureServer } from 'node:tls'
import { parentPort } from 'node:worker_threads'

const handleConnection = (socket: Socket): void => {
	let bytes = Buffer.alloc(0)
	socket.on('error', () => {})
	socket.on('data', (chunk: Buffer) => {
		bytes = Buffer.concat([bytes, chunk])
		const end = bytes.indexOf('\r\n\r\n')
		if (end === -1) {
			return
		}

		const [line = '', ...fields] = bytes.subarray(0, end).toString().split('\r\n')
		const [method, path = ''] = line.split(' ')
		const headers = Object.fromEntries(
			fields.map((field) => {
				const colon = field.indexOf(':')
				return [field.slice(0, colon).toLowerCase(), field.slice(colon + 1).trim()]
			}),
		)
		const length = Number(headers['content-length'] ?? 0)
		if (bytes.length < end + 4 + length) {
			return
		}

		socket.removeAllListeners('data')
		const target = new URL(path, 'http://localhost')
		if (target.pathname === '/upgrade') {
			const mode = target.searchParams.get('headers')
			const upgrade = mode === 'upgrade' ? 'Upgrade: websocket\r\n' : ''
			const connection = mode === 'connection' ? 'Connection: Upgrade\r\n' : ''
			socket.end(`HTTP/1.1 101 Switching Protocols\r\n${upgrade}${connection}\r\n`)
			return
		}

		const body = bytes.subarray(end + 4, end + 4 + length).toString()
		const status = target.searchParams.get('redirect')
		const response = JSON.stringify({ method, path, headers, body })
		const head = status
			? `HTTP/1.1 ${status} Redirect\r\nLocation: /echo\r\n`
			: 'HTTP/1.1 200 OK\r\n'

		socket.end(
			`${head}Connection: close\r\nContent-Length: ${Buffer.byteLength(response)}\r\n\r\n${response}`,
		)
	})
}

const server = createServer(handleConnection)
const secure = createSecureServer(
	{
		key: readFileSync(new URL('./tls/key.pem', import.meta.url)),
		cert: readFileSync(new URL('./tls/cert.pem', import.meta.url)),
	},
	handleConnection,
)

await Promise.all(
	[server, secure].map(
		(server) => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)),
	),
)

parentPort?.postMessage({
	http: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
	https: `https://127.0.0.1:${(secure.address() as AddressInfo).port}`,
})
