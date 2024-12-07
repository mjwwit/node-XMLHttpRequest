var ignored_files = [
  "run-test.js", // this file
  "server.js"
];

var spawnSync = require("child_process").spawnSync;
var fs = require("fs");
var path = require("path");

// global flag to check if some of test fails, and will store location of failed test file
var fail_path = false;

// function to read and conduct test case
var run_test = function (file) {
  if (fail_path) return;
  // logging
  console.log("Running:", file);

  // spawn a nodejs process
  var proc = spawnSync("node", [file]);

  if (proc.status === 0) {
    console.log(proc.stdout.toString());
    console.log("--> PASSED");
  }
  else {
    fail_path = file;
    console.log("--> TEST FAILED - CAUGHT ERROR:", proc.stderr.toString());
  }
}

var check_dir = function (dirPath) {
  if (fail_path) return;
  var files = fs.readdirSync(dirPath);

  for (var file of files) {
    // return early in case something fails
    if (fail_path) return;
    var full_path = path.join(dirPath, file);
    if (fs.statSync(full_path).isDirectory()) check_dir(full_path);
    else if (path.extname(file) === ".js" && !ignored_files.includes(full_path)) run_test(full_path);
  }
}

// start test
check_dir("./");

if (fail_path) throw new Error("Test failed at file: " + fail_path);

console.log("ALL TESTS PASSED.");
