import XMLHttpRequest = require('../src/index.js')
const xhr: globalThis.XMLHttpRequest = new XMLHttpRequest()
xhr.open('GET', new URL('https://example.com'))
xhr.send(new Uint8Array([1, 2]))
const constructor: typeof globalThis.XMLHttpRequest = XMLHttpRequest
void constructor

new XMLHttpRequest().addEventListener('progress', (event) => {
	const loaded: number = event.loaded
	void loaded
})
new XMLHttpRequest().upload.addEventListener('progress', (event) => {
	const total: number = event.total
	void total
})
// @ts-expect-error Invalid response type must not compile.
new XMLHttpRequest().responseType = 'buffer'
// @ts-expect-error Invalid option must not compile.
new XMLHttpRequest({ syncPolicy: 'maybe' })
