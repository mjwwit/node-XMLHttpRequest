import XHR, { XMLHttpRequest, type Options } from 'xmlhttprequest-ssl'

const opts: Options = { syncPolicy: 'enabled' }
const xhr: globalThis.XMLHttpRequest = new XHR(opts)
const ctor: typeof globalThis.XMLHttpRequest = XMLHttpRequest

void xhr
void ctor
