
/******************************************************************************************
 * Assume a web server serves up the utf8 encoding of a random Uint8Array,
 * so that xhr.responseText is a string corresponding to the in-memory
 * representation of the Uint8Array. This test demonstrates a bug in xmlhttprequest-ssl,
 * where the utf8 endcoding of a byte with 0x80 <= byte <= 0xff, is torn across 2 chunks.
 *
 * Consider a code point 0x80. The utf8 encoding has 2 bytes 0xc2 and 0x80.
 * It is possible for one chunk to end with 0xc2 and the next chunk starts with 0x80.
 * This is what is meant by tearing. The fix is to remove
 *     self.responseText += data.toString('utf8');
 * from the response 'data' handler and add the following to the response 'end' handler
 *     // Construct responseText from response
 *     self.responseText = self.response.toString('utf8');
 */
'use strict';

var assert = require("assert");
var http = require("http");
var XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest;

var supressConsoleOutput = true;
function log (_) {
  if ( !supressConsoleOutput)
    console.log(arguments);
}

var serverProcess;

/******************************************************************************************
 * This section produces a web server that serves up
 * 1) Buffer.from(ta.buffer) using url = "http://localhost:8888/binary";
 * 2) utf8 encoding of ta_to_hexStr(ta) using url = "http://localhost:8888/binaryUtf8";
 * where ta is a Float32Array.
 * Note: In order to repro utf8 tearing ta.length needs to be pretty big
 *         N = 1 * 1000 * 1000;
 */

/**
 * Create a string corresponding to the in-memory representation of Float32Array ta.
 *
 * @param {Float32Array} ta
 * @returns {string}
 */
function ta_to_hexStr(ta) {
  var u8 = new Uint8Array(ta.buffer);
  return u8.reduce(function (acc, cur) { return acc + String.fromCharCode(cur) }, "");
}

/**
 * Create a random Float32Array of length N.
 *
 * @param {number} N
 * @returns {Float32Array}
 */
function createFloat32Array(N) {
  assert(N > 0);
  var ta = new Float32Array(N);
  for (var k = 0; k < ta.length; k++)
    ta[k] = Math.random();
  //ta = new Float32Array([1, 5, 6, 7]); // Use to debug
  return ta;
}
var N = 1 * 1000 * 1000; // Needs to be big enough to tear a few utf8 sequences.
var f32 = createFloat32Array(N);

/**
 * From a Float32Array f32 transform into:
 * 1) buffer: Buffer.from(ta.buffer)
 * 2) bufferUtf8: utf8 encoding of ta_to_hexStr(ta)
 *
 * @param {Float32Array} f32
 * @returns {{ buffer: Buffer, bufferUtf8: Buffer }}
 */
function createBuffers(f32) {
  var buffer = Buffer.from(f32.buffer);
  var ss = ta_to_hexStr(f32);
  var bufferUtf8 = Buffer.from(ss, 'utf8'); // Encode ss in utf8
  return { buffer, bufferUtf8 };
}
var bufs = createBuffers(f32);
var buffer = bufs.buffer,
    bufferUtf8 = bufs.bufferUtf8

/**
 * Serves up buffer at
 *   url = "http://localhost:8888/binary";
 * Serves up bufferUtf8 at
 *   url = "http://localhost:8888/binaryUtf8";
 *
 * @param {Buffer} buffer
 * @param {Buffer} bufferUtf8
 */
function createServer(buffer, bufferUtf8) {
  serverProcess = http.createServer(function (req, res) {
    switch (req.url) {
      case "/binary":
        res.writeHead(200, {"Content-Type": "application/octet-stream"})
        res.end(buffer);
        return;
      case "/binaryUtf8":
        res.writeHead(200, {"Content-Type": "application/octet-stream"})
        res.end(bufferUtf8);
        return;
      default:
        res.writeHead(404, {"Content-Type": "text/plain"})
        res.end("Not found");
        return;
    }
  }).listen(8888);
  process.on("SIGINT", function () {
    if (serverProcess)
      serverProcess.close();
    serverProcess = null;
  });
}
createServer(buffer, bufferUtf8);

/******************************************************************************************
 * This section tests the above web server and verifies the correct Float32Array can be
 * successfully reconstituted for both
 * 1) url = "http://localhost:8888/binary";
 * 2) url = "http://localhost:8888/binaryUtf8";
 */

