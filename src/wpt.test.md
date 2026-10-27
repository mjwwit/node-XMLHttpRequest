# Web Platform Test adaptations

`wpt.test.mts` adapts these upstream cases to Vitest and a Node worker HTTP fixture:

- https://github.com/web-platform-tests/wpt/blob/master/xhr/abort-during-unsent.any.js
- https://github.com/web-platform-tests/wpt/blob/master/xhr/abort-during-open.any.js
- https://github.com/web-platform-tests/wpt/blob/master/xhr/XMLHttpRequest-withCredentials.any.js
- https://github.com/web-platform-tests/wpt/blob/master/xhr/event-readystatechange-loaded.any.js

Copyright © web-platform-tests contributors. BSD 3-Clause license: [WPT-LICENSE.md](../licenses/WPT-LICENSE.md).

Browser harness callbacks become awaited Vitest assertions; resource URLs use an isolated HTTP server; worker-style synchronous semantics apply on Node. Trickle timing is shortened while retaining multiple response chunks. Other colocated tests independently check the WHATWG XHR algorithms and Node extensions.

These are selected adaptations, not a claim that the complete WPT suite passes. Browser CORS, cookie storage, Window lifecycle, built-in DOM parsing, service workers and navigation are outside this Node implementation's contract.
