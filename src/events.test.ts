import { expect, it } from 'vitest'
import { ProgressEvent, RequestEventTarget } from './events.js'

it('dispatches real events with target and progress fields', () => {
	const target = new RequestEventTarget()
	let seen: Event | undefined
	target.addEventListener('progress', (event) => {
		seen = event
	})

	target.emit('progress', 2, 4)

	expect(seen).toBeInstanceOf(Event)
	expect(seen).toMatchObject({
		target,
		type: 'progress',
		loaded: 2,
		total: 4,
		lengthComputable: true,
	})
})

it('preserves handler registration order, replacement and removal', () => {
	const target = new RequestEventTarget()
	const order: number[] = []
	target.onload = () => order.push(1)
	const listener = () => order.push(2)
	target.addEventListener('load', listener)
	target.addEventListener('load', listener)
	target.onload = () => order.push(3)

	target.emit('load')

	expect(order).toEqual([3, 2])

	target.onload = null
	target.removeEventListener('load', listener)

	target.emit('load')

	expect(order).toEqual([3, 2])
	expect(target.dispatchEvent(new ProgressEvent('load'))).toBe(true)
})
