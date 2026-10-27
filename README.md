# xmlhttprequest-ssl

A dependency-free XMLHttpRequest implementation for Node.js 24+, written in strict TypeScript. Supports HTTP, HTTPS, file and data URLs, asynchronous and synchronous requests, and CommonJS and ESM from one shared implementation.

```ts
import { XMLHttpRequest } from 'xmlhttprequest-ssl'

const xhr = new XMLHttpRequest()
xhr.open('GET', 'https://example.com')
xhr.onload = () => console.log(xhr.status, xhr.responseText)
xhr.onerror = () => console.error('Network error')
xhr.send()
```

Both existing CommonJS forms remain supported:

```js
const XMLHttpRequest = require('xmlhttprequest-ssl')
const { XMLHttpRequest: NamedXMLHttpRequest } = require('xmlhttprequest-ssl')
```

Default and named ESM exports and both CommonJS forms use the same constructor. The CommonJS entry point is `dist/index.js`. Published JavaScript requires no TypeScript loader. Declarations use TypeScript's DOM interfaces; TypeScript consumers should include `DOM` and `DOM.Iterable` in `compilerOptions.lib` and install `@types/node` for Node-specific options.

## API

The public API has the DOM XMLHttpRequest shape: ready-state constants, `open`, `send`, `abort`, header accessors, `overrideMimeType`, `timeout`, `withCredentials`, `upload`, event listeners and event handler properties. Response types are `""`, `text`, `json`, `arraybuffer`, `blob` and `document`. Events are real `Event`/progress-event objects with `target`, `loaded`, `total` and `lengthComputable` where applicable.

Request bodies include strings, `URLSearchParams`, `ArrayBuffer`, array-buffer views (including Buffer), Blob, FormData and caller-serialized Document objects. GET and HEAD ignore bodies. Redirects follow HTTP method/body rules and remove sensitive headers when crossing origins. Response cookie headers are hidden.

This is a server-side API: CORS is not enforced, there is no automatic cookie jar, and `withCredentials` validates and stores its value without adding browser credential storage. `origin` is a URL base, not a browser security boundary. HTML/XML DOM parsing and Document serialization require caller-supplied hooks.

## Synchronous requests

```ts
const xhr = new XMLHttpRequest({ syncPolicy: 'enabled' })
xhr.open('GET', 'https://example.com', false)
xhr.timeout = 5000
xhr.send()
console.log(xhr.responseText)
```

A Node worker executes the same transport as asynchronous requests. The caller sleeps using `Atomics.wait`; a message port carries the result and shared memory wakes the caller. No temporary files, generated JavaScript or busy-spinning are used.

Synchronous calls block the calling event loop. A server on that same event loop cannot answer the request. Use another process or worker for local servers. `timeout = 0` imposes no network deadline; positive values throw `TimeoutError` when exceeded. Worker heartbeat monitoring separately fails with `NetworkError` after 30 seconds without worker activity, including startup failure. This is infrastructure failure detection, not a default request timeout.

Node uses worker-style XHR rules, including on its main thread: synchronous timeout and binary/JSON responses are supported. `document` responses are an explicit Node extension using the parser hook. Network failures throw `NetworkError`; synchronous failures emit no error/timeout events. Custom Agent instances are rejected for synchronous requests because they cannot cross the worker boundary. Parser, decoder and serializer hooks execute on the calling thread.

## Node options

Pass options to the constructor. Options are also available as the ESM `Options` type.

