import XMLHttpRequest = require('xmlhttprequest-ssl')
const constructor: typeof globalThis.XMLHttpRequest = XMLHttpRequest
const named: typeof globalThis.XMLHttpRequest = XMLHttpRequest.XMLHttpRequest
void constructor
void named
