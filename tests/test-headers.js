var assert = require("assert")
  , XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest
  , xhr = new XMLHttpRequest()
  , http = require("http");

// Test server
var server = http.createServer(function (req, res) {
  switch (req.url) {
    case "/allow":
      // Test disabling header check
      assert.equal("http://github.com", req.headers["referer"]);
      console.log("No header check: PASSED");
      break;
    default:
      // Test setRequestHeader
      assert.equal("Foobar", req.headers["x-test"]);
      // Test non-conforming allowed header
      assert.equal("node-XMLHttpRequest-test", req.headers["user-agent"]);
      // Test case insensitive header was set
      assert.equal("text/plain", req.headers["content-type"]);
      // Test forbidden header
      assert.equal(null, req.headers["referer"]);
      console.log("Strict header check: PASSED");
  }

  var body = "Hello World";
  res.writeHead(200, {
    "Content-Type": "text/plain",
    "Content-Length": Buffer.byteLength(body),
    // Set cookie headers to see if they're correctly suppressed
    // Actual values don't matter
    "Set-Cookie": "foo=bar",
    "Set-Cookie2": "bar=baz",
    "Date": "Thu, 30 Aug 2012 18:17:53 GMT",
    "Connection": "close"
  });
  res.write("Hello World");
  res.end();

  this.close();
}).listen(8000);

xhr.onreadystatechange = function() {
  if (this.readyState == 4) {
    // Test getAllResponseHeaders()
    var headers = "content-type: text/plain\r\ncontent-length: 11\r\ndate: Thu, 30 Aug 2012 18:17:53 GMT\r\nconnection: close";
    assert.equal(headers, this.getAllResponseHeaders());

    // Test case insensitivity
    assert.equal('text/plain', this.getResponseHeader('Content-Type'));
    assert.equal('text/plain', this.getResponseHeader('Content-type'));
    assert.equal('text/plain', this.getResponseHeader('content-Type'));
    assert.equal('text/plain', this.getResponseHeader('content-type'));

    // Test aborted getAllResponseHeaders
    this.abort();
    assert.equal("", this.getAllResponseHeaders());
    assert.equal(null, this.getResponseHeader("Connection"));

    console.log("Response headers check: PASSED");
  }
};

assert.equal(null, xhr.getResponseHeader("Content-Type"));
try {
  xhr.open("POST", "http://localhost:8000/");
  var body = "Hello World";
  // Valid header
  xhr.setRequestHeader("X-Test", "Foobar");
  // Invalid header Content-Length
  xhr.setRequestHeader("Content-Length", Buffer.byteLength(body));
  // Invalid header Referer
  xhr.setRequestHeader("Referer", "http://github.com");
  // Allowed header outside of specs
  xhr.setRequestHeader("user-agent", "node-XMLHttpRequest-test");
  // Case insensitive header
  xhr.setRequestHeader("content-type", 'text/plain');
  xhr.send(body);
} catch(e) {
  console.error("ERROR: Exception raised", e);
  throw e;
}

try {
  // Test allowing all headers
  xhr = new XMLHttpRequest({ disableHeaderCheck: true });
  xhr.open("POST", "http://localhost:8000/allow");
  xhr.setRequestHeader("Referer", "http://github.com");
  xhr.send();
}
catch (e) {
  console.error("ERROR: Exception raised", e);
  throw e;
}
