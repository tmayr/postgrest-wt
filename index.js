const fs = require("fs");
const cp = require("child_process");
const express = require("express");
const proxy = require("express-http-proxy");
var Webtask = require("webtask-tools");

const app = express();
let PLATFORM = "linux";
let proc = null;

cp.exec("uname", (_, p) => (PLATFORM = p.toLowerCase().trim()));

const createConfig = async (
  uri = "postgres://root:root@localhost:5432/test",
  schema = "public",
  role = "public"
) => {
  const config = `
db-uri = "${uri}"
db-schema = "${schema}"
db-anon-role = "${role}"
db-pool = 1

server-host = "127.0.0.1"
server-port = 3000
`;

  return new Promise((resolve, reject) => {
    fs.writeFile("/tmp/p.conf", config, (err, result) => {
      if (err) return reject(err);
      return resolve(result);
    });
  });
};

const launchPostgrest = () => {
  return new Promise((resolve, reject) => {
    const binary = `./postgrest-npm/bin/postgrest-${PLATFORM}`;
    proc = cp.spawn(binary, ["/tmp/p.conf"]);

    proc.stderr.on("data", data => {
      const stringData = data.toString();
      console.error("[stderr]", stringData);
      reject(stringData);
    });

    proc.stdout.on("data", data => {
      const stringData = data.toString();
      console.log("[stdout]: ", stringData);
      if (stringData.includes("Connection successful")) resolve(stringData);
    });
  });
};

app.use(
  proxy("127.0.0.1:3000", {
    proxyReqOptDecorator: async function(req) {
      console.log(PLATFORM);

      await createConfig();
      await launchPostgrest();
      return req;
    },
    userResDecorator: function(proxyRes, proxyResData) {
      proc.kill();
      return Promise.resolve(proxyResData);
    }
  })
);

module.exports = Webtask.fromExpress(app);

if (process.env.NODE_ENV === "development") {
  app.listen(3001, () => {
    console.log("initialized");
  });
}
