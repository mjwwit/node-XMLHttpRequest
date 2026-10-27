import XMLHttpRequest, { XMLHttpRequest as Named, type Options } from 'xmlhttprequest-ssl'
const options: Options = { syncPolicy: 'enabled' }
const xhr: globalThis.XMLHttpRequest = new XMLHttpRequest(options)
const other: typeof globalThis.XMLHttpRequest = Named
void xhr
void other
