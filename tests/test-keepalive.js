const http = require('node:http');

const useLocalXHR = true;
const XHRModule = useLocalXHR ? "../lib/XMLHttpRequest" : "xmlhttprequest-ssl";
const { XMLHttpRequest } = require(XHRModule);

const server = http.createServer({ keepAliveTimeout: 200 }, (req, res) => {
  res.write('hello\n');
  res.end();
}).listen(8889);

const agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 2000,
});
const xhr = new XMLHttpRequest({ agent });
const url = "http://localhost:8889";

var repeats = 0;
var maxMessages = 20;
const interval = setInterval(() => {
  xhr.open("GET", url);
  xhr.onloadend = function(event) {
    if (xhr.status !== 200) {
      console.error('Error: non-200 xhr response, message is\n', xhr.responseText);
      clearInterval(interval);
      server.close();
    }
    if (repeats++ > maxMessages) {
      console.log('Done.')
      clearInterval(interval);
      server.close();
    }
  }
  xhr.send();
}, 200);