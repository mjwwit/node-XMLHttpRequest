var assert = require("assert")
  , XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest
  , xhr = new XMLHttpRequest()
  , http = require("http");

// Test server
var server = http.createServer(function (req, res) {
  if (req.url === '/redirectingResource') {
    res.writeHead(307, {'Location': 'http://localhost:8000/'});
    res.end();
    return;
  }

  assert.equal(req.method, 'POST');

  var body = "Hello World";
  res.writeHead(200, {
    "Content-Type": "text/plain",
    "Content-Length": Buffer.byteLength(body),
    "Date": "Thu, 30 Aug 2012 18:17:53 GMT",
    "Connection": "close"
  });
  res.write("Hello World");
  res.end();

  this.close();
}).listen(8000);

xhr.onreadystatechange = function() {
  if (this.readyState === 4) {
    // assert.equal(xhr.getRequestHeader('Location'), '');
    assert.equal(xhr.responseText, "Hello World");
    console.log("done");
  }
};

try {
  xhr.open("POST", "http://localhost:8000/redirectingResource");
  xhr.send();
} catch(e) {
  console.log("ERROR: Exception raised", e);
  throw e;
}
