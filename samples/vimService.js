"use strict";

let express = require("express");
let fs = require("fs");
let httpProxy = require("http-proxy");
let https = require("https");
let path = require("path");


process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

let proxy = httpProxy.createProxyServer({
   secure: false
});
proxy.on("error", function(err, req, res) {
  console.log('err', err);
   res.status(500).end();
});

let app = express();
app.use(function(req, res, next) {
   if (/xsd|wsdl/.test(req.url) || /post/i.test(req.method)) {
      req.url = req.originalUrl;
      proxy.web(req, res, {
         target: req.headers["vsphere-target"]
      });
   } else {
      return next();
   }
});
app.use("/vsphere.js",
      express.static(path.join(__dirname, "../dist/vsphere.js")));
app.use("/node_modules",
      express.static(path.join(__dirname, "../node_modules")));
app.use(express.static(path.join(__dirname, "vimService")));

let options = {
   pfx: fs.readFileSync(path.join(__dirname, "vimService/sample.pfx"))
};
https.createServer(options, app).listen(4443);

console.log("The sample is now available at https://localhost:4443");
