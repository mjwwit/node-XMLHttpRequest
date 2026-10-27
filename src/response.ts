import { decodeText } from './body.js'
import { responseHeaders } from './headers.js'
import { parseMime } from './mime.js'
import type { Options } from './options.js'
import type { ResponseHead } from './transport.js'

export class ResponseData {
	head: ResponseHead | null = null
	#chunks: Buffer[] = []
	#bytes: Buffer<ArrayBuffer> | undefined
	size = 0

	get bytes(): Buffer<ArrayBuffer> {
		return (this.#bytes ??= Buffer.concat(this.#chunks, this.size))
	}

	set bytes(bytes: Buffer<ArrayBuffer>) {
		this.#bytes = bytes
		this.#chunks = []
		this.size = bytes.length
	}

	append(bytes: Buffer): void {
		this.#chunks.push(bytes)
		this.#bytes = undefined
		this.size += bytes.length
	}

	mimeOverride = ''
	type: XMLHttpRequestResponseType = ''
	#cached: unknown = undefined
	#xml: Document | null | undefined

	constructor(readonly options: Options) {}

	get mime(): string {
		return (
			this.mimeOverride ||
			parseMime(this.head?.headers['content-type'] ?? '')?.toString() ||
			'text/xml'
		)
	}

	get encoding(): string {
		return (
			parseMime(this.mimeOverride)?.params.get('charset') ??
			parseMime(this.head?.headers['content-type'] ?? '')?.params.get('charset') ??
			'utf-8'
		)
	}

	get headers(): Record<string, string> {
		return responseHeaders(this.head?.headers ?? {})
	}

	reset(): void {
		this.head = null
		this.#chunks = []
		this.#bytes = undefined
		this.size = 0
		this.#cached = undefined
		this.#xml = undefined
	}

	text(state: number): string {
		if (this.type !== '' && this.type !== 'text') {
			throw new DOMException(
				'responseText is only available for text responses',
				'InvalidStateError',
			)
		}

		return state < 3 ? '' : decodeText(this.bytes, this.encoding, this.options, state === 4)
	}

	xml(state: number): Document | null {
		if (this.type !== '' && this.type !== 'document') {
			throw new DOMException(
				'responseXML is only available for document responses',
				'InvalidStateError',
			)
		}

		if (state !== 4 || this.head === null) {
			return null
		}

		if (this.mime.toLowerCase().startsWith('text/html') && this.type !== 'document') {
			return null
		}

		if (this.#xml !== undefined) {
			return this.#xml
		}

		if (!/(?:^|\/)(?:[^;\s]+\+)?xml(?:\s*;|$)|^text\/html(?:\s*;|$)/i.test(this.mime)) {
			return null
		}

		try {
			this.#xml =
				this.options.xmlParser?.(decodeText(this.bytes, this.encoding, this.options)) ?? null
		} catch {
			this.#xml = null
		}

		return this.#xml
	}

	value(state: number): unknown {
		if (this.type === '' || this.type === 'text') {
			return this.text(state)
		}

		if (state !== 4 || this.head === null) {
			return null
		}

		if (this.#cached !== undefined) {
			return this.#cached
		}

		switch (this.type) {
			case 'arraybuffer':
				this.#cached =
					this.bytes.byteOffset === 0 && this.bytes.byteLength === this.bytes.buffer.byteLength
						? this.bytes.buffer
						: new Uint8Array(this.bytes).buffer
				break

			case 'blob':
				this.#cached = new Blob([new Uint8Array(this.bytes)], {
					type: this.mime,
				})
				break

			case 'json':
				try {
					this.#cached = JSON.parse(new TextDecoder().decode(this.bytes)) as unknown
				} catch {
					this.#cached = null
				}
				break

			case 'document':
				this.#cached = this.xml(state)
				break
		}

		return this.#cached
	}
}
