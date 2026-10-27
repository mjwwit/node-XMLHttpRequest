import { expect, it } from 'vitest'
import { decodeText } from './body.js'
import { parseMime, utf8ContentType } from './mime.js'
import { ResponseData } from './response.js'

it('parses quoted MIME parameters and rewrites existing charset only', () => {
	expect(utf8ContentType('text/plain; charset="iso-8859-1"; x=ok')).toBe(
		'text/plain;charset=UTF-8;x=ok',
	)
	expect(utf8ContentType('text/plain')).toBe('text/plain')
	expect(utf8ContentType('invalid')).toBe('invalid')
	expect(parseMime('invalid')).toBeNull()
	expect(decodeText(Buffer.from([0xe9]), 'ISO-8859-1', {})).toBe('é')
})

it('incomplete UTF-8 is withheld while loading and replaced only at end', () => {
	const bytes = Buffer.from([0x61, 0xe2])

	expect(decodeText(bytes, 'utf-8', {}, false)).toBe('a')
	expect(decodeText(bytes, 'utf-8', {}, true)).toBe('a�')
})

it('HTML parsing requires document response type; XML default remains available', () => {
	const document = { nodeType: 9 } as Document
	const response = new ResponseData({ xmlParser: () => document })
	response.head = {
		url: 'data:,',
		status: 200,
		statusText: 'OK',
		headers: { 'content-type': 'text/html' },
	}
	response.bytes = Buffer.from('<html/>')

	expect(response.xml(4)).toBeNull()

	response.type = 'document'

	expect(response.xml(4)).toBe(document)
})
