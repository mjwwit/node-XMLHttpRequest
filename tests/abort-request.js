'use strict';

const http = require('http');
const XHR = require('../lib/XMLHttpRequest').XMLHttpRequest;

process.on('uncaughtException', (e) => { console.error('uncaught: ', e); process.exitCode = 1; });
process.on('unhandledRejection', (e) => { console.error('unhandled: ', e); process.exitCode = 2; });

const server = http.createServer((req, res) => {
  // never respond to requests - simulate slow server for the abort
});

server.listen(0, '127.0.0.1', () => {
  requestAndAbort();
});

function requestAndAbort() {
  const url = new URL(`http://127.0.0.1:${server.address().port}`);
  const xhr = new XHR();

  xhr.open('GET', url);
  xhr.send();

  setTimeout(() => {
    console.log('calling abort');
    try { 
      xhr.abort()
    }
    catch (e) {
      console.error('abort threw:', e);
      process.exitCode = 3;
    }
    console.log('aborted request')
    setTimeout(() => { 
      server.close();
      server.closeAllConnections?.();
      process.exit();
    }, 500);
    
  }, 200);
}