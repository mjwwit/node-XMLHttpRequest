import { validateHeaderName, validateHeaderValue } from 'node:http'

export const validateHeader = (name: string, value: string): void => {
	try {
		validateHeaderName(name)
		validateHeaderValue(name, value)
	} catch {
		throw new DOMException('Invalid HTTP header', 'SyntaxError')
	}
}

const forbidden = new Set([
	'accept-charset',
	'accept-encoding',
	'access-control-request-headers',
	'access-control-request-method',
	'connection',
	'content-length',
	'content-transfer-encoding',
	'cookie',
	'cookie2',
	'date',
	'dnt',
	'expect',
	'host',
	'keep-alive',
	'origin',
	'permissions-policy',
	'referer',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'via',
])

export const forbiddenHeader = (name: string, value: string): boolean => {
	return (
		forbidden.has(name) ||
		name.startsWith('sec-') ||
		name.startsWith('proxy-') ||
		(['x-http-method', 'x-http-method-override', 'x-method-override'].includes(name) &&
			value.split(',').some((method) => /^(CONNECT|TRACE|TRACK)$/i.test(method.trim())))
	)
}

export const responseHeaders = (headers: Record<string, string>): Record<string, string> => {
	return Object.assign(
		Object.create(null) as Record<string, string>,
		Object.fromEntries(
			Object.entries(headers).filter(([name]) => !['set-cookie', 'set-cookie2'].includes(name)),
		),
	)
}
