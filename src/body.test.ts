import { expect, it } from 'vitest'
import { decodeText } from './body.js'
import { ResponseData } from './response.js'

it.each([
	['UTF-8', 'efbbbfc3a9'],
	['UTF-16LE', 'fffee900'],
	['UTF-16BE', 'feff00e9'],
])('detects split %s BOMs while loading', (_encoding, hex) => {
	const response = new ResponseData({})
	response.mimeOverride = 'text/plain;charset=windows-1252'
	const bytes = Buffer.from(hex, 'hex')

	for (const byte of bytes) {
		response.append(Buffer.from([byte]))

		expect(response.text(3)).toBe(response.size === bytes.length ? 'é' : '')
	}

	expect(response.text(4)).toBe('é')
})

it.each(['ef', 'efbb', 'ff', 'fe'])('withholds incomplete BOM %s until final decoding', (hex) => {
	const bytes = Buffer.from(hex, 'hex')

	expect(decodeText(bytes, 'windows-1252', {}, false)).toBe('')
	expect(decodeText(bytes, 'windows-1252', {})).toBe(new TextDecoder('windows-1252').decode(bytes))
})

it('preserves BOM-like content after the initial BOM or ordinary text', () => {
	expect(decodeText(Buffer.from('efbbbfefbbbf41', 'hex'), 'windows-1252', {})).toBe('\uFEFFA')
	expect(decodeText(Buffer.from('41efbbbf', 'hex'), 'windows-1252', {})).toBe('Aï»¿')
	expect(decodeText(Buffer.from('ef41', 'hex'), 'windows-1252', {}, false)).toBe('ïA')
})
