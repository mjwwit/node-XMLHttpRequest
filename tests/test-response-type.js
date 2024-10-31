
/******************************************************************************************
 * This test validates xhr.responseType as described by:
 *    section 3.6, subsections 8,9,10,11 of https://xhr.spec.whatwg.org/#the-response-attribute
 *    except xhr.responseType='document' is not yet supported.
 * 
 * 1) Create a simple min-webserver using the node http module.
 * 2) Upload 2 different float32 arrays .
 * 3) Upload the utf8 encoding of the underlying in-memory representations of 1).
 * 4) Upload a stringified JSON object.
 * 5) Then these 5 different uploads are downloaded as xhr.reponseType varies over
 *      [ "text", "", "arraybuffer", "blob", "json" ]
 *    and then various checks verify that the downloaded content is the same as that uploaded.
 */
// @ts-check
'use strict';

const http = require("http");
const XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest;

const supressConsoleOutput = true;
function log (_) {
  if ( !supressConsoleOutput)
    console.log(arguments);
}

var serverProcess;

/******************************************************************************************
 * This section has various utility functions:
 * 1) Convert typed array to binary string identical to underlying in-memory representation.
 * 2) Convert string to typed array when the string is the in-memory representation of a Float32Array.
 * 3) Display the underlying in-memory representation of the input string data.
 * 4) Pause/sleep for t milliseconds.
 * 5) Create a random Float32Array of length N.
 * 6) Check to see if 2 array-like objects have the same elements.
 * 7) Efficiently concatenate the input Array of Buffers.
 */

/**
 * Create a string corresponding to the in-memory representation of typed array ta.
 * @param {{ buffer: ArrayBuffer, length: number }} ta
 * @returns {string}
 */
function typedArrayToString (ta) {
  const u8 = new Uint8Array(ta.buffer);
  return u8.reduce((acc, cur) => acc + String.fromCharCode(cur), "");
}

/**
 * Assumes str is the in-memory representation of a Float32Array.
 * Relies on the fact that the char codes in str are all <= 0xFF.
 * Returns Float32Array corresponding to str.
 *
 * @param {string} str
 * @returns {Float32Array}
 */
function stringToFloat32Array (str) {
  const u8 = new Uint8Array(str.length);
  for (let k = 0; k < str.length; k++)
    u8[k] = Number(str.charCodeAt(k));
  return new Float32Array(u8.buffer);
}

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
    bufferArray[k].copy(result, offset, 0, bufferArray[k].length)
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
    if (key !== '/Json') // json not stored when uploading, but is stored when retrieving, new key makes check fail
      result[key] = storage[key].length;
  return result;
}
function checkStorage () {
  log('-----------------------------------------------------------------------------------');
  log('storage:', JSON.stringify(storageLength()));
  log('-----------------------------------------------------------------------------------');
}

// Xml doc for testing responseType "document"
const xmlDoc =
'<xml xmlns="a">'
+'  <child>test</child>'
+'  <child/>'
+'</xml>';

/**
 * Serves up anything uploaded.
 * Tested with:
 *   const urlF32    = "http://localhost:8888/F32";
 *   const urlF32_2  = "http://localhost:8888/F32_2";
 *   const urlUtf8   = "http://localhost:8888/Utf8";
 *   const urlUtf8_2 = "http://localhost:8888/Utf8_2";
 *   const urlJson   = "http://localhost:8888/Json";
 *   const urlXml    = "http://localhost:8888/Xml";
 */
function createServer() {
  serverProcess = http.createServer(function (req, res) {
    req.on('error', err => { console.error('request:', err) });
    res.on('error', err => { console.error('response:', err) });
    if (req.method === 'POST') {
      const chunks = [];
      //req.on('data', chunk => chunks.push(chunk));
      req.on('data', chunk => {
        // console.log('foo', chunk.toString('utf8'));
        // console.log('bar', JSON.parse(chunk.toString('utf8')));
        // console.log('bar', unescape(chunk.toString('utf8')));
        chunks.push(chunk);
      });
      req.on('end', () => {
        const u8 = concat(chunks);
        storage[req.url] = u8;
        // console.log('server end-handler', req.url, u8.length, req.headers);
        // console.log(u8.toString('utf8'));
        // console.log('-------------------');
        // console.log(xmlDoc);
        res.writeHead(200, {"Content-Type": "application/octet-stream"})
        res.end(`success:len ${u8.length}`);
      });
    } else {
      if (!storage[req.url])
      {
        res.writeHead(404, {"Content-Type": "text/plain; charset=utf8"})
        res.end("Not in storage");
        return;
      }
      if (req.url === "/Utf8" || req.url === "/Utf8_2" || req.url === "/Json" || req.url === "/Xml")
      {
        res.writeHead(200, {"Content-Type": "text/plain; charset=utf8"})
        res.end(storage[req.url].toString());
        return;
      }
      res.writeHead(200, {"Content-Type": "application/octet-stream"})
      res.end(storage[req.url]);
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

function download (xhr, url, responseType)
{
  responseType = responseType || 'arraybuffer';
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
 * 1) Uploads 2 different float32 arrays .
 * 2) Uploads the utf8 encoding of the underlying in-memory representations of 1).
 * 3) Uploads a stringified JSON object.
 * 4) Then these 5 different uploads are downloaded as xhr.reponseType varies over
 *      [ "text", "", "arraybuffer", "blob", "json" ]
 *    and then various checks verify that the downloaded content is the same as that uploaded.
 */

const N = 1 * 1000 * 1000;
const _f32 = createFloat32Array(N);
const _f32_2 = new Float32Array([ 1, 5, 6, 7, 2, 8 ]);

