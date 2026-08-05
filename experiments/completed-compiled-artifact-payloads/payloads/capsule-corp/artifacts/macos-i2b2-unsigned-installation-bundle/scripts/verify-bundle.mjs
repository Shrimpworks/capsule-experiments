#!/usr/bin/env node
import { resolve } from "node:path";
import { verifyBundle } from "./i2b2-lib.mjs";

if (process.argv.length < 3 || process.argv.length > 4) {
  throw new Error("usage: verify-bundle.mjs <Capsule.app> [expected-manifest-sha256]");
}
process.stdout.write(
  `${JSON.stringify(await verifyBundle({ bundleRoot: resolve(process.argv[2]), expectedManifestSha256: process.argv[3] ?? "" }), null, 2)}\n`,
);
