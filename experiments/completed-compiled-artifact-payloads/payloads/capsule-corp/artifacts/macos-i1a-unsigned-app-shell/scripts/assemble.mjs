#!/usr/bin/env node
import { resolve } from "node:path";
import { assembleBundle } from "./i1a-lib.mjs";

if (process.argv.length !== 4) {
  throw new Error("usage: assemble.mjs <swift-broker-executable> <output-Capsule.app>");
}

const result = await assembleBundle({
  brokerExecutable: resolve(process.argv[2]),
  bundleRoot: resolve(process.argv[3]),
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
