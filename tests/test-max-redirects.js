var sys = require("util")
  , assert = require("assert")
  , XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest
  , spawn = require('child_process').spawn;

// Test server
var serverProcess = spawn(process.argv[0], [__dirname + "/server.js"], { stdio: 'inherit' });

var runTest = function () {
  try {
    let xhr = new XMLHttpRequest({ maxRedirects: 10 });
    xhr.open("GET", "http://localhost:8888/redirectingResource/10", false);
    xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      assert.equal(xhr.getRequestHeader('Location'), '');
      assert.equal(xhr.responseText, "Hello World");
      console.log("safe redirects count: done");
    }
    };
    xhr.send();
  } catch(e) {
    console.log("ERROR: Exception raised", e);
  }

  try {
    let xhr = new XMLHttpRequest({ maxRedirects: 10 });
    xhr.open("GET", "http://localhost:8888/redirectingResource/20", false);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        assert.equal(xhr.statusText, 'Too many redirects');
        assert.equal(xhr.status, 0);
        console.log("excessive redirects count: done");
      }
    };
    xhr.send();
  } catch(e) {
    if (e.message !== 'Too many redirects') console.log("ERROR: Exception raised", e);
  }
}

setTimeout(function () {
  try {
    runTest();
  } finally {
    serverProcess.kill('SIGINT');
  }
}, 100);
