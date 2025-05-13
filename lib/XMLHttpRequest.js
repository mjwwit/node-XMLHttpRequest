/**
 * Wrapper for built-in http.js to emulate the browser XMLHttpRequest object.
 *
 * This can be used with JS designed for browsers to improve reuse of code and
 * allow the use of existing libraries.
 *
 * Usage: include("XMLHttpRequest.js") and use XMLHttpRequest per W3C specs.
 *
 * @author Dan DeFelippi <dan@driverdan.com>
 * @contributor David Ellis <d.f.ellis@ieee.org>
 * @license MIT
 */

var fs = require('fs');
var os = require('os');
var path = require('path');
var spawn = require('child_process').spawn;
/**
 * Constants
 */

var stateConstants = {
  UNSENT: 0,
  OPENED: 1,
  HEADERS_RECEIVED: 2,
  LOADING: 3,
  DONE: 4
};

var assignStateConstants = function (object) {
  for (let stateKey in stateConstants) Object.defineProperty(object, stateKey, {
    enumerable: true,
    writable: false,
    configurable: false,
    value: stateConstants[stateKey]
  });
}

assignStateConstants(XMLHttpRequest);

/**
 * Module exports.
 */

module.exports = XMLHttpRequest;

// backwards-compat
XMLHttpRequest.XMLHttpRequest = XMLHttpRequest;

/**
 * `XMLHttpRequest` constructor.
 *
 * Supported options for the `opts` object are:
 *
 *  - `agent`: An http.Agent instance; http.globalAgent may be used; if 'undefined', agent usage is disabled
 *
 * @param {Object} opts optional "options" object
 */

