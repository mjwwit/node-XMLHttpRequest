import { prepareBody } from './body.js'
/**
 * API documentation adapted from TypeScript 7.0.2's lib.dom.d.ts.
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Documentation licensed under Apache-2.0; see licenses/TypeScript.txt.
 * Modified to describe this implementation's Node-specific APIs and behavior.
 */
import { RequestEventTarget } from './events.js'
import { forbiddenHeader, validateHeader } from './headers.js'
import { parseMime } from './mime.js'
import { normalizeOptions, type Options } from './options.js'
import { ResponseData } from './response.js'
import { performSync } from './sync.js'
import { performRequest, type RequestData, type Result } from './transport.js'

/**
 * **`XMLHttpRequest`** (XHR) objects are used to interact with servers and retrieve data from a URL.
 *
 * This Node implementation supports HTTP, HTTPS, file and data URLs. It does not enforce browser CORS rules or store cookies automatically. Constructor options customize TLS, synchronous request policy, DOM parsing and text decoding.
 *
 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest)
 */
export class XMLHttpRequest extends RequestEventTarget<XMLHttpRequestEventMap> {
	/** The client has been created, but `open()` has not been called. */
	static readonly UNSENT = 0

	/** `open()` has been called; request headers can be set before `send()`. */
	static readonly OPENED = 1

	/** Response status and headers are available. */
	static readonly HEADERS_RECEIVED = 2

	/** The response body is being received. */
	static readonly LOADING = 3

	/** The request has completed, successfully or unsuccessfully. */
	static readonly DONE = 4

	/** Alias for the constructor, preserving the named CommonJS export. */
	static readonly XMLHttpRequest = XMLHttpRequest

	/** The client has been created, but `open()` has not been called. */
	get UNSENT(): 0 {
		return 0
	}

	/** `open()` has been called; request headers can be set before `send()`. */
	get OPENED(): 1 {
		return 1
	}

	/** Response status and headers are available. */
	get HEADERS_RECEIVED(): 2 {
		return 2
	}

	/** The response body is being received. */
	get LOADING(): 3 {
		return 3
	}

	/** The request has completed, successfully or unsuccessfully. */
	get DONE(): 4 {
		return 4
	}

	/**
	 * Handles changes to `readyState`. During synchronous `send()`, only the DONE transition is notified.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/readystatechange_event)
	 */
	get onreadystatechange(): ((this: globalThis.XMLHttpRequest, event: Event) => unknown) | null {
		return this.getHandler('readystatechange') as
			| ((this: globalThis.XMLHttpRequest, event: Event) => unknown)
			| null
	}

	set onreadystatechange(
		handler: ((this: globalThis.XMLHttpRequest, event: Event) => unknown) | null,
	) {
		this.setHandler('readystatechange', handler)
	}

	readonly #upload = new RequestEventTarget()

	/**
	 * The XMLHttpRequest **`upload`** property returns an event target that can be observed to monitor an upload's progress.
	 *
	 * Upload progress events are available for asynchronous requests. Synchronous requests do not dispatch upload progress events.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/upload)
	 */
	get upload(): RequestEventTarget {
		return this.#upload
	}

	readonly #options: Options
	readonly #response: ResponseData
	#state = 0
	#async = true
	#sending = false
	#method = 'GET'
	#url = ''
	#headers: Record<string, string> = Object.create(null) as Record<string, string>
	#controller: AbortController | undefined
	#timer: ReturnType<typeof setTimeout> | undefined
	#timeout = 0
	#startedAt = 0
	#credentials = false
	#generation = 0
	#uploadComplete = true

	/** Creates an XHR client with optional Node-specific transport, parsing and decoding options. */
	constructor(options: Options = {}) {
		super()

		this.#options = normalizeOptions(options)
		this.#response = new ResponseData(this.#options)
	}

	/**
	 * The **`XMLHttpRequest.readyState`** property returns the state an XMLHttpRequest client is in. An XHR client exists in one of five states.
	 *
	 * States are UNSENT (0), OPENED (1), HEADERS_RECEIVED (2), LOADING (3), and DONE (4).
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/readyState)
	 */
	get readyState(): number {
		return this.#state
	}

