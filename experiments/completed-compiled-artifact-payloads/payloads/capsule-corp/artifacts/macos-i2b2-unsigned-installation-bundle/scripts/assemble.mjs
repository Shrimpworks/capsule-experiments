#!/usr/bin/env node
import { resolve } from "node:path";
import { assembleBundle } from "./i2b2-lib.mjs";

if (process.argv.length !== 3) throw new Error("usage: assemble.mjs <output-Capsule.app>");
process.stdout.write(
  `${JSON.stringify(await assembleBundle({ bundleRoot: resolve(process.argv[2]) }), null, 2)}\n`,
);