/**
 * Assumes hexStr is the in-memory representation of a Float32Array.
 * Relies on the fact that the char codes in hexStr are all <= 0xFF.
 * Returns Float32Array corresponding to hexStr.
 *
 * @param {string} hexStr
 * @returns {Float32Array}
 */
function hexStr_to_ta(hexStr) {
  var u8 = new Uint8Array(hexStr.length);
  for (var k = 0; k < hexStr.length; k++)
    u8[k] = Number(hexStr.charCodeAt(k));
  return new Float32Array(u8.buffer);
}

/**
 * Verify ta1 and ta2 are the same kind of view.
 * Verify the first count elements of ta1 and ta2 are equal.
 *
 * @param {Float32Array} ta1
 * @param {Float32Array} ta2
 * @param {number} [count=1000]
 * @returns {boolean}
 */
function checkEnough(ta1, ta2, count) {
  if (count === undefined)
    count = 1000
  assert(ta1 && ta2);
  if (ta1.constructor.name !== ta2.constructor.name) return false;
  if (ta1.length !== ta2.length) return false;
  if (ta1.byteOffset !== ta2.byteOffset) return false;
  for (var k = 0; k < Math.min(count, ta1.length); k++) {
    if (ta1[k] !== ta2[k]) {
      log('checkEnough: Not Equal!', k, ta1[k], ta2[k]);
      return false;
    }
  }
  return true;
}

var xhr = new XMLHttpRequest();
var url = "http://localhost:8888/binary";
var urlUtf8 = "http://localhost:8888/binaryUtf8";

function download (xhr, url, responseType)
{
  if (responseType === undefined)
    responseType = 'arraybuffer';
  return new Promise(function (resolve, reject) {
    xhr.open("GET", url, true);

    xhr.responseType =  responseType;

    xhr.onloadend = function () {
      if (xhr.status >= 200 && xhr.status < 300)
      {
        switch (responseType)
        {
          case "":
          case "text":
            resolve(xhr.responseText);
            break;
          case "document":
            resolve(xhr.responseXML);
            break;
          default:
            resolve(xhr.response);
            break;
        }
      }
      else
      {
        var errorTxt = `${xhr.status}: ${xhr.statusText}`;
        reject(errorTxt);
      }
    };

    xhr.send();
  });
}

/**
 * Send a GET request to the server.
 * When isUtf8 is true, assume that xhr.response is already
 * utf8 encoded so that xhr.responseText.
 *
 * @param {string} url
 * @param {boolean} isUtf8
 * @returns {Promise<Float32Array>}
 */
function Get(url, isUtf8) {
  return download(xhr, url, 'text').then((dataTxt) => {
    return download(xhr, url, 'arraybuffer').then((ab) => {
      var data = Buffer.from(ab);
    
      assert(dataTxt && data);
    
      log('XHR GET:', dataTxt.length, data.length, data.toString('utf8').length);
      log('XHR GET:', data.constructor.name, dataTxt.constructor.name);
    
      if (isUtf8 && dataTxt.length !== data.toString('utf8').length)
        throw new Error("xhr.responseText !== xhr.response.toString('utf8')");
    
      var ta = isUtf8 ? new Float32Array(hexStr_to_ta(dataTxt)) : new Float32Array(data.buffer);
      log('XHR GET:', ta.constructor.name, ta.length, ta[0], ta[1]);
    
      if (!checkEnough(ta, f32))
        throw new Error("Unable to correctly reconstitute Float32Array");
    
      return ta;
    })
  });
}

/**
 * Test function which gets utf8 encoded bytes of the typed array
 *     new Uint8Array(new Float32Array(N).buffer),
 * then it gets the raw bytes from
 *     new Uint8Array(new Float32Array(N).buffer).
 * Before the utf8 tearing bug is fixed,
 *     Get(urlUtf8, true)
 * will fail with the exception:
 *     Error: xhr.responseText !== xhr.response.toString('utf8').
 *
 * @returns {Promise<Float32Array>}
 */
function runTest() {
  return Get(urlUtf8, true)
    .then(function () { return Get(url, false); });
}

/**
 * Run the test.
 */
setTimeout(function () {
  runTest()
    .then(function (ta) {
      console.log("done", ta && ta.length);
      if (serverProcess)
        serverProcess.close();
      serverProcess = null;
    })
    .catch(function (e) {
      console.log("FAILED");
      if (serverProcess)
        serverProcess.close();
      serverProcess = null;
      throw e;
    })
}, 100);

