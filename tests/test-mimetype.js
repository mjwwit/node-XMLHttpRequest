var assert = require("assert")
  , XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest
  , spawn = require('child_process').spawn
  , serverProcess;

const body = Buffer.from([
  0x48, // H
  0xE9, // é
  0x6C, // l
  0x6C, // l
  0x6F, // o
  0x20, //  
  0x77, // w
  0xF8, // ø
  0x72, // r
  0x6C, // l
  0x64, // d
  0x20, //  
  0x6E, // n
  0x61, // a
  0xEF, // ï
  0x76, // v
  0x65  // e
]);

var base64Str = function (charset) {
  return "data:text/plain;base64;charset=" + charset + "," + body.toString('base64');
}
var plainStr = new TextDecoder("iso-8859-1").decode(body);
var plainStrUTF8 = new TextDecoder("utf-8").decode(body);

// spawn a server
serverProcess = spawn(process.argv[0], [__dirname + "/server.js"], { stdio: 'inherit' });

setTimeout(function () {
  try {
    runTest();
    console.log('PASSED');
  } catch (e) {
    console.log('FAILED');
    serverProcess.kill('SIGINT');
    throw e;
  } finally {
    
  }
}, 100);

var tests = [
  {
    name: "XHR with default latin-1 encoding",
    endpoint: "http://localhost:8888/latin1",
    expected: plainStr
  },
  {
    name: "XHR with overrideMimeType charset=latin-1",
    endpoint: "http://localhost:8888/latin1-invalid",
    override: "text/plain; charset=ISO-8859-1",
    expected: plainStr
  },
  {
    name: "XHR with wrong charset (utf-8 expected, actual is latin-1)",
    endpoint: "http://localhost:8888/latin1-invalid",
    expected: ''
  },
  {
    name: "XHR with wrong overriden charset (utf-8 expected, actual is latin-1)",
    endpoint: "http://localhost:8888/latin1-invalid",
    override: "text/plain; charset=lorem_ipsum",
    expected: plainStrUTF8
  },
  {
    name: "XHR on data URI with Latin-1 and charset specified",
    endpoint: base64Str("ISO-8859-1"),
    expected: plainStr
  },
  {
    name: "XHR on data URI with overrideMimeType to Latin-1",
    endpoint: base64Str("UTF-8"),
    override: "text/plain; charset=ISO-8859-1",
    expected: plainStr
  },
  {
    name: "XHR on data URI with wrong default charset (utf-8 vs latin-1)",
    endpoint: base64Str("lorem_ipsum"),
    expected: ''
  },
  {
    name: "XHR with wrong overriden charset and Data URI (utf-8 expected, actual is latin-1)",
    endpoint: base64Str("iso-8859-1"),
    override: "text/plain; charset=lorem_ipsum",
    expected: plainStrUTF8
  }
];

var tests_passed = 0;

var total_tests = tests.length * 2;

var runSyncTest = function (i) {
  var test = tests[i];
  var index = i + 1;
  try {
    var xhr = new XMLHttpRequest();
    console.log("Test " + index + ": [SYNC] " + test.name);
    xhr.open("GET", test.endpoint, false);
    if (test.override) xhr.overrideMimeType(test.override);
    xhr.send();
    assert.equal(xhr.responseText, test.expected);
    console.log("Test " + index + ": PASSED");
    ++tests_passed;
  } catch (e) {
    console.log("Test " + index + ": FAILED with exception", e);
  }
}

var runAsyncTest = function (i) {
  if (i >= tests.length) {
    serverProcess.kill('SIGINT');
    if (tests_passed === total_tests) return console.log("ALL PASSED");
    else {
      console.error("FAILED: Only " + tests_passed + " / " + total_tests + " tests passed");
      throw "";
    };
  }
  var test = tests[i];
  var index = i + tests.length + 1;
  try {
    var xhr = new XMLHttpRequest();
    console.log("Test " + index + ": [ASYNC] " + test.name);
    xhr.open("GET", test.endpoint);
    if (test.override) xhr.overrideMimeType(test.override);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) try {
        assert.equal(xhr.responseText, test.expected);
        console.log("Test " + index + ": PASSED");
        ++tests_passed;
        runAsyncTest(i + 1);
      }
      catch (e) {
        console.log("Test " + index + ": FAILED with exception", e);
        runAsyncTest(i + 1);
      }
    }
    xhr.send();
  } catch (e) {
    console.log("Test " + index + ": FAILED with exception", e);
    runAsyncTest(i + 1);
  }
}

var runTest = function () {
  for (var i = 0; i < tests.length; i++) {
    runSyncTest(i);
  }

  runAsyncTest(0);
}
