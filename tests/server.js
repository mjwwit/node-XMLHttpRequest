'use strict';
var http = require("http");

var server = http.createServer(function (req, res) {
    switch (req.url) {
        case "/": {
            var body = "Hello World";
            res.writeHead(200, {
                "Content-Type": "text/plain",
                "Content-Length": Buffer.byteLength(body),
                "Date": "Thu, 30 Aug 2012 18:17:53 GMT",
                "Connection": "close"
            });
            res.end(body);
            return;
        }
        case "/text":
            res.writeHead(200, {"Content-Type": "text/plain"})
            res.end("Hello world!");
            return;
        case "/xml":
            res.writeHead(200, {"Content-Type": "application/xml"})
            res.end("<element><child>Foobar</child></element>");
            return;
        case "/json":
            res.writeHead(200, {"Content-Type": "application/json"})
            res.end(JSON.stringify({ foo: "bar" }));
            return;
        case "/binary1":
            res.writeHead(200, {"Content-Type": "application/octet-stream"})
            res.end(Buffer.from("Hello world!"));
            return;
        case "/binary2":
            const ta = new Float32Array([1, 5, 6, 7]);
            const buf = Buffer.from(ta.buffer);
            const str = buf.toString('binary');
            res.writeHead(200, {"Content-Type": "application/octet-stream"})
            res.end(str);
            return;
        default:
            if (req.url.startsWith('/redirectingResource/')) {
                let remaining = req.url.replace(/^\/redirectingResource\/*/, "") - 1;
                res.writeHead(301, {'Location': remaining ? ('http://localhost:8888/redirectingResource/' + remaining) : 'http://localhost:8888/'});
                res.end();
            }
            else {
                res.writeHead(404, {"Content-Type": "text/plain"})
                res.end("Not found");
            }
    }
}).listen(8888);

process.on("SIGINT", function () {
    server.close();
});
