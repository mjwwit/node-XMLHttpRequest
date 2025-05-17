var assert = require("assert")
  , XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest
  , spawn = require("child_process").spawn
  , serverProcess
  , process = require("process");

// spawn a server
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
 * stage = 0 // idle
 * stage = 1 // expect warning to check
 * stage = 2 // available but does not expect warning
 */
var stage = 0;
// warning catch
let oldWarn = console.warn;
console.warn = function (warning) {
  if (stage > 0) {
    if (stage === 1) {
      assert.equal(warning, "[Deprecation] Synchronous XMLHttpRequest is deprecated because of its detrimental effects to the end user's experience. For more information, see https://xhr.spec.whatwg.org/#sync-flag");
      console.log("Correct warning caught.");
    }
    else if (stage === 2) {
      throw "Does not expect warning, caught " + JSON.stringify(warning);
    }
  }

  return oldWarn.call(this, warning);
}

var runTest = function () {
  // xhr with no syncPolicy (default = warn)
  try {
    console.log("Testing 1: XHR with no syncPolicy (default = warn)");
    var xhr = new XMLHttpRequest();
    stage = 1;
    xhr.open("GET", "http://localhost:8888/text", false);
    stage = 0;
    xhr.send();
    assert.equal(xhr.responseText, "Hello world!");
    console.log("Test 1: PASSED");
  } catch(e) {
    console.log("ERROR: Exception raised", e);
    throw e;
  }

  // xhr with syncPolicy = warn
  try {
    console.log("Testing 2: XHR with syncPolicy = warn");
    var xhr = new XMLHttpRequest({ syncPolicy: "warn" });
    stage = 1;
    xhr.open("GET", "http://localhost:8888/text", false);
    stage = 0;
    xhr.send();
    assert.equal(xhr.responseText, "Hello world!");
    console.log("Test 2: PASSED");
  } catch(e) {
    console.log("ERROR: Exception raised", e);
    throw e;
  }

  // xhr with syncPolicy = enabled
  try {
    console.log("Testing 3: XHR with syncPolicy = enabled");
    var xhr = new XMLHttpRequest({ syncPolicy: "enabled" });
    stage = 2;
    xhr.open("GET", "http://localhost:8888/text", false);
    stage = 0;
    xhr.send();
    assert.equal(xhr.responseText, "Hello world!");
    console.log("Test 3: PASSED");
  } catch(e) {
    console.log("ERROR: Exception raised", e);
    throw e;
  }

  // xhr with syncPolicy = disabled
  var errored = false;
  try {
    console.log("Testing 4: XHR with syncPolicy = disabled");
    var xhr = new XMLHttpRequest({ syncPolicy: "disabled" });
    stage = 2;
    xhr.open("GET", "http://localhost:8888/text", false);
    stage = 0;
    xhr.send();
  } catch(e) {
    errored = true;
    assert.equal(e.message, "Synchronous requests are disabled for this instance.");
    console.log("Correct error message.")
    console.log("Test 4: PASSED");
  }

  if (!errored) throw "Test 4 expects an error.";
}
