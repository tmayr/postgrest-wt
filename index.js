const express = require("express");
const proxy = require("express-http-proxy");
const Webtask = require("webtask-tools");
const serveIndex = require("serve-index");
const PGR = require("./postgrest");

const app = express();

/**
 * since I'm clueless about where WT stores the code
 * we expose a handy filebrowser to poke around
 */
app.use("/browse", serveIndex("/", { icons: true }));

app.use(
  proxy("127.0.0.1:3000", {
    proxyReqOptDecorator: async function(req) {
      const headers = req.headers;

      // start the daemon and connect to the db
      await PGR.connect({
        db_uri: headers["x-psqlrst-db-uri"],
        role: headers["x-psqlrst-role"],
        schema: headers["x-psqlrst-schema"]
      });

      // after the daemon is up, we can forward the request
      return req;
    },
    userResDecorator: function(proxyRes, proxyResData) {
      // when the response is done, kill the daemon
      PGR.kill();

      return Promise.resolve(proxyResData);
    }
  })
);

app.use((err, req, res, next) => {
  console.log(err);
  return res.status(500).json({ message: err.toString() });
});

module.exports = Webtask.fromExpress(app);

if (process.env.NODE_ENV === "development") {
  app.listen(3001, () => {
    console.log("initialized");
  });
}
