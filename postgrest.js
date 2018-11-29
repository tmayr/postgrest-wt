const url = require("url");
const fs = require("fs");
const { spawn, execSync } = require("child-process");
const { promisify } = require("util");
const writeFileAsync = promisify(fs.writeFile);

const PLATFORM = execSync("uname")
  .toString()
  .trim()
  .toLowerCase();

const PostgRest = {
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

    return writeFileAsync("/tmp/p.conf", config);
  },
  connect: async function(config) {
    // kill the session established beforehand
    this.kill();

    // output the configuration to a file
    await this._writeConfig(config);

    return new Promise((resolve, reject) => {
      // const binary = `/data/_verquire/postgrest-npm/1.0.0/node_modules/postgrest-npm/bin/postgrest-${PLATFORM}`;
      const binary = `./node_modules/postgrest-npm/bin/postgrest-${PLATFORM}`;

      // just overwriting a file might lead to security issues if any info leaks
      this.proc = spawn(binary, ["/tmp/p.conf"]);

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

module.exports = PostgRest;
