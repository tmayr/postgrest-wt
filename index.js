const url = require("url");
const fs = require("fs");
const { spawn, execSync } = require("child_process");
const { promisify } = require("util");
const writeFileAsync = promisify(fs.writeFile);
const express = require("express");
const proxy = require("express-http-proxy");
const Webtask = require("webtask-tools");
const serveIndex = require("serve-index");

const app = express();
const PLATFORM = execSync("uname")
  .toString()
  .trim()
  .toLowerCase();

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

// PSQLRST Definitions
const PGR = {
  proc: null,
  _writeConfig: async function({
    db_uri = null,
    schema = "public",
    role = null
  }) {
    if (!db_uri) throw new Error("specify db uri as X-PSQLRST-DB-URI header");

    const parsedURI = url.parse(db_uri);

    if (!parsedURI.hostname) throw new Error("invalid db uri");

    // prone to errors
    if (!role) role = url.parse(db_uri).auth.split(":")[0];

    const config = `
    db-uri = "${db_uri}"
    db-schema = "${schema}"
    db-anon-role = "${role}"
    db-pool = 1
    
    server-host = "127.0.0.1"
    server-port = 3000
    `;

    const timestamp = new Date().getTime();
    const filePath = `/tmp/psqlrst-${timestamp}.conf`;
    await writeFileAsync(filePath, config);

    return filePath;
  },
  connect: async function(config) {
    // kill the session established beforehand
    this.kill();

    // output the configuration to a file
    const configFilePath = await this._writeConfig(config);

    return new Promise((resolve, reject) => {
      // couldnt figure out how to get the proper path inside a WT
      let binary = `/data/_verquire/postgrest-npm/1.0.0/node_modules/postgrest-npm/bin/postgrest-${PLATFORM}`;
      if (process.env.NODE_ENV === "development") {
        binary = `./node_modules/postgrest-npm/bin/postgrest-${PLATFORM}`;
      }

      // just overwriting a file might lead to security issues if any info leaks
      this.proc = spawn(binary, [configFilePath]);

      // log any errors
      this.proc.stderr.on("data", data => {
        const stringData = data.toString();
        console.error("[stderr]", stringData);
        reject(stringData);
        this.kill();
      });

      // log any data incoming and listen for a string to determine if connection is done
      this.proc.stdout.on("data", data => {
        const stringData = data.toString();
        console.log("[stdout]: ", stringData);
        if (stringData.includes("Connection successful")) resolve(stringData);
      });
    });
  },
  kill: async function() {
    if (this.proc) this.proc.kill();
  }
};

module.exports = Webtask.fromExpress(app);

if (process.env.NODE_ENV === "development") {
  app.listen(3001, () => {
    console.log("initialized");
  });
}
