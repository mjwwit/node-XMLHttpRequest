'use strict';
var http = require("http");

var bufferBody = Buffer.from([
    0x48, // H
    0xE9, // é
    0x6C, // l
    0x6C, // l
    0x6F, // o
    0x20, //  
    0x77, // w
    0xF8, // ø
    0x72, // r
    0x6C, // l
    0x64, // d
    0x20, //  
    0x6E, // n
    0x61, // a
    0xEF, // ï
    0x76, // v
    0x65  // e
]);

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
            const buf = Buffer.from(ta);
            res.writeHead(200, {"Content-Type": "application/octet-stream"})
            res.end(buf);
            return;
        case "/latin1":
            res.writeHead(200, {
                'Content-Type': 'text/plain; charset=ISO-8859-1',
                'Content-Length': bufferBody.length
            });
            res.end(bufferBody);
            return;
        case "/latin1-invalid":
            res.writeHead(200, {
                'Content-Type': 'text/plain; charset=lorem_ipsum',
                'Content-Length': bufferBody.length
            });
            res.end(bufferBody);
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
