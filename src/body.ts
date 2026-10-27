import type { Options } from './options.js'

export interface FormEntries {
	entries: [string, string | Blob][]
}

export interface SerializedDocument {
	document: string
	contentType: string
}

export type Body = string | Uint8Array<ArrayBuffer> | Blob | FormEntries | SerializedDocument | null

export interface EncodedBody {
	bytes: Uint8Array<ArrayBuffer> | null
	contentType: string | null
	forceUTF8?: boolean
}

export const prepareBody = (
	body: Document | XMLHttpRequestBodyInit | null | undefined,
	options: Options,
): Body => {
	if (body == null) {
		return null
	}

	if (typeof body === 'string' || body instanceof Blob) {
		return body
	}

	if (body instanceof FormData) {
		return { entries: [...body.entries()] }
	}

	if (body instanceof URLSearchParams) {
		return new Blob([body.toString()], { type: 'application/x-www-form-urlencoded;charset=UTF-8' })
	}

	if (body instanceof ArrayBuffer) {
		return new Uint8Array(body.slice(0))
	}

	if (ArrayBuffer.isView(body)) {
		return new Uint8Array(new Uint8Array(body.buffer, body.byteOffset, body.byteLength))
	}

	if (typeof body === 'object' && 'nodeType' in body && body.nodeType === 9) {
		if (!options.documentSerializer) {
			throw new TypeError('send(Document) requires documentSerializer')
		}

		return {
			document: options.documentSerializer(body),
			contentType:
				body.contentType === 'text/html'
					? 'text/html;charset=UTF-8'
					: 'application/xml;charset=UTF-8',
		}
	}

	return String(body as unknown)
}

export const encodeBody = async (body: Body): Promise<EncodedBody> => {
	if (body === null) {
		return { bytes: null, contentType: null }
	}

	if (typeof body === 'string') {
		return {
			bytes: new TextEncoder().encode(body),
			contentType: 'text/plain;charset=UTF-8',
			forceUTF8: true,
		}
	}

	if (body instanceof Uint8Array) {
		return { bytes: body, contentType: null }
	}

	if (body instanceof Blob) {
		return { bytes: new Uint8Array(await body.arrayBuffer()), contentType: body.type || null }
	}

	if ('document' in body) {
		return {
			bytes: new TextEncoder().encode(body.document),
			contentType: body.contentType,
			forceUTF8: true,
		}
	}

	const form = new FormData()
	for (const [name, value] of body.entries) {
		form.append(name, value)
	}

	const response = new Response(form)

	return {
		bytes: new Uint8Array(await response.arrayBuffer()),
		contentType: response.headers.get('content-type'),
	}
}

export const decodeText = (
	bytes: Buffer,
	encoding: string,
	options: Options,
	final = true,
): string => {
	if (typeof options.textDecoder === 'function') {
		return options.textDecoder(bytes, encoding)
	}

	const detectedEncoding = sniffTextEncoding(bytes, encoding, final)
	if (detectedEncoding === null) {
		return ''
	}

	try {
		return new TextDecoder(detectedEncoding).decode(bytes, { stream: !final })
	} catch {
		return new TextDecoder().decode(bytes, { stream: !final })
	}
}

const sniffTextEncoding = (bytes: Buffer, fallback: string, final: boolean): string | null => {
	const first = bytes[0]
	const second = bytes[1]

	if (first === 0xef && second === 0xbb && bytes[2] === 0xbf) {
		return 'utf-8'
	}

	if (first === 0xff && second === 0xfe) {
		return 'utf-16le'
	}

	if (first === 0xfe && second === 0xff) {
		return 'utf-16be'
	}

	if (
		!final &&
		((bytes.length === 1 && (first === 0xef || first === 0xff || first === 0xfe)) ||
			(bytes.length === 2 && first === 0xef && second === 0xbb))
	) {
		return null
	}

	return fallback
}
