import { parentPort, workerData } from 'node:worker_threads'
import { XMLHttpRequest } from '../../dist/xhr.js'

const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
const events: string[] = []
let errorName: string | undefined

xhr.open('GET', workerData as string, false)
for (const type of ['error', 'load', 'loadend']) {
	xhr.addEventListener(type, () => events.push(type))
}

try {
	xhr.send()
} catch (error) {
	errorName = error instanceof Error ? error.name : String(error)
}

parentPort?.postMessage({
	error: errorName,
	readyState: xhr.readyState,
	status: xhr.status,
	statusText: xhr.statusText,
	responseText: xhr.responseText,
	events,
})
