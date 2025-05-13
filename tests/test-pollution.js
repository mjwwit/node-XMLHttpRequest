// Main purpose of this test is to ensure that XHR options and exposed methods cannot be prototype-polluted

var XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest,
  spawn = require("child_process").spawn,
  assert = require("assert"),
  xhr,
  objectProto = Object.getPrototypeOf({});

// spawn a server
serverProcess = spawn(process.argv[0], [__dirname + "/server.js"], { stdio: 'inherit' });

var polluteFunc = function (buf, enc) {
  return "Polluted!";
}

var runTest = function () {
  // most naive pollution
  objectProto.textDecoder = polluteFunc;

  xhr = new XMLHttpRequest();
  xhr.open("GET", "http://localhost:8888", false);
  xhr.send();
  assert.equal("Hello World", xhr.responseText);
  console.log("Naive pollution: PASSED");

  delete objectProto.textDecoder;

  // pollute with getter/setter
  Object.defineProperty(objectProto, 'textDecoder', {
    get: function () { return polluteFunc; },
    set: function (value) {}
  });

  xhr = new XMLHttpRequest();
  xhr.open("GET", "http://localhost:8888", false);
  xhr.send();
  assert.equal("Hello World", xhr.responseText);
  console.log("Getter/Setter pollution: PASSED");

  // pollute xhr properties
  Object.defineProperty(objectProto, 'responseText', {
    get: function () { return "Polluted!"; },
    set: function (value) {}
  });

  xhr = new XMLHttpRequest();
  xhr.open("GET", "http://localhost:8888", false);
  xhr.send();
  assert.equal("Hello World", xhr.responseText);
  console.log("Pollute xhr.responseText: PASSED");
}

try {
  runTest();
}
catch (e) {
  throw e;
}
finally {
  serverProcess.kill('SIGINT');
}
