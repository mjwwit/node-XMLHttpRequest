import { workerData, type MessagePort } from 'node:worker_threads'
import type { SyncReply } from './sync.js'
import type { RequestData } from './transport.js'

const { data, timeout, control, port } = workerData as {
	data: RequestData
	timeout: number
	control: Int32Array<SharedArrayBuffer>
	port: MessagePort
}

const heartbeat = setInterval(() => {
	Atomics.add(control, 1, 1)
}, 250)
let sent = false

const finish = (reply: SyncReply): void => {
	if (sent) {
		return
	}
	sent = true
	clearInterval(heartbeat)
	port.postMessage(reply)

	Atomics.store(control, 0, 1)
	Atomics.notify(control, 0)

	port.close()
}

process.on('uncaughtException', (error) =>
	finish({ ok: false, name: 'NetworkError', message: error.message }),
)
process.on('unhandledRejection', (error: unknown) =>
	finish({ ok: false, name: 'NetworkError', message: String(error) }),
)

void (async () => {
	const controller = new AbortController()
	const timer =
		timeout > 0 && timeout <= 2147483647
			? setTimeout(
					() => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
					timeout,
				)
			: undefined

	try {
		const { performRequest } = await import('./transport.js')
		finish({ ok: true, result: await performRequest(data, controller.signal) })
	} catch (error) {
		finish({
			ok: false,
			name: controller.signal.aborted ? 'TimeoutError' : 'NetworkError',
			message: error instanceof Error ? error.message : String(error),
		})
	} finally {
		clearTimeout(timer)
	}
})()
