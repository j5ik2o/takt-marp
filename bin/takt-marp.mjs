#!/usr/bin/env node
// bin entry: Node version guard, then dispatcher startup. No other logic lives here.
// Keep the syntax in this file conservative so the guard is reached (instead of a
// syntax error) on unsupported Node versions; the dispatcher is loaded dynamically
// only after the guard passes.
var nodeMajor = Number(process.versions.node.split(".")[0]);
if (!(nodeMajor >= 24)) {
  process.stderr.write(
    "NODE_VERSION_UNSUPPORTED: takt-marp requires Node.js >= 24 (current: v" + process.versions.node + ")\n",
  );
  process.exit(1);
}

import("../scripts/lib/takt-marp-cli.mjs")
  .then(function (cli) {
    return cli.runCli(process.argv.slice(2));
  })
  .then(function (exitCode) {
    process.exitCode = exitCode;
  })
  .catch(function (error) {
    process.stderr.write(String((error && error.stack) || error) + "\n");
    process.exitCode = 1;
  });
