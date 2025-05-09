# node-XMLHttpRequest #

Fork of [node-XMLHttpRequest](https://github.com/driverdan/node-XMLHttpRequest) by [driverdan](http://driverdan.com). Forked and published to npm because a [pull request](https://github.com/rase-/node-XMLHttpRequest/commit/a6b6f296e0a8278165c2d0270d9840b54d5eeadd) is not being created and merged. Changes made by [rase-](https://github.com/rase-/node-XMLHttpRequest/tree/add/ssl-support) are needed for [engine.io-client](https://github.com/Automattic/engine.io-client).

## Usage ## 

Here's how to include the module in your project and use as the browser-based
XHR object.

	var XMLHttpRequest = require("xmlhttprequest-ssl").XMLHttpRequest;
	var xhr = new XMLHttpRequest();

Note: use the lowercase string "xmlhttprequest-ssl" in your require(). On
case-sensitive systems (eg Linux) using uppercase letters won't work.

## Non-standard features ##
### Additional options ###

Non-standard options for this module are passed through the `XMLHttpRequest` constructor. Here is the list of all options:

<table>
    <thead>
        <tr>
            <th>Option</th>
            <th>Default value</th>
            <th>Description</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td><code>ca</code></td>
            <td rowspan="6"><code>undefined</code></td>
            <td rowspan="7">Control <code>https:</code> requests, you can find their functionality in the <a href="https://nodejs.org/api/https.html#httpsrequestoptions-callback">Nodejs Documentation</a></td>
        </tr>
        <tr>
            <td><code>cert</code></td>
        </tr>
        <tr>
            <td><code>ciphers</code></td>
        </tr>
		<tr>
            <td><code>key</code></td>
        </tr>
		<tr>
            <td><code>passhphrase</code></td>
        </tr>
		<tr>
            <td><code>pfx</code></td>
        </tr>
		<tr>
            <td><code>rejectUnauthorized</code></td>
			<td><code>true</code></td>
        </tr>
		<tr>
            <td><code>agent</code></td>
			<td><code>undefined</code></td>
			<td>Allows to specify a <a href="https://nodejs.org/api/https.html#class-httpsagent">Nodejs Agent</a> instance, allowing connection reuse</td>
        </tr>
		<tr>
            <td><code>autoUnref</code></td>
			<td><code>false</code></td>
			<td>Set to any truthy value to prevent a process from not exiting naturally because a request socket from this module is still open</td>
        </tr>
		<tr>
            <td><code>maxRedirects</code></td>
			<td><code>20</code></td>
			<td>Allows control over the maximum number of redirects that are followed</td>
        </tr>
		<tr>
            <td><code>allowFileSystemResources</code></td>
			<td><code>true</code></td>
			<td>Allows user to control access to the local filesystem through the <code>file:</code> protocol</td>
        </tr>
		<tr>
            <td><code>origin</code></td>
			<td><code>undefined</code></td>
			<td>Allows user to set a base URL for the request. The resulting request URL will be constructed as follows <code>new URL(url, origin)</code></td>
        </tr>
		<tr>
            <td><code>syncPolicy</code></td>
			<td><code>"warn"</code></td>
			<td>Control feature behavior of the synchronous feature:<ul><li><code>"disabled"</code>: Disable the feature completely, throws error after calling <code>.send()</code> if in synchronous mode</li><li><code>"warn"</code>: Enable the feature, but show a warning when calling <code>.open()</code> with synchronous mode</li><li><code>"enabled"</code>: Enable the feature without showing any additional warnings or errors</li></ul></td>
        </tr>
		<tr>
            <td><code>disableHeaderCheck</code></td>
			<td><code>false</code></td>
			<td>Disable the check against forbidden headers to be added to a XHR request</td>
        </tr>
		<tr>
            <td><code>xmlParser</code></td>
			<td>none</td>
			<td>Specify a parser (non-async) to parse document from text when <code>xhr.responseType</code> is either <code>"document"</code> or in text format. If the parser is invalid or omitted, <code>xhr.responseXML</code> will be <code>null</code></td>
        </tr>
		<tr>
            <td><code>textEncoder</code></td>
			<td><code>TextDecoder</code> or <code>buf.toString(enc)</code> depending on Node version</td>
			<td>Specify a text decoder, accepting a buffer <code>buf</code> and encoding <code>enc</code> to decode to desired encoding.<br>Note that <code>TextDecoder</code> at version 12 does not support a wide range of encodings than later node version does</td>
        </tr>
    </tbody>
</table>

### Additional methods ###
`XMLHttpRequest` object created using this library exposes `xhr.getRequestHeader(header_name)` method to retrieve any header content by name in the request headers list. This feature is deprecated and will be removed in future releases.

# Original README #

## Versions ##

Version 2.0.0 introduces a potentially breaking change concerning local file system requests.
If these requests fail this library now returns the `errno` (or -1) as the response status code instead of
returning status code 0.

Prior to 1.4.0 version numbers were arbitrary. From 1.4.0 on they conform to
the standard major.minor.bugfix. 1.x shouldn't necessarily be considered
stable just because it's above 0.x.

Since the XMLHttpRequest API is stable this library's API is stable as
well. Major version numbers indicate significant core code changes.
Minor versions indicate minor core code changes or better conformity to
the W3C spec.

## License ##

MIT license. See LICENSE for full details.

## Supports ##

* Async and synchronous requests
* GET, POST, PUT, and DELETE requests
* All spec methods (open, send, abort, getRequestHeader,
  getAllRequestHeaders, event methods)
* Requests to all domains

## Known Issues / Missing Features ##

For a list of open issues or to report your own visit the [github issues
page](https://github.com/driverdan/node-XMLHttpRequest/issues).

* Local file access may have unexpected results for non-UTF8 files
* Synchronous requests don't set headers properly
* Synchronous requests freeze node while waiting for response (But that's what you want, right? Stick with async!).
* Some events are missing, such as abort
* getRequestHeader is case-sensitive
* Cookies aren't persisted between requests
* Missing XML support
* Missing basic auth
