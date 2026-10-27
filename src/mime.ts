import { MIMEType } from 'node:util'

export const parseMime = (value: string): MIMEType | null => {
	try {
		return new MIMEType(value)
	} catch {
		return null
	}
}

export const utf8ContentType = (value: string): string => {
	const mime = parseMime(value)

	if (!mime || !mime.params.has('charset')) {
		return value
	}

	mime.params.set('charset', 'UTF-8')
	return mime.toString()
}
