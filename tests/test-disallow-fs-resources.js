var sys = require("util")
  , assert = require("assert")
  , XMLHttpRequest = require("../lib/XMLHttpRequest").XMLHttpRequest
  , xhr;

xhr = new XMLHttpRequest({ allowFileSystemResources: false });

xhr.onreadystatechange = function() {
  if (this.readyState === 4) {
    assert.equal(this.statusText, "Not allowed to load local resource: " + url);
    assert.equal(this.status, 0);
    try { runSync(); } catch (e) {
      if (e instanceof assert.AssertionError) console.error(e);
    }
  }
};

// Async
var url = "file://" + __dirname + "/testdata.txt";
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
