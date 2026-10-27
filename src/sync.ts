import { join } from 'node:path'
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads'
import type { RequestData, Result } from './transport.js'

export type SyncReply = { ok: true; result: Result } | { ok: false; name: string; message: string }

export const performSync = (data: RequestData, timeout: number): Result => {
	if (data.options.agent && typeof data.options.agent === 'object') {
		throw new TypeError('Custom agents are not supported for synchronous requests')
	}

	const {
		xmlParser: _parser,
		textDecoder: _decoder,
		documentSerializer: _serializer,
		...options
	} = data.options
	const control = new Int32Array(new SharedArrayBuffer(8))
	const channel = new MessageChannel()
	const worker = new Worker(join(__dirname, 'sync-worker.js'), {
		workerData: { data: { ...data, options }, timeout, control, port: channel.port2 },
		transferList: [channel.port2],
		execArgv: [],
	})
	worker.on('error', () => {})

	const deadline = timeout === 0 ? Infinity : Date.now() + timeout
	let heartbeat = 0
	let aliveAt = Date.now()

	try {
		while (Atomics.load(control, 0) === 0) {
			if (Date.now() >= deadline) {
				throw new DOMException('Request timed out', 'TimeoutError')
			}

			Atomics.wait(control, 0, 0, Math.min(1000, Math.max(0, deadline - Date.now())))
			const current = Atomics.load(control, 1)

			if (current !== heartbeat) {
				heartbeat = current
				aliveAt = Date.now()
			}

			if (Date.now() - aliveAt > 30000) {
				throw new DOMException('Synchronous transport worker stopped responding', 'NetworkError')
			}
		}

		const packet = receiveMessageOnPort(channel.port1) as { message: SyncReply } | undefined

		if (!packet) {
			throw new DOMException('Synchronous transport worker returned no result', 'NetworkError')
		}

		if (!packet.message.ok) {
			throw new DOMException(packet.message.message, packet.message.name)
		}

		return packet.message.result
	} finally {
		channel.port1.close()
		void worker.terminate()
	}
}
