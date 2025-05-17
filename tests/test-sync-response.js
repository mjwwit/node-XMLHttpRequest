/**
 * Test GET http URL with both async and sync mode.
 * Use xhr.responseType = "" and "arraybuffer".
 */
'use strict';

var assert = require("assert")
  , spawn = require('child_process').spawn
  , XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest
  , serverProcess;

const supressConsoleOutput = true;
function log (_) {
  if ( !supressConsoleOutput)
    console.log.apply(console, arguments);
}

// Running a sync XHR and a webserver within the same process will cause a deadlock
serverProcess = spawn(process.argv[0], [__dirname + "/server.js"], { stdio: 'inherit' });

setTimeout(function () {
  try {
    runTest();
    console.log('PASSED');
  } catch (e) {
    console.log('FAILED');
    throw e;
  } finally {
    serverProcess.kill('SIGINT');
  }
}, 100);

/**
 * Check to see if 2 array-like objects have the same elements.
 * @param {{ length: number }} ar1
 * @param {{ length: number }} ar2
 * @returns {boolean}
 */
function isEqual (ar1, ar2) {
  if (ar1.length !== ar2.length)
    return false;
  for (let k = 0; k < ar1.length; k++)
    if (ar1[k] !== ar2[k])
      return false;
  return true;
}

function runTest() {
  var xhr = new XMLHttpRequest();
  var isSync = false;

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      // xhr.responseText is a 'utf8' string.
      var str = xhr.responseText;
      log('/text', str);
      assert.equal(xhr.responseText, "Hello world!");
      assert.equal(xhr.getResponseHeader('content-type'), 'text/plain')
      isSync = true;
    }
  }

  xhr.open("GET", "http://localhost:8888/text", false);
  xhr.send();

  assert(isSync, "XMLHttpRequest was not synchronous");

  xhr = new XMLHttpRequest();
  isSync = false;

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      // xhr.response is an ArrayBuffer
      var str = Buffer.from(xhr.response).toString('utf8');
      log('/binary1', str);
      assert.equal(str, 'Hello world!');
      assert.equal(xhr.getResponseHeader('content-type'), 'application/octet-stream')
      isSync = true;
    }
  }
  
  xhr.open("GET", "http://localhost:8888/binary1", false);
  xhr.responseType = 'arraybuffer';
  xhr.send();

  assert(isSync, "XMLHttpRequest was not synchronous");

  xhr = new XMLHttpRequest();
  isSync = false;

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      // xhr.response is an ArrayBuffer
      var binary = Buffer.from(xhr.response);
      var f32 = new Float32Array(binary);
      log('/binary2', f32);
      var answer = new Float32Array([1, 5, 6, 7]);
      assert.equal(isEqual(f32, answer), true);
      assert.equal(xhr.getResponseHeader('content-type'), 'application/octet-stream')
      isSync = true;
    }
  }

  xhr.open("GET", "http://localhost:8888/binary2", false);
  xhr.responseType = 'arraybuffer';
  xhr.send();

  assert(isSync, "XMLHttpRequest was not synchronous");

  xhr = new XMLHttpRequest();
  isSync = false;

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      assert.equal(xhr.response.toString(), 'Hello world!');
      assert.equal(xhr.getResponseHeader('content-type'), 'application/octet-stream')
      isSync = true;
    }
  }

  xhr.open("GET", "http://localhost:8888/binary1", false);
  xhr.send();

  assert(isSync, "XMLHttpRequest was not synchronous");

  console.log("done");
}