function XMLHttpRequest(opts) {
  "use strict";

  if (!new.target) {
    throw new TypeError("Failed to construct 'XMLHttpRequest': Please use the 'new' operator, this object constructor cannot be called as a function.");
  }

  var dataMap = Object.create(null);
  
  /**
   * Safely assign any key with value to an object, preventing prototype pollution
   * @param {any} obj Object to assign
   * @param {any} key key name
   * @param {any} value value to assign
   * @param {boolean} assignable whether user can change this value (this defaults to `true` when value is a function)
   */
  var assignProp = function (obj, key, value, assignable) {
    if ("function" === typeof value) Object.defineProperty(obj, key, {
      value: value,
      writable: true,
      enumerable: true,
      configurable: true
    });
    else if (assignable) Object.defineProperty(obj, key, {
      get: function () { return dataMap[key]; },
      set: function (value) { dataMap[key] = value; },
      enumerable: true,
      configurable: true
    });
    else Object.defineProperty(obj, key, {
      get: function () { return dataMap[key]; },
      set: undefined,
      enumerable: true,
      configurable: true
    });
  }

  // defines a list of default options to prevent parameters pollution
  var default_options = {
    pfx: undefined,
    key: undefined,
    passphrase: undefined,
    cert: undefined,
    ca: undefined,
    ciphers: undefined,
    rejectUnauthorized: true,
    autoUnref: false,
    agent: undefined,
    allowFileSystemResources: true,
    maxRedirects: 20, // Chrome standard
    syncPolicy: "warn",
    disableHeaderCheck: false,
    xmlParser: function (text) {
      return null;
    },
    textDecoder: function (buf, enc) {
      if ("function" === typeof TextDecoder) try {
        return new TextDecoder(enc).decode(buf);
      }
      catch (e) {}
      return buf.toString(enc);
    },
    origin: undefined
  };

  opts = Object.assign(Object.create(null), default_options, opts);

  if (opts.syncPolicy !== "warn" && opts.syncPolicy !== "disabled" && opts.syncPolicy !== "enabled") {
    opts.syncPolicy = "warn";
  }

  for (var i of ["xmlParser", "textDecoder"]) {
    if (typeof opts[i] !== "function") {
      //@TODO: find a reliable way to check if function is async
      opts[i] = default_options[i];
    }
  }

  var sslOptions = {
    pfx: opts.pfx,
    key: opts.key,
    passphrase: opts.passphrase,
    cert: opts.cert,
    ca: opts.ca,
    ciphers: opts.ciphers,
    rejectUnauthorized: opts.rejectUnauthorized !== false
  };

  /**
   * Private variables
   */
  var self = this;
  var http = require('http');
  var https = require('https');

  var maxRedirects = opts.maxRedirects;
  if (typeof maxRedirects !== 'number' || Number.isNaN(maxRedirects)) maxRedirects = 20;
  else maxRedirects = Math.max(maxRedirects, 0);

  var redirectCount = 0;

  // Holds http.js objects
  var request;
  var response;

  // Request settings
  var settings = Object.create(null);

  assignStateConstants(this);

  // Set some default headers
  var defaultHeaders = {
    "User-Agent": "node-XMLHttpRequest",
    "Accept": "*/*"
  };

  var headers = Object.assign(Object.create(null), defaultHeaders);

  // These headers are not user setable.
  // The following are allowed but banned in the spec:
  // * user-agent
  var forbiddenRequestHeaders = [
    "accept-charset",
    "accept-encoding",
    "access-control-request-headers",
    "access-control-request-method",
    "connection",
    "content-length",
    "content-transfer-encoding",
    "cookie",
    "cookie2",
    "date",
    "expect",
    "host",
    "keep-alive",
    "origin",
    "referer",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "via"
  ];

  // These request methods are not allowed
  var forbiddenRequestMethods = [
    "TRACE",
    "TRACK",
    "CONNECT"
  ];

  // Send flag
  var sendFlag = false;
  // Error flag, used when errors occur or abort is called
  var errorFlag = false;
  var abortedFlag = false;

  // Custom encoding (if user called via xhr.overrideMimeType)
  var customEncoding = "";

  // Event listeners
  var listeners = Object.create(null);

  // private ready state (not exposed so user cannot modify)
  var readyState = this.UNSENT;

  /**
   * Public vars
   */

  Object.defineProperty(this, "readyState", {
    get: function () { return readyState; },
    configurable: true,
    enumerable: true
  });

  // default ready state change handler in case one is not set or is set late
  assignProp(this, 'onreadystatechange', null, true);

  // Result & response
  assignProp(this, 'responseText', "");
  assignProp(this, "responseXML", "");
  assignProp(this, "responseURL", "");
  assignProp(this, "response", Buffer.alloc(0));
  assignProp(this, "status", null);
  assignProp(this, "statusText", null);

  // xhr.responseType is supported:
  //   When responseType is 'text' or '', self.responseText will be utf8 decoded text.
  //   When responseType is 'json', self.responseText initially will be utf8 decoded text,
  //   which is then JSON parsed into self.response.
  //   When responseType is 'arraybuffer', self.response is an ArrayBuffer.
  //   When responseType is 'blob', self.response is a Blob.
  // cf. section 3.6, subsections 8,9,10,11 of https://xhr.spec.whatwg.org/#the-response-attribute
  assignProp(this, "responseType", "", true); /* 'arraybuffer' or 'text' or '' or 'json' or 'blob' */

  /**
   * Private methods
   */

  /**
   * Check if the specified header is allowed.
   *
   * @param string header Header to validate
   * @return boolean False if not allowed, otherwise true
   */
  var isAllowedHttpHeader = function(header) {
    return opts.disableHeaderCheck || (header && forbiddenRequestHeaders.indexOf(header.toLowerCase()) === -1);
  };

  /**
   * Check if the specified method is allowed.
   *
   * @param string method Request method to validate
   * @return boolean False if not allowed, otherwise true
   */
  var isAllowedHttpMethod = function(method) {
    return (method && forbiddenRequestMethods.indexOf(method) === -1);
  };

  /**
   * Given a Buffer buf, check whether buf.buffer.byteLength > buf.length and if so,
   * create a new ArrayBuffer whose byteLength is buf.length, containing the bytes.
   * of buf. This function shouldn't usually be needed, unless there's a future
   * behavior change where buf.buffer.byteLength > buf.length unexpectedly.
   *
   * @param {Buffer} buf
   * @returns {ArrayBuffer}
   */
  var checkAndShrinkBuffer = function(buf) {
    if (buf.length === buf.buffer.byteLength)
      return buf.buffer;
    const ab = new ArrayBuffer(buf.length);
    const result = Buffer.from(ab);
    for (let k = 0; k < buf.length; k++)
      result[k] = buf[k];
    return ab;
  }

  /**
   * Given the user-input (or Content-Type header value) of MIME type,
   * Parse given string to retrieve mimeType and its encoding (defaults to utf8 if not exists)
   * @param {string} contentType
   */
  var parseContentType = function (contentType) {
    const regex = /([a-zA-Z0-9!#$%&'*+.^_`|~-]+\/[a-zA-Z0-9!#$%&'*+.^_`|~-]+)(?:; charset=([a-zA-Z0-9-]+))?/;
  
    const matches = contentType.toLowerCase().match(regex);
  
    if (matches) {
      const mimeType = matches[1];
      const charset = matches[2] || 'utf-8';
  
      return { mimeType, charset };
    } else {
      return { mimeType: "", charset: "utf-8" }
    }
  }

  /**
   * Called when an error is encountered to deal with it.
   * @param  status  {number}    HTTP status code to use rather than the default (0) for XHR errors.
   */
  var handleError = function(error, status) {
    dataMap.status = status || 0;
    dataMap.statusText = error.message || "";
    dataMap.responseText = "";
    dataMap.responseXML = "";
    dataMap.responseURL = "";
    dataMap.response = Buffer.alloc(0);
    errorFlag = true;
    setState(self.DONE);
    if (!settings.async) throw error;
  };

  /**
   * Construct the correct form of response, given default content type
   *
   * The input is the response parameter which is a Buffer.
   * When self.responseType is "", "text",
   *   the input is further refined to be: new TextDecoder(encoding).decode(response),
   *   encoding is defined either by `Content-Type` header or set through `xhr.overrideMimetype()`.
   * When self.responseType is "json",
   *   the input is further refined to be: JSON.parse(response.toString('utf8')).
   * When self.responseType is "arraybuffer", "blob",
   *   the input is further refined to be: checkAndShrinkBuffer(response).
   * A special case is when self.responseType is "document",
   *   the decoded text will be passed to a parser function to create a DOM, or returns `null`
   *
   * @param {Buffer} response
   */
  var createResponse = function(response, customContentType) {
    dataMap.responseText = null;
    dataMap.responseXML = null;
    switch (self.responseType) {
      case 'json':
        dataMap.response = JSON.parse(response.toString('utf8'));
        break;
      case 'blob':
      case 'arraybuffer':
        // When self.responseType === 'arraybuffer', self.response is an ArrayBuffer.
        // Get the correct sized ArrayBuffer.
        dataMap.response = checkAndShrinkBuffer(response);
        if (dataMap.responseType === 'blob' && typeof Blob === 'function') {
          // Construct the Blob object that contains response.
          dataMap.response = new Blob([self.response]);
        }
        break;
      default:
        try {
          dataMap.responseText = opts.textDecoder.call(opts, response, customEncoding || parseContentType(String(customContentType)).charset);
        }
        catch (e) {
          // fall back to utf8 ONLY if custom encoding is present
          if (customEncoding) dataMap.responseText = response.toString('utf8');
          else dataMap.responseText = "";
        }
        dataMap.response = self.responseText;
        try { dataMap.responseXML = opts.xmlParser.call(opts, self.responseText); }
        catch (e) { dataMap.responseXML = null; }
    }

    // Special handling of self.responseType === 'document'
    if (dataMap.responseType === 'document') {
      dataMap.response = self.responseXML;
      dataMap.responseText = null;
    }
  }

  /**
   * Public methods
   */

  /**
   * Acts as if the Content-Type header value for a response is mime. (It does not change the header.) 
   * Throws an error if state is LOADING or DONE.
   * 
   * @param {string} mimeType - The MIME type to override with (e.g., "text/plain; charset=UTF-8").
   */
  assignProp(this, 'overrideMimeType', function(mimeType) {
    if (arguments.length === 0) {
      throw new TypeError("Failed to execute 'overrideMimeType' on 'XMLHttpRequest': 1 argument required, but only 0 present.");
    }

    // check if state is LOADING or DONE
    if (readyState === this.LOADING || readyState === this.DONE) {
      throw new Error("INVALID_STATE_ERR: MimeType cannot be overridden when the state is LOADING or DONE.");
    }

    // parse mimeType from given string and set custom charset
    customEncoding = parseContentType(String(mimeType)).charset;
  });

  /**
   * Open the connection. Currently supports local server requests.
   *
   * @param string method Connection method (eg GET, POST)
   * @param string url URL for the connection.
   * @param boolean async Asynchronous connection. Default is true.
   * @param string user Username for basic authentication (optional)
   * @param string password Password for basic authentication (optional)
   */
  assignProp(this, 'open', function(method, url, async, user, password) {
    abort();
    errorFlag = false;
    abortedFlag = false;

    // Check for valid request method
    if (!isAllowedHttpMethod(method)) {
      throw new Error("SecurityError: Request method not allowed");
    }

    settings = {
      "method": method.toUpperCase(),
      "url": url,
      "async": (typeof async !== "boolean" ? true : async),
      "user": user || null,
      "password": password || null
    };

    // check for sync
    if (opts.syncPolicy === "warn" && !settings.async) {
      console.warn("[Deprecation] Synchronous XMLHttpRequest is deprecated because of its detrimental effects to the end user's experience. For more information, see https://xhr.spec.whatwg.org/#sync-flag");
    }

    // parse origin
    try {
      settings.origin = new URL(opts.origin);
    }
    catch (e) {
      settings.origin = null;
    }

    setState(this.OPENED);
  });

  /**
   * Sets a header for the request.
   *
   * @param string header Header name
   * @param string value Header value
   * @return boolean Header added
   */
  assignProp(this, 'setRequestHeader', function(header, value) {
    if (readyState != this.OPENED) {
      throw new Error("INVALID_STATE_ERR: setRequestHeader can only be called when state is OPEN");
    }
    if (!isAllowedHttpHeader(header)) {
      console.warn('Refused to set unsafe header "' + header + '"');
      return false;
    }
    if (sendFlag) {
      throw new Error("INVALID_STATE_ERR: send flag is true");
    }
    headers[header] = value;
    return true;
  });

  /**
   * Gets a request header
   *
   * @deprecated
   * @param string name Name of header to get
   * @return string Returns the request header or empty string if not set
   */
  assignProp(this, 'getRequestHeader', function(name) {
    // @TODO Make this case insensitive
    console.warn("`xhr.getRequestHeader()` is deprecated and will be removed in a future release. It’s non-standard and not part of the XHR spec.");
    if (typeof name === "string" && headers[name]) {
      return headers[name];
    }

    return "";
  });

  /**
   * Gets a header from the server response.
   *
   * @param string header Name of header to get.
   * @return string Text of the header or null if it doesn't exist.
   */
  assignProp(this, 'getResponseHeader', function(header) {
    // in case of local request, headers are not present
    if (typeof header === "string"
      && readyState > this.OPENED
      && response.headers[header.toLowerCase()]
      && !errorFlag
      && response
      && response.headers
    ) {
      return response.headers[header.toLowerCase()];
    }

    return null;
  });

  /**
   * Gets all the response headers.
   *
   * @return string A string with all response headers separated by CR+LF
   */
  assignProp(this, 'getAllResponseHeaders', function() {
    // in case of local request, headers are not present
    if (readyState < this.HEADERS_RECEIVED || errorFlag || !response || !response.headers) {
      return "";
    }
    var result = "";

    for (var i in response.headers) {
      // Cookie headers are excluded
      if (i !== "set-cookie" && i !== "set-cookie2") {
        result += i + ": " + response.headers[i] + "\r\n";
      }
    }
    return result.slice(0, -2);
  });

  /**
   * Convert from Data URI to Buffer
   * @param {URL} url URI to parse
   * @returns {Buffer} buffer
   */

  var bufferFromDataUri = function (url) {
    // Triming from original url object for more consistency
    var data = url.href.slice(5);

    // separator between header and actual data
    var parts = data.split(",", 2);

    if (parts.length < 2) throw "Invalid URL";

    var dataHeaders = parts[0].split(";");

    var base64 = false, charset;

    // check if header part has base64 (from 2nd header onwards)
    // also get charset encoding of data URI (from FIRST found only)
    for (var i = 1; i < dataHeaders.length; ++i) {
      if (base64 && charset) break;
      var header = dataHeaders[i];

      if (!base64) base64 = header.toLowerCase() === "base64";
      if (!charset && header.startsWith("charset=")) {
        charset = header.slice(8).toLowerCase();
      }
    }

    var responseData, inputData = decodeURIComponent(parts[1]);

    if (base64) {
      // remove any ASCII whitespaces
      inputData = inputData.replace(/(\s|\t|\r|\n|\v|\f)+/g, "");
      // check padding amount
      let padding = inputData.match(/=*$/)[0];
      if (padding.length + (inputData.length - padding.length) % 4 > 4) throw "invalid padding";
      inputData = inputData.slice(0, inputData.length - padding.length);
      responseData = Buffer.from(inputData, "base64");
      if (responseData.toString("base64").replace(/=+$/, "") !== inputData) throw "malformed base64 encoding";
      return {
        data: responseData,
        charset: charset || "utf-8"
      }
    }
    else {
      return {
        data: Buffer.from(inputData),
        charset: charset || "utf-8"
      }
    }
  }

  /**
   * Sends the request to the server.
   *
   * @param string data Optional data to send as request body.
   */
  assignProp(this, 'send', function(data) {
    if (readyState != this.OPENED) {
      throw new Error("INVALID_STATE_ERR: connection must be opened before send() is called");
    }

    if (sendFlag) {
      throw new Error("INVALID_STATE_ERR: send has already been called");
    }

    if (opts.syncPolicy === "disabled" && !settings.async) {
      throw new Error("Synchronous requests are disabled for this instance.");
    }

    var isSsl = false, isLocal = false, isDataUri = false;
    var url;
    try {
      if (settings.origin) {
        url = new URL(settings.url, settings.origin);
      }
      else {
        url = new URL(settings.url);
      }
      settings.url = url.href;
    }
    catch (e) {
      // URL parsing throws TypeError, here we only want to take its message
      handleError(new Error(e.message));
      return;
    }
    var host;
    // Determine the server
    switch (url.protocol) {
      case 'https:':
        isSsl = true;
        // SSL & non-SSL both need host, no break here.
      case 'http:':
        host = url.hostname;
        break;

      case 'data:':
        isDataUri = true;
      
      case 'file:':
        isLocal = true;
        break;

      case undefined:
      case '':
        host = "localhost";
        break;

      default:
        throw new Error("Protocol not supported.");
    }

    // Load files off the local filesystem (file://)
    // or data from Data URI (data:)
    if (isLocal) {
      if (isDataUri) try {
        dataMap.status = 200;
        dataMap.responseURL = settings.url;
        var uriData = bufferFromDataUri(url);
        createResponse(uriData.data, "text/plain; charset=" + uriData.charset);
        setState(self.DONE);
        return;
      }
      catch (e) {
        handleError(new Error("Invalid data URI"));
        return;
      }

      if (!opts.allowFileSystemResources) {
        handleError(new Error("Not allowed to load local resource: " + url.href));
        return;
      }

      if (settings.method !== "GET") {
        throw new Error("XMLHttpRequest: Only GET method is supported");
      }

      if (settings.async) {
        fs.readFile(unescape(url.pathname), function(error, data) {
          if (error) {
            handleError(error, error.errno || -1);
          } else {
            dataMap.status = 200;
            dataMap.responseURL = settings.url;
            // Use self.responseType to create the correct self.responseType, self.response.
            createResponse(data, "");
            setState(self.DONE);
          }
        });
      } else {
        try {
          dataMap.status = 200;
          const syncData = fs.readFileSync(unescape(url.pathname));
          // Use self.responseType to create the correct self.responseType, self.response.
          dataMap.responseURL = settings.url;
          createResponse(syncData, "");
          setState(self.DONE);
        } catch(e) {
          handleError(e, e.errno || -1);
        }
      }

      return;
    }

    // Default to port 80. If accessing localhost on another port be sure
    // to use http://localhost:port/path
    var port = url.port || (isSsl ? 443 : 80);
    // Add query string if one is used
    var uri = url.pathname + (url.search || '');

    // Set the Host header or the server may reject the request
    headers["Host"] = host;
    if (!((isSsl && port === 443) || port === 80)) {
      headers["Host"] += ':' + url.port;
    }

    // Set Basic Auth if necessary
    if (settings.user) {
      if (typeof settings.password === "undefined") {
        settings.password = "";
      }
      var authBuf = Buffer.from(settings.user + ":" + settings.password);
      headers["Authorization"] = "Basic " + authBuf.toString("base64");
    }

    // Set content length header
    if (settings.method === "GET" || settings.method === "HEAD") {
      data = null;
    } else if (data) {
      headers["Content-Length"] = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);

      var headersKeys = Object.keys(headers);
      if (!headersKeys.some(function (h) { return h.toLowerCase() === 'content-type' })) {
        headers["Content-Type"] = "text/plain;charset=UTF-8";
      }
    } else if (settings.method === "POST") {
      // For a post with no data set Content-Length: 0.
      // This is required by buggy servers that don't meet the specs.
      headers["Content-Length"] = 0;
    }

    var options = {
      host: host,
      port: port,
      path: uri,
      method: settings.method,
      headers: headers,
      agent: opts.agent || false
    };

    // Reset error flag
    errorFlag = false;
    // Handle async requests
    if (settings.async) {
      // Use the proper protocol
      var doRequest = isSsl ? https.request : http.request;

      // Request is being sent, set send flag
      sendFlag = true;

      // As per spec, this is called here for historical reasons.
      dispatchEvent("readystatechange");

      // Handler for the response
      var responseHandler = function(resp) {
        // Check for redirect
        if (
          resp.statusCode === 301 ||
          resp.statusCode === 302 ||
          resp.statusCode === 303 ||
          resp.statusCode === 307 ||
          resp.statusCode === 308
        ) {
          ++redirectCount;
          // end the response
          resp.destroy();
          if (redirectCount > maxRedirects) {
            handleError(new Error("Too many redirects"));
            return;
          }
          // Change URL to the redirect location
          var url;
          try {
            url = new URL(resp.headers.location, settings.url);
            // reject redirects to any protocols other than http and https
            if (url.protocol !== "https:" && url.protocol !== "http:") throw "bad protocol";
            settings.url = url.href;
          }
          catch (e) {
            handleError(new Error("Unsafe redirect"));
            return;
          }
          // change request options again to match with new redirect protocol
          isSsl = url.protocol === "https:";
          doRequest = isSsl ? https.request : http.request;

          // Set host and port var in case it's used later
          host = url.hostname;
          port = url.port || (isSsl ? 443 : 80);

          headers["Host"] = host;
          if (!((isSsl && port === 443) || port === 80)) {
            headers["Host"] += ':' + url.port;
          }

          // Options for the new request
          var newOptions = {
            hostname: url.hostname,
            port: port,
            path: url.pathname + (url.search || ''),
            method: resp.statusCode === 303 ? 'GET' : settings.method,
            headers: headers
          };

          // Issue the new request
          createRequest(newOptions);
          // @TODO Check if an XHR event needs to be fired here
          return;
        }

        // Set response var to the response we got back
        // This is so it remains accessable outside this scope
        response = resp;
        // Collect buffers and concatenate once.
        const buffers = [];

        setState(self.HEADERS_RECEIVED);

        dataMap.status = response.statusCode;

        response.on('data', function(chunk) {
          // Make sure there's some data
          if (chunk) {
            buffers.push(chunk);
          }
          // Don't emit state changes if the connection has been aborted.
          if (sendFlag) {
            setState(self.LOADING);
          }
        }.bind(response));

        response.on('end', function() {
          if (sendFlag) {
            // The sendFlag needs to be set before setState is called. Otherwise if we are chaining callbacks
            // there can be a timing issue (the callback is called and a new call is made before the flag is reset).
            sendFlag = false;
            // Create the correct response for responseType.
            createResponse(Buffer.concat(buffers), response.headers['content-type'] || "");
            dataMap.statusText = this.statusMessage;
            dataMap.responseURL = settings.url;
            // Discard the 'end' event if the connection has been aborted
            setState(self.DONE);
          }
        }.bind(response));

        response.on('error', function(error) {
          handleError(error);
        }.bind(response));
      }

      // Error handler for the request
      var errorHandler = function(error) {
        // In the case of https://nodejs.org/api/http.html#requestreusedsocket triggering an ECONNRESET,
        // don't fail the xhr request, attempt again.
        if (request.reusedSocket && error.code === 'ECONNRESET')
          return doRequest(options, responseHandler).on('error', errorHandler);
        handleError(error);
      }

      var createRequest = function (opt) {
        opt = Object.assign(Object.create(null), opt);
        if (isSsl) Object.assign(opt, sslOptions);

        request = doRequest(opt, responseHandler).on('error', errorHandler);

        if (opts.autoUnref) {
          request.on('socket', function (socket) {
            socket.unref();
          });
        }

        // Node 0.4 and later won't accept empty data. Make sure it's needed.
        if (data) {
          request.write(data);
        }

        request.end();
      }

      // Create the request
      createRequest(options);

      dispatchEvent("loadstart");
    } else { // Synchronous
      try {
        // Create a temporary file for communication with the other Node process
        var tmpDir = os.tmpdir();
        var syncResponse;
        var contentFile = path.join(tmpDir, ".node-xmlhttprequest-content-" + process.pid);
        var syncFile = path.join(tmpDir, ".node-xmlhttprequest-sync-" + process.pid);
        fs.writeFileSync(syncFile, "", "utf8");
        // The async request the other Node process executes
        var execString = "'use strict';"
          + "var http = require('http'), https = require('https'), fs = require('fs');"
          + "function concat(bufferArray) {"
          + "  let length = 0, offset = 0;"
          + "  for (let k = 0; k < bufferArray.length; k++)"
          + "    length += bufferArray[k].length;"
          + "  const result = Buffer.alloc(length);"
          + "  for (let k = 0; k < bufferArray.length; k++) {"
          + "    for (let i = 0; i < bufferArray[k].length; i++) {"
          + "      result[offset+i] = bufferArray[k][i]"
          + "    }"
          + "    offset += bufferArray[k].length;"
          + "  }"
          + "  return result;"
          + "};"
          + "var doRequest = http" + (isSsl ? "s" : "") + ".request;"
          + "var isSsl = " + !!isSsl + ";"
          + "var options = " + JSON.stringify(options) + ";"
          + "var sslOptions = " + JSON.stringify(sslOptions) + ";"
          + "var responseData = Buffer.alloc(0);"
          + "var buffers = [];"
          + "var url = new URL(" + JSON.stringify(settings.url) + ");"
          + "var maxRedirects = " + maxRedirects + ", redirects_count = 0;"
          + "var makeRequest = function () {"
          + "  var opt = Object.assign(Object.create(null), options);"
          + "  if (isSsl) Object.assign(opt, sslOptions);"
          + "  var req = doRequest(opt, function(response) {"
          + "    if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307 || response.statusCode === 308) {"
          + "      response.destroy();"
          + "      ++redirects_count;"
          + "      if (redirects_count > maxRedirects) {"
          + "        fs.writeFileSync('" + contentFile + "', 'NODE-XMLHTTPREQUEST-ERROR-REDIRECT: Too many redirects', 'utf8');"
          + "        fs.unlinkSync('" + syncFile + "');"
          + "        return;"
          + "      }"
          + "      try {"
          + "        url = new URL(response.headers.location, url);"
          + "        if (url.protocol !== 'https:' && url.protocol !== 'http:') throw 'bad protocol';"
          + "      }"
          + "      catch (e) {"
          + "        fs.writeFileSync('" + contentFile + "', 'NODE-XMLHTTPREQUEST-ERROR-REDIRECT: Unsafe redirect', 'utf8');"
          + "        fs.unlinkSync('" + syncFile + "');"
          + "        return;"
          + "      };"
          + "      isSsl = url.protocol === 'https:';"
          + "      doRequest = isSsl ? https.request : http.request;"
          + "      var port = url.port;"
          + "      options = {"
          + "        hostname: url.hostname,"
          + "        port: port,"
          + "        path: url.pathname + (url.search || ''),"
          + "        method: response.statusCode === 303 ? 'GET' : options.method,"
          + "        headers: options.headers"
          + "      };"
          + "      options.headers['Host'] = url.host;"
          + "      if (!((isSsl && port === 443) || port === 80)) options.headers['Host'] += ':' + port;"
          + "      makeRequest();"
          + "      return;"
          + "    }"
          + "    response.on('data', function(chunk) {"
          + "      buffers.push(chunk);"
          + "    });"
          + "    response.on('end', function() {"
          + "      responseData = concat(buffers);"
          + "      fs.writeFileSync('" + contentFile + "', JSON.stringify({err: null, data: { url: url.href, statusCode: response.statusCode, statusText: response.statusMessage, headers: response.headers }}), 'utf8');"
          + "      fs.writeFileSync('" + contentFile + ".bin', responseData);"
          + "      fs.unlinkSync('" + syncFile + "');"
          + "    });"
          + "    response.on('error', function(error) {"
          + "      fs.writeFileSync('" + contentFile + "', 'NODE-XMLHTTPREQUEST-ERROR:' + JSON.stringify(error), 'utf8');"
          + "      fs.unlinkSync('" + syncFile + "');"
          + "    });"
          + "  }).on('error', function(error) {"
          + "    fs.writeFileSync('" + contentFile + "', 'NODE-XMLHTTPREQUEST-ERROR:' + JSON.stringify(error), 'utf8');"
          + "    fs.unlinkSync('" + syncFile + "');"
          + "  });"
          + "  " + (data ? "req.write('" + JSON.stringify(data).slice(1,-1).replace(/'/g, "\\'") + "');":"")
          + "  req.end();"
          + "};"
          + "makeRequest();"
        // Start the other Node Process, executing this string
        var syncProc = spawn(process.argv[0], ["-e", execString]);
        while(fs.existsSync(syncFile)) {
          // Wait while the sync file is empty
        }
        syncResponse = fs.readFileSync(contentFile, 'utf8');
        // Kill the child process once the file has data
        syncProc.stdin.end();
        // Remove the temporary file
        fs.unlinkSync(contentFile);
      }
      catch (e) {
        handleError(new Error("Synchronous operation aborted: Unable to access the OS temporary directory for read/write operations."));
      }
      if (syncResponse.match(/^NODE-XMLHTTPREQUEST-ERROR(-REDIRECT){0,1}:/)) {
        // If the file returned an error, handle it
        if (syncResponse.startsWith('NODE-XMLHTTPREQUEST-ERROR-REDIRECT')) {
          handleError(new Error(syncResponse.replace(/^NODE-XMLHTTPREQUEST-ERROR-REDIRECT: /, "")));
        }
        else {
          var errorObj = JSON.parse(syncResponse.replace(/^NODE-XMLHTTPREQUEST-ERROR:/, ""));
          handleError(errorObj, 503);
        }
      } else try {
        // If the file returned okay, parse its data and move to the DONE state
        const resp = JSON.parse(syncResponse);
        dataMap.status = resp.data.statusCode;
        dataMap.statusText = resp.data.statusText;
        dataMap.responseURL = resp.data.url;
        dataMap.response = fs.readFileSync(contentFile + ".bin");
        fs.unlinkSync(contentFile + ".bin");
        // Use self.responseType to create the correct self.responseType, self.response, self.responseXML.
        createResponse(self.response, resp.data.headers["content-type"] || "");
        // Set up response correctly.
        response = {
          statusCode: self.status,
          headers: resp.data.headers
        };
        setState(self.DONE);
      }
      catch (e) {
        handleError(new Error("Synchronous operation aborted: Unable to access the OS temporary directory for read/write operations."));
      }
    }
  });

  /**
   * Aborts a request.
   */
  var abort = function() {
    if (request) {
      request.abort();
      request = null;
    }

    headers = Object.assign(Object.create(null), defaultHeaders);
    dataMap.responseText = "";
    dataMap.responseXML = "";
    dataMap.response = Buffer.alloc(0);

    errorFlag = abortedFlag = true
    if (readyState !== self.UNSENT
        && (readyState !== self.OPENED || sendFlag)
        && readyState !== self.DONE) {
      sendFlag = false;
      setState(self.DONE);
    }
    readyState = self.UNSENT;
  };

  /**
   * Aborts a request.
   */
  assignProp(this, 'abort', abort);

  /**
   * Adds an event listener. Preferred method of binding to events.
   */
  assignProp(this, 'addEventListener', function(event, callback) {
    if (!(event in listeners)) {
      listeners[event] = [];
    }
    // Currently allows duplicate callbacks. Should it?
    listeners[event].push(callback);
  });

  /**
   * Remove an event callback that has already been bound.
   * Only works on the matching funciton, cannot be a copy.
   */
  assignProp(this, 'removeEventListener', function(event, callback) {
    if (event in listeners) {
      // Filter will return a new array with the callback removed
      listeners[event] = listeners[event].filter(function(ev) {
        return ev !== callback;
      });
    }
  });

  /**
   * Dispatch any events, including both "on" methods and events attached using addEventListener.
   */
  var dispatchEvent = function (event) {
    let argument = { type: event };
    if (typeof self["on" + event] === "function") {
      if (readyState === self.DONE && settings.async)
        setTimeout(function() { self["on" + event](argument) }, 0)
      else
        self["on" + event](argument)
    }
    if (event in listeners) {
      for (let i = 0, len = listeners[event].length; i < len; i++) {
        if (readyState === self.DONE)
          setTimeout(function() { listeners[event][i].call(self, argument) }, 0)
        else
          listeners[event][i].call(self, argument)
      }
    }
  };

  /**
   * Dispatch any events, including both "on" methods and events attached using addEventListener.
   */
  assignProp(this, 'dispatchEvent', dispatchEvent);

  /**
   * Changes readyState and calls onreadystatechange.
   *
   * @param int state New state
   */
  var setState = function(state) {
    if ((readyState === state) || (readyState === self.UNSENT && abortedFlag))
      return

    readyState = state;

    if (settings.async || readyState < self.OPENED || readyState === self.DONE) {
      dispatchEvent("readystatechange");
    }

    if (readyState === self.DONE) {
      let fire

      if (abortedFlag)
        fire = "abort"
      else if (errorFlag)
        fire = "error"
      else
        fire = "load"

      dispatchEvent(fire)

      // @TODO figure out InspectorInstrumentation::didLoadXHR(cookie)
      dispatchEvent("loadend");
    }
  };
};
