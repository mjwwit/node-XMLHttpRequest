/**
 * Test GET file URL with both async and sync mode.
 * Use xhr.responseType = "arraybuffer".
 */
'use strict';
var XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest

const supressConsoleOutput = true;
function log (_) {
  if ( !supressConsoleOutput)
    console.log(arguments);
}

var url = "file://" + __dirname + "/testBinaryData";

function download (url, isAsync) {
  if (isAsync === undefined)
    isAsync = true;
  var xhr = new XMLHttpRequest();
  return new Promise((resolve, reject) => {
    xhr.open("GET", url, true);

    xhr.responseType =  'arraybuffer';

    xhr.onloadend = () => {
      if (xhr.status >= 200 && xhr.status < 300)
        resolve(xhr.response);
      else
      {
        const errorTxt = `${xhr.status}: ${xhr.statusText}`;
        reject(errorTxt);
      }
    };

    xhr.send();
  });
}

function runTest () {
  // Async
  var ab = download(url, /*isAsyn*/ true);
  return ab.then(afterAsyncDownload);
}

function afterAsyncDownload(ab) {  
  var str = Buffer.from(ab).toString('binary');
  var strLog = logBinary(str);
  log('async phase', strLog);
  if ("0000 803f 0000 a040 0000 c040 0000 e040" !== strLog)
    throw new Error(`Failed test-request-protocols-binary-data async phase: "0000 803f 0000 a040 0000 c040 0000 e040" !== ${strLog}`);
  log("done async phase");

  // Sync
  var abSync = download(url, /*isAsyn*/ false);
  return abSync.then(afterSyncDownload);
}

function afterSyncDownload(abSync) {
  var str = Buffer.from(abSync).toString('binary');
  var strLog = logBinary(str);
  log('sync phase', strLog);
  if ("0000 803f 0000 a040 0000 c040 0000 e040" !== strLog)
    throw new Error(`Failed test-request-protocols-binary-data sync phase: "0000 803f 0000 a040 0000 c040 0000 e040" !== ${strLog}`);
  log("done sync phase");
}

runTest()
  .then(() => console.log('PASSED'))
  .catch((e) => { console.error('FAILED'); throw e; });

function logBinary(data) {
  function log(data, idx) {
    const char = data.charCodeAt(idx).toString(16);
    // node compatibility: padStart doesn't exist to make sure return is 2 characters
    if (char.length === 1)
      return '0' + char;
    else
      return char;
  }
  if (!data) return 'no data';
  if (typeof data !== 'string') return 'not a string';
  let str = '';
  for (let k = 0; k < data.length - 2; k += 2)
    str += `${log(data, k)}${log(data, k+1)} `;
  if ((data.length % 2) == 0)
    str += `${log(data, data.length - 2)}${log(data, data.length - 1)}`;
  else
    str += `${log(data, data.length - 1)}`;
  return str;
}