| Option                                              | Default       | Behavior                                                        |
| --------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| `pfx`, `key`, `passphrase`, `cert`, `ca`, `ciphers` | unset         | Node HTTPS/TLS request options                                  |
| `rejectUnauthorized`                                | `true`        | Verify TLS certificates                                         |
| `agent`                                             | disabled      | Node HTTP/HTTPS Agent; asynchronous requests only               |
| `autoUnref`                                         | `false`       | Unref request sockets and timeout timers                        |
| `allowFileSystemResources`                          | `true`        | Allow `file:` reads; GET only                                   |
| `maxRedirects`                                      | `20`          | Maximum followed redirects                                      |
| `origin`                                            | unset         | Base URL for relative URLs                                      |
| `syncPolicy`                                        | `"warn"`      | `"warn"`, `"enabled"` or `"disabled"`                           |
| `disableHeaderCheck`                                | `false`       | Allow otherwise forbidden request headers                       |
| `xmlParser`                                         | unset         | `(text: string) => Document \| null`; parse XML/HTML responses  |
| `documentSerializer`                                | unset         | `(document: Document) => string`; required for `send(Document)` |
| `textDecoder`                                       | `TextDecoder` | `(buffer: Buffer, encoding: string) => string`                  |

Without a parser, `responseXML`/document responses return `null`. Sending a Document without a serializer throws `TypeError`. Deprecated `getRequestHeader(name)` remains available as a Node extension.

## Development

Use Node 24+ and pnpm 12 (exact version pinned in `package.json`).

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:package
```

Run the TypeScript example directly with Node after building the package:

```sh
pnpm build
node example/demo.mts
```

Pass a URL as the first argument to try another endpoint, for example `node example/demo.mts 'data:,Hello%20World'`.

`pnpm format` applies Oxfmt formatting. Oxlint includes type-aware rules. TypeScript 7 checks production code, the example, colocated tests, DOM assignability and both package export styles. `pnpm check` runs all gates.

`pnpm test:package` runs `scripts/package.mts` directly with Node. It uses `pnpm pack` (including the `prepack` build), then runs and typechecks the fixtures from `scripts/fixtures/package` against the extracted package in a temporary consumer directory.

`src/xhr.ts` owns the API and state transitions. Separate modules own events, headers, body conversion, response decoding, options, HTTP/resource transport and the synchronous worker bridge. Colocated Vitest tests include the coverage migrated from all 25 original compatibility test files, including the 400 MB transfer regression and its five-second download gate. Shared HTTP/TLS fixtures live in `src/test-support` and are excluded from production builds. Selected Web Platform Tests are adapted with provenance and license in [src/wpt.test.md](src/wpt.test.md). This is not a claim of complete WPT conformance.

CI runs runtime tests on Linux, macOS and Windows with Node 24 and 26; static checks and packed-package checks run once on Linux.

## Migrating from 4.x

This is a major release. Node versions below 24 are no longer supported. Standards behavior takes precedence over historical quirks:

- The `lib/XMLHttpRequest` deep import has been removed. Import from `xmlhttprequest-ssl` instead.
- Network errors expose status `0` and empty `statusText`. Synchronous errors throw DOMException and do not dispatch failure events.
- Forbidden `setRequestHeader` calls return `undefined` and ignore the header. Response headers are sorted and each line ends in CRLF.
- `responseText` throws `InvalidStateError` for non-text response types. `open()` preserves `responseType`; reset it explicitly when reusing an instance for text responses.
- Invalid/unknown text encodings fall back to UTF-8. Data URLs follow standard parsing: `;base64` must be the final metadata token.
- Event dispatch is synchronous when the algorithm fires the event; duplicate listeners are deduplicated. State/event callbacks may reopen or abort requests without allowing stale results to overwrite the new request.
- Custom synchronous agents now fail explicitly instead of being silently ignored.

Compatibility coverage now lives beside the source modules, with assertions updated for these intentional spec changes. File URL tests generate temporary fixtures and use `pathToFileURL` for Windows support; text and binary resources exercise both synchronous and asynchronous requests.

## License

MIT. A TypeScript rewrite of [node-XMLHttpRequest](https://github.com/driverdan/node-XMLHttpRequest), originally developed by driverdan, with SSL support from [rase-](https://github.com/rase-/node-XMLHttpRequest). Earlier compatibility tests informed the current test suite. Adapted Web Platform Tests retain their separate BSD 3-Clause notice.
