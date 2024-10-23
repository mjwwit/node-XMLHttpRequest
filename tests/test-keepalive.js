var http = require('http');
var { XMLHttpRequest } = require("../lib/XMLHttpRequest");

var server = http.createServer({ keepAliveTimeout: 200 }, function handleConnection (req, res) {
  res.write('hello\n');
  res.end();
}).listen(8889);

var agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 2000,
});
var xhr = new XMLHttpRequest({ agent });
var url = "http://localhost:8889";

var repeats = 0;
var maxMessages = 20;
const interval = setInterval(function sendRequest() {
  xhr.open("GET", url);
  xhr.onloadend = function(event) {
    if (xhr.status !== 200) {
      console.error('Error: non-200 xhr response, message is\n', xhr.responseText);
      clearInterval(interval);
      server.close();
    }
    if (repeats++ > maxMessages) {
      console.log('Done.');
      clearInterval(interval);
      server.close();
    }
  }
  xhr.send();
}, 200);