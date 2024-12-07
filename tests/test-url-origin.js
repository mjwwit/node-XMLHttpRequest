var sys = require("util")
  , assert = require("assert")
  , XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest
  , spawn = require('child_process').spawn;

// Test server
var serverProcess = spawn(process.argv[0], [__dirname + "/server.js"], { stdio: 'inherit' });

var runTest = function () {
  try {
    let xhr = new XMLHttpRequest({ origin: "http://localhost:8888" });
    xhr.open("GET", "text", false);
    xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      assert.equal(xhr.getResponseHeader('Content-Type'), 'text/plain');
      assert.equal(xhr.responseText, "Hello world!");
      console.log("origin test 1: done");
    }
    };
    xhr.send();
  } catch(e) {
    console.log("ERROR: Exception raised", e);
  }

  try {
    let xhr = new XMLHttpRequest({ origin: "http://localhost:8888/text" });
    xhr.open("GET", "", false);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
		assert.equal(xhr.getResponseHeader('Content-Type'), 'text/plain');
        assert.equal(xhr.responseText, "Hello world!");
        console.log("origin test 2: done");
      }
    };
    xhr.send();
  } catch(e) {
    console.log("ERROR: Exception raised", e);
  }
}

setTimeout(function () {
  try {
    runTest();
  } finally {
    serverProcess.kill('SIGINT');
  }
}, 100);
