import type { RequestOptions } from 'node:https'

/**
 * Node-specific XHR options. TLS fields use Node's HTTPS request option types.
 * Custom `agent` instances are supported only for asynchronous requests.
 * Parser, serializer and decoder hooks run on the calling thread, including for synchronous requests.
 */

export interface Options extends Pick<
	RequestOptions,
	'agent' | 'pfx' | 'key' | 'passphrase' | 'cert' | 'ca' | 'ciphers' | 'rejectUnauthorized'
> {
	/** Unrefs request sockets and timeout timers so they do not keep the process alive. Defaults to `false`. */
	autoUnref?: boolean

	/** Allows GET requests to read local `file:` URLs. Defaults to `true`. */
	allowFileSystemResources?: boolean

	/** Maximum number of HTTP redirects to follow. Defaults to `20`. */
	maxRedirects?: number

	/** Warns about, enables or disables synchronous requests. Defaults to `"warn"`. */
	syncPolicy?: 'warn' | 'enabled' | 'disabled'

	/** Allows otherwise forbidden request headers. Defaults to `false`. */
	disableHeaderCheck?: boolean

	/** Base URL for relative request URLs; does not establish a browser security origin. */
	origin?: string

	/** Parses XML/HTML response text into a Document. Without a parser, document responses return `null`. */
	xmlParser?: ((text: string) => Document | null) | null

	/** Serializes Document request bodies. Required when calling `send(Document)`. */
	documentSerializer?: (document: Document) => string

	/** Decodes response bytes using the selected charset. Defaults to `TextDecoder`, with UTF-8 fallback. */
	textDecoder?: ((buffer: Buffer, encoding: string) => string) | null
}

export const normalizeOptions = (options: Options): Options => {
	const result: Options = Object.assign(Object.create(null) as Options, {
		rejectUnauthorized: true,
		allowFileSystemResources: true,
		maxRedirects: 20,
		syncPolicy: 'warn' as const,
	})
	for (const key of optionKeys) {
		if (Object.hasOwn(options, key)) {
			Object.defineProperty(result, key, {
				value: options[key],
				writable: true,
				enumerable: true,
				configurable: true,
			})
		}
	}

	if (!['warn', 'enabled', 'disabled'].includes(result.syncPolicy ?? '')) {
		result.syncPolicy = 'warn'
	}

	if (typeof result.maxRedirects !== 'number' || Number.isNaN(result.maxRedirects)) {
		result.maxRedirects = 20
	}

	result.maxRedirects = Math.max(0, result.maxRedirects)
	return result
}

const optionKeys = [
	'agent',
	'pfx',
	'key',
	'passphrase',
	'cert',
	'ca',
	'ciphers',
	'rejectUnauthorized',
	'autoUnref',
	'allowFileSystemResources',
	'maxRedirects',
	'syncPolicy',
	'disableHeaderCheck',
	'origin',
	'xmlParser',
	'documentSerializer',
	'textDecoder',
] as const satisfies readonly (keyof Options)[]
