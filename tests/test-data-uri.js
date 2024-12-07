var sys = require("util")
  , assert = require("assert")
  , XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest
  , xhr;

xhr = new XMLHttpRequest();

// define test data
var tests = [
  {
    name: "Test plain URI Data",
    data: "data:,Hello%20World",
    output: "Hello World"
  },
  {
    name: "Test plain URI Data with spaces",
    data: "data:, Hello World",
    output: " Hello World"
  },
  {
    name: "Test plain URI Data with data URI headers",
    data: "data:base64;example=1;args=2,Hello%20World",
    output: "Hello World"
  },
  {
    name: "Test normal bass64-encoded data URI",
    data: "data:text;base64,SGVsbG8gV29ybGQ=",
    output: "Hello World"
  },
  {
    name: "Test normal bass64-encoded data URI with mixed space characters",
    data: "data:text;base64,SGV sbG8gV\n29ybGQ=",
    output: "Hello World"
  },
  {
    name: "Test normal bass64-encoded data URI with mixed space characters (url-encoded)",
    data: "data:text;base64,SGV%20sbG8gV%0a29ybGQ=",
    output: "Hello World"
  },
  {
    name: "Test normal bass64-encoded data URI with invalid characters",
    data: "data:text;base64,SGV&&&&sbG8gV{29ybGQ=",
    error: "Invalid data URI"
  },
  {
    name: "Test normal bass64-encoded data URI with invalid characters (url-encoded)",
    data: "data:text;base64,SGV%26%26%26%26sbG8gV%7B29ybGQ%3D",
    error: "Invalid data URI"
  },
  {
    name: "Test base64-encoded data with no paddings",
    data: "data:text;base64,SGVsbG8gV29ybGQ",
    output: "Hello World"
  },
  {
    name: "Test base64-encoded data with excessive paddings",
    data: "data:text;base64,SGVsbG8gV29ybGQ==",
    error: "Invalid data URI"
  }
];

var tests_passed = 0;

var runAsyncTest = function (test) {
  console.log("  ASYNC");

  xhr = new XMLHttpRequest;
  xhr.open("get", test.data);
  xhr.onreadystatechange = function () {
    if (this.readyState === 4) {
      if (test.error) {
        assert.equal(xhr.status, 0);
        assert.equal(xhr.statusText, test.error);
      }
      else {
        assert.equal(xhr.status, 200);
        assert.equal(xhr.responseText, test.output);
      }
      console.log("    --> SUCESS");
      ++tests_passed;
    }
  }
  xhr.send();
}

var runSyncTest = function (test) {
  console.log("  SYNC");

  xhr = new XMLHttpRequest;
  xhr.open("get", test.data, false);
  try {
    xhr.send();
    if (test.error) throw "Expected to fail, Success with " + e.responseText;
    assert.equal(xhr.status, 200);
    assert.equal(xhr.responseText, test.output);
  }
  catch (e) {
    if (!test.error) throw "Expected to success, Caught error: " + e.toString()
    assert.equal(xhr.status, 0);
    assert.equal(e.message, test.error);
  }
  console.log("    --> SUCESS");
  ++tests_passed;
}

var i = 0;

var startTest = function () {
  let test = tests[i];

  if (!test) {
    console.log("Done:", tests_passed === tests.length * 2 ? "PASS" : "FAILED");
    return;
  }

  console.log(test.name);

  runAsyncTest(test);

  setTimeout(function () {
    try {
      runSyncTest(test);
    }
    catch (e) { console.error(e) };
    console.log("");
    ++i;
    startTest();
  }, 500);
}

startTest();