	/**
	 * The XMLHttpRequest **`response`** property returns the response's body content as an ArrayBuffer, a Blob, a Document, a JavaScript Object, or a string, depending on the value of the request's responseType property.
	 *
	 * Returns `unknown` for type safety; narrow it according to `responseType`. Document responses require the `xmlParser` constructor option.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/response)
	 */
	get response(): unknown {
		return this.#response.value(this.#state)
	}

	/**
	 * The read-only XMLHttpRequest property **`responseText`** returns the text received from a server following a request being sent.
	 *
	 * Only available when `responseType` is empty or `"text"`; otherwise throws `InvalidStateError`. The `textDecoder` option customizes decoding.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/responseText)
	 */
	get responseText(): string {
		return this.#response.text(this.#state)
	}

	/**
	 * The **`XMLHttpRequest.responseXML`** read-only property returns a Document containing the HTML or XML retrieved by the request; or null if the request was unsuccessful, has not yet been sent, or if the data can't be parsed as XML or HTML.
	 *
	 * Node has no built-in DOM parser. Uses the `xmlParser` option and returns `null` when no parser is supplied. HTML parsing requires `responseType = "document"`.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/responseXML)
	 */
	get responseXML(): Document | null {
		return this.#response.xml(this.#state)
	}

	/**
	 * The read-only **`XMLHttpRequest.responseURL`** property returns the serialized URL of the response or the empty string if the URL is null. If the URL is returned, any URL fragment present in the URL will be stripped away. The value of responseURL will be the final URL obtained after any redirects.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/responseURL)
	 */
	get responseURL(): string {
		return this.#response.head?.url ?? ''
	}

	/**
	 * The read-only **`XMLHttpRequest.status`** property returns the numerical HTTP status code of the XMLHttpRequest's response.
	 *
	 * Returns 0 before a response is available and after a network error.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/status)
	 */
	get status(): number {
		return this.#response.head?.status ?? 0
	}

	/**
	 * The read-only **`XMLHttpRequest.statusText`** property returns a string containing the response's status message as returned by the HTTP server. Unlike XMLHttpRequest.status which indicates a numerical status code, this property contains the text of the response status, such as "OK" or "Not Found". If the request's readyState is in UNSENT or OPENED state, the value of statusText will be an empty string.
	 *
	 * Network errors also return an empty string; diagnostic errors are not exposed through this property.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/statusText)
	 */
	get statusText(): string {
		return this.#response.head?.statusText ?? ''
	}

	/**
	 * The XMLHttpRequest property **`responseType`** is an enumerated string value specifying the type of data contained in the response.
	 *
	 * Node supports binary and JSON responses for synchronous requests. The `"document"` value is a Node extension that requires `xmlParser`. Preserved when `open()` is called again.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/responseType)
	 */
	get responseType(): XMLHttpRequestResponseType {
		return this.#response.type
	}

	set responseType(type: XMLHttpRequestResponseType) {
		if (this.#state === 3 || this.#state === 4) {
			throw invalidState()
		}
		if (!['', 'text', 'json', 'arraybuffer', 'blob', 'document'].includes(type)) {
			throw new TypeError('Invalid XMLHttpRequest responseType')
		}

		this.#response.type = type
	}

	/**
	 * The **`XMLHttpRequest.timeout`** property is an unsigned long representing the number of milliseconds a request can take before automatically being terminated. The default value is 0, which means there is no timeout.
	 *
	 * Node allows timeouts for synchronous requests. An asynchronous timeout fires a `timeout` event; a synchronous timeout throws `TimeoutError` without firing failure events. Worker health monitoring is independent of this request timeout.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/timeout)
	 */
	get timeout(): number {
		return this.#timeout
	}

	set timeout(value: number) {
		this.#timeout = Number(value) >>> 0
		this.#scheduleTimeout()
	}

