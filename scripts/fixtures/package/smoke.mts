import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import XHR, { XMLHttpRequest } from 'xmlhttprequest-ssl'

const require = createRequire(import.meta.url)

assert.equal(XHR, XMLHttpRequest)
assert.equal(require('xmlhttprequest-ssl'), XHR)
assert.equal(require('xmlhttprequest-ssl').XMLHttpRequest, XHR)
assert.equal(require('./node_modules/xmlhttprequest-ssl'), XHR)

const pkg = require('xmlhttprequest-ssl/package.json')

assert.deepEqual(pkg.dependencies, {})

for (const sync of [false, true]) {
	const xhr = new XHR({ syncPolicy: 'enabled' })
	xhr.open('GET', 'data:,packed', !sync)

	const done = sync
		? undefined
		: new Promise<void>((resolve) => {
				xhr.onloadend = () => resolve()
			})

	xhr.send()
	await done

	assert.equal(xhr.responseText, 'packed')
}