const F32 = Buffer.from(_f32.buffer);
const F32_2 = Buffer.from(_f32_2.buffer);
const F32Utf8 = Buffer.from(typedArrayToString(_f32), 'utf8');
const F32Utf8_2 = Buffer.from(typedArrayToString(_f32_2), 'utf8');

const urlF32    = "http://localhost:8888/F32";
const urlF32_2  = "http://localhost:8888/F32_2";
const urlUtf8   = "http://localhost:8888/Utf8";
const urlUtf8_2 = "http://localhost:8888/Utf8_2";
const urlJson   = "http://localhost:8888/Json";

const xhr = new XMLHttpRequest();

const type = (o) => { return `type=${o && o.constructor && o.constructor.name}`; };

/**
 * 1) Upload Float32Array of length N=1,000,000.
 *    Then download using xhr.responseType="arraybuffer" and check the the array lengths are the same.
 * 2) Convert the Float32Array of 1) into a string, utf8 encode it and upload it.
 *    Then download using xhr.responseType="text" and check the the string length is the same as the
 *    byteLength of the array in 1). Downloading as "text" decodes the utf8 into the original.
 * 3) Upload Float32Array([1, 5, 6, 7, 2, 8]).
 *    Then download using xhr.responseType="blob", extract the contained arrayBuffer, view it as 
 *    a Float32Aray and check that the contents are identical.
 * 4) Convert the Float32Array of 3) into a string, utf8 encode it and upload it.
 *    Then download using xhr.responseType="" and check the the string length is the same as the
 *    byteLength of the array in 3). Downloading as "" decodes the utf8 into the original.
 * 5) Let testJson be the current mini-webserver storage object:
 *       e.g. testJson = {ralph:2,'/F32':4000000,'/Utf8':5333575,'/F32_2':24,'/Utf8_2':28,'/Xml':56,'/Json':77}
 *    Upload JSON.stringify(testJson) and download it using xhr.responseType="json"
 *    Check that the objects are the same by comparing the strings after calling JSON.stringify. 
 * 6) Did a test of xhr.responseType="document" using a simple xml example.
 */
function runTest() {
  const uploadPromises = [];
  var r;
  return upload(xhr, urlF32, F32) // upload float32
  .then((r) => { 
    log('upload urlF32,    F32      ', r);
  })
  .then(() => { // download float32
    return download(xhr, urlF32, 'arraybuffer');
  })
  .then((ab) => { // make sure download is correct
    const f32 = new Float32Array(ab);
    log('download urlF32    arraybuf', f32.byteLength, type(ab));
    if (f32.byteLength !== F32.length)
      throw new Error(`Download from urlF32 has incorrect length: ${f32.byteLength} !== ${F32.length}`);  
  })
  .then(() => {
    return upload(xhr, urlUtf8, F32Utf8);
  })
  .then((r) => {
    log('upload urlUtf8,   F32Utf8  ', r);
  })
  .then(() => {
    return download(xhr, urlF32, 'arraybuffer');
  })
  .then((ab) => {
    const f32 = new Float32Array(ab);
    log('download urlF32    arraybuf', f32.byteLength, type(ab));
    if (f32.byteLength !== F32.length)
      throw new Error(`Download from urlF32 has incorrect length: ${f32.byteLength} !== ${F32.length}`);  
  })
  .then(() => {
    return upload(xhr, urlF32_2, F32_2);
  })
  .then((r) => {
    log('upload urlF32_2,  F32_2    ', r);
  })
  .then(() => {
    return download(xhr, urlF32, 'arraybuffer');
  })
  .then((ab) => {
    const f32 = new Float32Array(ab)
    log('download urlF32    arraybuf', f32.byteLength, type(ab));
    if (f32.byteLength !== F32.length)
      throw new Error(`Download from urlF32 has incorrect length: ${f32.byteLength} !== ${F32.length}`);  
  })
  .then(() => {
    log('XXXXXXXXXXXXXXXXX', urlUtf8_2, F32Utf8_2)
    return upload(xhr, urlUtf8_2, F32Utf8_2);
  })
  .then((r) => {
    log('upload urlUtf8_2, F32Utf8_2', r);
  })
  .then(() => {
    return download(xhr, urlUtf8_2, 'text');
  })
  .then((text2) => {
    const text2_f32 = stringToFloat32Array(text2);
    log('download urlUtf8_2  default', text2.length, type(text2), text2_f32);
    if (!isEqual(text2_f32, _f32_2))
      throw new Error(`Download from urlUtf8_2 has incorrect content: ${text2_f32} !== ${_f32_2}`);  
  })
  .then(() => {
    return upload(xhr, urlJson, JSON.stringify(storageLength()));
  })
  .then((r) => {
    log('upload:urlJson,   storage  ', r);
  })
  .then(() => {
    return download(xhr, urlJson, 'json');
  })
  .then((json) => {
    log(`download urlJson       json ${JSON.stringify(json).length}`, type(json), json);
    const testJson = storageLength();
    if (JSON.stringify(json) !== JSON.stringify(testJson))
      throw new Error(`Download from urlJson has incorrect content:\n  ${JSON.stringify(json)} !== ${JSON.stringify(testJson)}`);  
  });

}

/**
 * Run the test. 
 * If runTest() fails, an exception will be thrown.
 */
setTimeout(function () {
  runTest()
    .then(() => { console.log("PASSED"); shutdown(); })
    .catch((e) => { console.log("FAILED", e); shutdown(); throw e; });
}, 100);

function shutdown() {
  if (serverProcess)
    serverProcess.close();
  serverProcess = null;
}