	/**
	 * The **`XMLHttpRequest.withCredentials`** property stores whether credentials should be included with cross-site requests.
	 *
	 * In this Node implementation, the value has no transport effect: CORS is not enforced and there is no automatic cookie jar. Explicit authentication headers and TLS options are configured separately. Setting this property after sending or after receiving headers throws `InvalidStateError`.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/withCredentials)
	 */
	get withCredentials(): boolean {
		return this.#credentials
	}

	set withCredentials(value: boolean) {
		if (this.#state > 1 || this.#sending) {
			throw invalidState()
		}

		this.#credentials = Boolean(value)
	}

	/**
	 * The XMLHttpRequest method **`open()`** initializes a newly-created request, or re-initializes an existing one.
	 *
	 * Relative URLs resolve against the `origin` constructor option. Omitting `async` enables asynchronous requests. Passing `false` selects a synchronous `send()` that blocks the calling event loop; `syncPolicy` controls whether synchronous requests are allowed or warned about.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/open)
	 */
	open(method: string, url: string | URL): void

	/**
	 * The XMLHttpRequest method **`open()`** initializes a newly-created request, or re-initializes an existing one.
	 *
	 * Relative URLs resolve against the `origin` constructor option. Omitting `async` enables asynchronous requests. Passing `false` selects a synchronous `send()` that blocks the calling event loop; `syncPolicy` controls whether synchronous requests are allowed or warned about.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/open)
	 */
	open(
		method: string,
		url: string | URL,
		async: boolean,
		username?: string | null,
		password?: string | null,
	): void
	open(
		method: string,
		url: string | URL,
		async = true,
		username?: string | null,
		password?: string | null,
	): void {
		if (arguments.length < 2) {
			throw new TypeError('open requires method and URL')
		}

		method = String(method)
		if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(method)) {
			throw new DOMException('Invalid HTTP method', 'SyntaxError')
		}
		if (/^(CONNECT|TRACE|TRACK)$/i.test(method)) {
			throw new DOMException('Forbidden HTTP method', 'SecurityError')
		}
		if (/^(DELETE|GET|HEAD|OPTIONS|POST|PUT)$/i.test(method)) {
			method = method.toUpperCase()
		}

		let parsed: URL
		try {
			parsed = new URL(String(url), this.#options.origin)
		} catch {
			throw new DOMException('Invalid URL', 'SyntaxError')
		}
		if (username != null) {
			parsed.username = username
		}
		if (password != null) {
			parsed.password = password
		}

		this.#cancel()
		this.#generation++
		this.#method = method
		this.#url = parsed.href
		this.#async = arguments.length < 3 ? true : Boolean(async)
		this.#headers = Object.create(null) as Record<string, string>
		this.#response.reset()
		this.#sending = false

		if (!this.#async && this.#options.syncPolicy === 'warn') {
			console.warn(
				"[Deprecation] Synchronous XMLHttpRequest is deprecated because of its detrimental effects to the end user's experience. For more information, see https://xhr.spec.whatwg.org/#sync-flag",
			)
		}
		if (this.#state !== 1) {
			this.#state = 1
			this.dispatchEvent(new Event('readystatechange'))
		}
	}

	/**
	 * The XMLHttpRequest method **`setRequestHeader()`** sets the value of an HTTP request header. When using setRequestHeader(), you must call it after calling open(), but before calling send(). If this method is called several times with the same header, the values are merged into one single request header.
	 *
	 * Forbidden request headers are ignored unless `disableHeaderCheck` is enabled. Returns `undefined` in either case.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/setRequestHeader)
	 */
	setRequestHeader(name: string, value: string): void {
		if (arguments.length < 2) {
			throw new TypeError('setRequestHeader requires name and value')
		}
		if (this.#state !== 1 || this.#sending) {
			throw invalidState()
		}

		name = String(name)
		value = String(value).replace(/^[\t ]+|[\t ]+$/g, '')
		validateHeader(name, value)
		name = name.toLowerCase()
		if (!this.#options.disableHeaderCheck && forbiddenHeader(name, value)) {
			return
		}

		this.#headers[name] = this.#headers[name] ? `${this.#headers[name]}, ${value}` : value
	}

