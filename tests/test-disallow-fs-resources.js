var assert = require("assert")
  , path = require("path")
  , XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest
  , xhr;

xhr = new XMLHttpRequest({ allowFileSystemResources: false });

xhr.onreadystatechange = function() {
  if (this.readyState === 4) {
    assert.equal(this.statusText, "Not allowed to load local resource: " + url);
    assert.equal(this.status, 0);
    try {
      runSync();
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
    }
  }
};

// Async
var re = new RegExp(path.sep.replace("\\", "\\\\"), "g");
var p = (__dirname + "/testdata.txt").replace(re, path.posix.sep);
if (!p.startsWith('/')) {
  p = "/" + p;
}
var url = "file://" + p;
xhr.open("GET", url);
xhr.send();

// Sync
var runSync = function() {
  xhr = new XMLHttpRequest({ allowFileSystemResources: false });

  xhr.onreadystatechange = function() {
    if (this.readyState === 4) {
      assert.equal(this.statusText, "Not allowed to load local resource: " + url);
      assert.equal(this.status, 0);
      console.log("done");
    }
  };
  xhr.open("GET", url, false);
  xhr.send();
}
