
var http = require("http");

var server = http.createServer(function (req, res) {
    switch (req.url) {
        case "/text":
            return res
                .writeHead(200, {"Content-Type": "text/plain"})
                .end("Hello world!");
        case "/xml":
            return res
                .writeHead(200, {"Content-Type": "application/xml"})
                .end("<element><child>Foobar</child></element>");
        case "/json":
            return res
                .writeHead(200, {"Content-Type": "application/json"})
                .end(JSON.stringify({ foo: "bar" }));
        case "/binary1":
            return res
                .writeHead(200, {"Content-Type": "application/octet-stream"})
                .end(Buffer.from("Hello world!"));
        case "/binary2": {
            const ta = new Float32Array([1, 5, 6, 7]);
            const buf = Buffer.from(ta.buffer);
            const str = buf.toString('binary');
            return res
                .writeHead(200, {"Content-Type": "application/octet-stream"})
                .end(str);
	}
        default:
            return res
                .writeHead(404, {"Content-Type": "text/plain"})
                .end("Not found");
    }
}).listen(8888);

process.on("SIGINT", function () {
    server.close();
});
