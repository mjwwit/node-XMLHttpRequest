export class ProgressEvent<T extends EventTarget = EventTarget>
	extends Event
	implements globalThis.ProgressEvent<T>
{
	readonly lengthComputable: boolean
	readonly loaded: number
	readonly total: number
	declare readonly target: T | null

	constructor(type: string, init: ProgressEventInit = {}) {
		super(type)

		this.lengthComputable = init.lengthComputable ?? false
		this.loaded = init.loaded ?? 0
		this.total = init.total ?? 0
	}
}

type Handler =
	| ((this: globalThis.XMLHttpRequest, event: globalThis.ProgressEvent) => unknown)
	| null

/**
 * **`XMLHttpRequestEventTarget`** describes the event handlers shared by an XHR client and its upload target.
 *
 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequestEventTarget)
 */
export class RequestEventTarget<
	Map extends { [Key in keyof Map]: Event } = XMLHttpRequestEventTargetEventMap,
> extends EventTarget {
	override addEventListener<Key extends keyof Map>(
		type: Key,
		listener: ((this: globalThis.XMLHttpRequest, event: Map[Key]) => unknown) | null,
		options?: boolean | AddEventListenerOptions,
	): void
	override addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions,
	): void
	override addEventListener(
		type: string,
		listener: unknown,
		options?: boolean | AddEventListenerOptions,
	): void {
		super.addEventListener(type, listener as EventListenerOrEventListenerObject | null, options)
	}

	override removeEventListener<Key extends keyof Map>(
		type: Key,
		listener: ((this: globalThis.XMLHttpRequest, event: Map[Key]) => unknown) | null,
		options?: boolean | EventListenerOptions,
	): void
	override removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | EventListenerOptions,
	): void
	override removeEventListener(
		type: string,
		listener: unknown,
		options?: boolean | EventListenerOptions,
	): void {
		super.removeEventListener(type, listener as EventListenerOrEventListenerObject | null, options)
	}

	#handlers = new Map<
		string,
		Handler | ((this: globalThis.XMLHttpRequest, event: Event) => unknown)
	>()
	#listeners = new Map<string, EventListener>()

	/**
	 * Handles cancellation of an asynchronous request or upload.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequestEventTarget/abort_event)
	 */
	get onabort(): Handler {
		return this.getHandler('abort') as Handler
	}

	set onabort(handler: Handler) {
		this.setHandler('abort', handler)
	}

	/**
	 * Handles failure of an asynchronous request or upload. Synchronous failures throw instead.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequestEventTarget/error_event)
	 */
	get onerror(): Handler {
		return this.getHandler('error') as Handler
	}

	set onerror(handler: Handler) {
		this.setHandler('error', handler)
	}

	/**
	 * Handles successful completion of a request or upload.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequestEventTarget/load_event)
	 */
	get onload(): Handler {
		return this.getHandler('load') as Handler
	}

	set onload(handler: Handler) {
		this.setHandler('load', handler)
	}

	/**
	 * Handles completion after success, failure or cancellation. Synchronous failures do not fire this event.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequestEventTarget/loadend_event)
	 */
	get onloadend(): Handler {
		return this.getHandler('loadend') as Handler
	}

	set onloadend(handler: Handler) {
		this.setHandler('loadend', handler)
	}

	/**
	 * Handles the start of an asynchronous request or upload.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequestEventTarget/loadstart_event)
	 */
	get onloadstart(): Handler {
		return this.getHandler('loadstart') as Handler
	}

	set onloadstart(handler: Handler) {
		this.setHandler('loadstart', handler)
	}

	/**
	 * Handles download or upload progress for asynchronous requests.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequestEventTarget/progress_event)
	 */
	get onprogress(): Handler {
		return this.getHandler('progress') as Handler
	}

	set onprogress(handler: Handler) {
		this.setHandler('progress', handler)
	}

	/**
	 * Handles an asynchronous request or upload timeout. Synchronous timeouts throw `TimeoutError` instead.
	 *
	 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/XMLHttpRequestEventTarget/timeout_event)
	 */
	get ontimeout(): Handler {
		return this.getHandler('timeout') as Handler
	}

	set ontimeout(handler: Handler) {
		this.setHandler('timeout', handler)
	}

	protected getHandler(
		type: string,
	): Handler | ((this: globalThis.XMLHttpRequest, event: Event) => unknown) | null {
		return this.#handlers.get(type) ?? null
	}

	protected setHandler(
		type: string,
		handler: Handler | ((this: globalThis.XMLHttpRequest, event: Event) => unknown),
	): void {
		if (typeof handler !== 'function') {
			const listener = this.#listeners.get(type)

			if (listener) {
				this.removeEventListener(type, listener)
			}

			this.#listeners.delete(type)
			this.#handlers.delete(type)
			return
		}

		this.#handlers.set(type, handler)
		if (this.#listeners.has(type)) {
			return
		}

		const listener: EventListener = (event) => {
			const current = this.#handlers.get(type)

			if (current) {
				Reflect.apply(current, this, [event])
			}
		}

		this.#listeners.set(type, listener)
		this.addEventListener(type, listener)
	}

	emit(type: string, loaded = 0, total = 0): void {
		this.dispatchEvent(new ProgressEvent(type, { loaded, total, lengthComputable: total > 0 }))
	}
}
