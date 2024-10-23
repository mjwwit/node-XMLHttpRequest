
/******************************************************************************************
 * This test measurs the elapsed time to download a Float32Array of length 100,000,000.
 */
// @ts-check
'use strict';

const http = require("http");

const useLocalXHR = true;
const XHRModule = useLocalXHR ? "../lib/XMLHttpRequest" : "xmlhttprequest-ssl";
const { XMLHttpRequest } = require(XHRModule);

const supressConsoleOutput = false;
function log (...args) {
  if ( !supressConsoleOutput)
    console.debug(...args);
}

var serverProcess;

/******************************************************************************************
 * This section has various utility functions:
 * 1) Create a random Float32Array of length N.
 * 2) Efficiently concatenate the input Array of Buffers.
 */

/**
 * Create a random Float32Array of length N.
 * @param {number} N
 * @returns {Float32Array}
 */
function createFloat32Array (N) {
  let ta = new Float32Array(N);
  for (let k = 0; k < ta.length; k++)
    ta[k] = Math.random();
  return ta;
}

/**
 * Efficiently concatenate the input Array of Buffers.
 * Why not use Buffer.concat(...) ?
 * Because bufTotal = Buffer.concat(...) often has byteOffset > 0, so bufTotal.buffer
 * is larger than the useable region in bufTotal.
 * @param {Array<Buffer>} bufferArray 
 * @returns 
 */
function concat (bufferArray) {
  var length = 0, offset = 0, k;
  for (k = 0; k < bufferArray.length; k++)
    length += bufferArray[k].length;
  const result = Buffer.alloc(length);
  for (k = 0; k < bufferArray.length; k++)
  {
    result.set(bufferArray[k], offset);
    offset += bufferArray[k].length;
  }
  return result;
};

/******************************************************************************************
 * This section produces a web server that serves up anything uploaded.
 * The uploaded data is stored as values in a storage object, where the keys are the upload url suffixes.
 * E.g.   storage['/F32'] === Buffer containing the corresponding upload.
 */

const storage = { ralph: [1,2] };

function storageLength () {
  const result = {};
  for (const key in storage)
    result[key] = storage[key].length;
  return result;
}
function checkStorage () {
  log('storage:', JSON.stringify(storageLength()));
}

/**
 * mini-webserver: Serves up anything uploaded.
 * Tested with:
 *   const urlXml    = "http://localhost:8888/Xml";
 */
function createServer() {
  serverProcess = http.createServer(function (req, res) {
    req.on('error', err => { console.error('request:', err) });
    res.on('error', err => { console.error('response:', err) });
    if (req.method === 'POST') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const u8 = concat(chunks);
        storage[req.url] = u8;
        // console.log('server end-handler', req.url, u8.length, req.headers);
        return res
            .writeHead(200, {"Content-Type": "application/octet-stream"})
            .end(`success:len ${u8.length}`);
      });
    } else {
      if (!storage[req.url])
        return res
          .writeHead(404, {"Content-Type": "text/plain; charset=utf8"})
          .end("Not in storage");

      return res
        .writeHead(200, {"Content-Type": "application/octet-stream"})
        .end(storage[req.url]);
    }
  }).listen(8888);
  process.on("SIGINT", function () {
    if (serverProcess)
      serverProcess.close();
    serverProcess = null;
  });
}
createServer();

/******************************************************************************************
 * This section creates:
 * 1) An upload function that POSTs using xmlhttprequest-ssl.
 * 2) A download function that GETs using xmlhttprequest-ssl and allows sepcifying xhr.responseType.
 */

function upload(xhr, url, data) {
  return new Promise((resolve, reject) => {
    xhr.open("POST", url, true);

    xhr.onloadend = () => {
      if (xhr.status >= 200 && xhr.status < 300)
        resolve(xhr.responseText);
      else
      {
        const errorTxt = `${xhr.status}: ${xhr.statusText}`;
        reject(errorTxt);
      }
    };

    xhr.setRequestHeader('Content-Type', 'multipart/form-data'); // Unnecessary.
    xhr.send(data);
  });
}

function download (xhr, url, responseType = 'arraybuffer')
{
  return new Promise((resolve, reject) => {
    xhr.open("GET", url, true);

    xhr.responseType =  responseType;

    xhr.onloadend = () => {
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
        const errorTxt = `${xhr.status}: ${xhr.statusText}`;
        reject(errorTxt);
      }
    };

    xhr.send();
  });
}

/******************************************************************************************
 * This section:
 * 1) Uploads random float32 array array of length 100,000,000. .
 * 2) Downloads the float32 array and measures the download elpased time.
 */

const N = 100 * 1000 * 1000;
const _f32 = createFloat32Array(N);

const F32 = Buffer.from(_f32.buffer);

const urlF32 = "http://localhost:8888/F32";

const xhr = new XMLHttpRequest();

/**
 * 1) Upload Float32Array of length N=100,000,000.
 *    Then download using xhr.responseType="arraybuffer" and check the the array lengths are the same.
 */
async function runTest() {
  try {
  let r = await upload(xhr, urlF32, F32);  // big
  log('upload urlF32,    F32      ', r);

  log('-----------------------------------------------------------------------------------');
  checkStorage(); // Check what's in the mini-webserver storage.
  log('-----------------------------------------------------------------------------------');

  const _t0 = Date.now();
  let success = true;
  const handle = setTimeout(() => {
    console.error('Download has taken longer than 5 seconds and hence it has failed!');
    success = false;
  }, 5 * 1000)
  const ab = await download(xhr, urlF32, 'arraybuffer'); // big
  clearTimeout(handle);
  console.log(`Download elapsed time:, ${Date.now() - _t0}ms`, ab.byteLength);
  console.info(['...waiting to see elapsed time of download...'])
  if (!success)
    throw new Error("Download has taken far too long!");
  } catch (e) {
    console.log('BOOM',  e);
  }
}

/**
 * Run the test. 
 * If runTest() fails, an exception will be thrown.
 */
setTimeout(function () {
  runTest()
    .then(() => { console.log("PASSED"); })
    .catch((e) => { console.log("FAILED"); throw e; })
    .finally(() => {
      if (serverProcess)
        serverProcess.close();
      serverProcess = null;
    });
}, 100);