	/**
	 * Returns a stored request header by its case-insensitive name, or `null` when absent.
	 *
	 * @deprecated Non-standard Node extension; track request headers in application code instead.
	 */
	getRequestHeader(name: string): string | null {
		return this.#headers[String(name).toLowerCase()] ?? null
	}

	/**
	 * The XMLHttpRequest method **`getResponseHeader()`** returns the string containing the text of a particular header's value.
	 *
	 * Header names are case-insensitive. Returns `null` when unavailable; `Set-Cookie` and `Set-Cookie2` are hidden.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/getResponseHeader)
	 */
	getResponseHeader(name: string): string | null {
		if (arguments.length === 0) {
			throw new TypeError('getResponseHeader requires a name')
		}

		return this.#state < 2 ? null : (this.#response.headers[String(name).toLowerCase()] ?? null)
	}

	/**
	 * The XMLHttpRequest method **`getAllResponseHeaders()`** returns all the response headers, separated by CRLF, as a string, or an empty string if no response is available.
	 *
	 * Headers are sorted case-insensitively and every line ends in CRLF. `Set-Cookie` and `Set-Cookie2` are hidden.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/getAllResponseHeaders)
	 */
	getAllResponseHeaders(): string {
		if (this.#state < 2) {
			return ''
		}

		return Object.entries(this.#response.headers)
			.sort(([a], [b]) =>
				a.toUpperCase() < b.toUpperCase() ? -1 : a.toUpperCase() > b.toUpperCase() ? 1 : 0,
			)
			.map(([name, value]) => `${name}: ${value}\r\n`)
			.join('')
	}

	/**
	 * The XMLHttpRequest method **`overrideMimeType()`** specifies a MIME type other than the one provided by the server to be used instead when interpreting the data being transferred in a request.
	 *
	 * Call before the LOADING or DONE state. Invalid MIME types use `application/octet-stream`.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/overrideMimeType)
	 */
	overrideMimeType(mime: string): void {
		if (arguments.length === 0) {
			throw new TypeError('overrideMimeType requires a MIME type')
		}
		if (this.#state >= 3) {
			throw invalidState()
		}

		this.#response.mimeOverride = parseMime(String(mime))?.toString() ?? 'application/octet-stream'
	}

	/**
	 * The XMLHttpRequest method **`send()`** sends the request to the server.
	 *
	 * GET and HEAD ignore the body. Sending a Document requires `documentSerializer`. Synchronous requests reject custom Agent instances and throw `NetworkError` or `TimeoutError` on failure without dispatching failure events.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/send)
	 */
	send(body?: Document | XMLHttpRequestBodyInit | null): void {
		if (this.#state !== 1 || this.#sending) {
			throw invalidState()
		}
		if (!this.#async && this.#options.syncPolicy === 'disabled') {
			throw new Error('Synchronous requests are disabled for this instance.')
		}

		const prepared = prepareBody(
			['GET', 'HEAD'].includes(this.#method) ? null : body,
			this.#options,
		)
		const data: RequestData = {
			url: this.#url,
			method: this.#method,
			headers: { ...this.#headers },
			body: prepared,
			options: this.#options,
		}
		this.#sending = true

		if (!this.#async) {
			try {
				this.#complete(performSync(data, this.#timeout))
			} catch (error) {
				this.#response.reset()
				this.#state = 4
				this.#sending = false
				throw error
			}
			return
		}

		const generation = this.#generation
		const active = () => generation === this.#generation && this.#sending
		const controller = new AbortController()

		this.#controller = controller
		this.#startedAt = Date.now()
		this.#uploadComplete = prepared === null
		this.emit('loadstart')

		if (!active()) {
			return
		}
		if (!this.#uploadComplete) {
			this.upload.emit('loadstart')
		}
		if (!active()) {
			return
		}

		this.#scheduleTimeout()

		void performRequest(data, controller.signal, {
			headers: (head) => {
				if (!active()) {
					return
				}

				this.#response.head = head
				this.#state = 2
				this.dispatchEvent(new Event('readystatechange'))
			},
			chunk: (bytes) => {
				if (!active()) {
					return
				}

				this.#response.append(bytes)
				this.#state = 3
				this.dispatchEvent(new Event('readystatechange'))
				if (active()) {
					this.emit('progress', this.#response.size, this.#total())
				}
			},
			upload: (loaded, total) => {
				if (!active() || this.#uploadComplete) {
					return
				}

				this.upload.emit('progress', loaded, total)
				if (!active()) {
					return
				}

				this.#uploadComplete = true
				this.upload.emit('load', loaded, total)
				if (active()) {
					this.upload.emit('loadend', loaded, total)
				}
			},
		}).then(
			(result) => {
				if (active()) {
					this.#complete(result)
				}
			},
			() => {
				if (active()) {
					this.#fail('error')
				}
			},
		)
	}

	/**
	 * The **`XMLHttpRequest.abort()`** method aborts the request if it has already been sent. When a request is aborted, its readyState is changed to XMLHttpRequest.UNSENT (0) and the request's status code is set to 0.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/abort)
	 */
	abort(): void {
		const inflight = this.#sending && this.#async

		this.#cancel()
		this.#generation++

		if (inflight) {
			this.#fail('abort')
		}
		if (this.#state === 4) {
			this.#state = 0
			this.#response.reset()
		}
	}

	#complete(result: Result): void {
		const generation = this.#generation

		this.#response.head = result
		this.#response.bytes = Buffer.from(
			result.bytes.buffer,
			result.bytes.byteOffset,
			result.bytes.byteLength,
		)

		const loaded = result.bytes.byteLength
		const total = this.#total()
		if (this.#async) {
			this.emit('progress', loaded, total)
		}
		if (generation !== this.#generation || !this.#sending) {
			return
		}

		this.#state = 4
		this.#sending = false
		this.#cancel()
		this.dispatchEvent(new Event('readystatechange'))
		if (generation !== this.#generation || this.#state !== 4) {
			return
		}

		this.emit('load', loaded, total)
		if (generation === this.#generation && this.#state === 4) {
			this.emit('loadend', loaded, total)
		}
	}

	#fail(type: 'error' | 'abort' | 'timeout'): void {
		const generation = this.#generation

		this.#cancel()
		this.#sending = false
		this.#response.reset()
		this.#state = 4
		this.dispatchEvent(new Event('readystatechange'))
		if (generation !== this.#generation) {
			return
		}
		if (!this.#uploadComplete) {
			this.#uploadComplete = true
			this.upload.emit(type)
			if (generation !== this.#generation) {
				return
			}
			this.upload.emit('loadend')
		}
		if (generation !== this.#generation) {
			return
		}

		this.emit(type)
		if (generation === this.#generation) {
			this.emit('loadend')
		}
	}

	#total(): number {
		return Number(this.#response.head?.headers['content-length']) || 0
	}

	#cancel(): void {
		clearTimeout(this.#timer)
		this.#timer = undefined
		this.#controller?.abort()
		this.#controller = undefined
	}

	#scheduleTimeout(): void {
		clearTimeout(this.#timer)
		if (!this.#sending || !this.#async || this.#timeout === 0) {
			return
		}

		const remaining = Math.max(0, this.#timeout - (Date.now() - this.#startedAt))
		this.#timer = setTimeout(
			() => {
				if (Date.now() - this.#startedAt >= this.#timeout) {
					this.#fail('timeout')
				} else {
					this.#scheduleTimeout()
				}
			},
			Math.min(remaining, 2147483647),
		)
		if (this.#options.autoUnref) {
			this.#timer.unref()
		}
	}
}

const invalidState = (): DOMException => {
	return new DOMException('Invalid XMLHttpRequest state', 'InvalidStateError')
}

for (const name of ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE'] as const) {
	Object.defineProperty(XMLHttpRequest, name, { writable: false, configurable: false })
}
