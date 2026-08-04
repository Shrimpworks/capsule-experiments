#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import {
  BoundaryRefusal,
  createRecord,
  loadExactOptions,
  loadTransformerProfile,
  transformExactSource,
  verifyRecord,
} from "./boundary.mjs";

function parseArguments(argv) {
  const command = argv.shift();
  const values = {};
  while (argv.length > 0) {
    const name = argv.shift();
    const value = argv.shift();
    if (!name?.startsWith("--") || value === undefined || name in values) {
      throw new BoundaryRefusal("ARGUMENTS");
    }
    values[name] = value;
  }
  const allowed =
    command === "emit"
      ? ["--source", "--output", "--record", "--options", "--transformer"]
      : command === "verify"
        ? ["--source", "--output", "--record", "--options", "--transformer"]
        : [];
  if (allowed.length === 0 || Object.keys(values).sort().join("\0") !== allowed.sort().join("\0")) {
    throw new BoundaryRefusal("ARGUMENTS");
  }
  return { command, values };
}

try {
  const { command, values } = parseArguments(process.argv.slice(2));
  const sourceBytes = readFileSync(values["--source"]);
  const options = loadExactOptions(values["--options"]);
  const transformer = loadTransformerProfile(values["--transformer"]);
  if (command === "emit") {
    const emittedBytes = transformExactSource(sourceBytes);
    const record = createRecord({ sourceBytes, emittedBytes, options, transformer });
    writeFileSync(values["--output"], emittedBytes, { flag: "wx" });
    writeFileSync(values["--record"], `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  } else {
    const emittedBytes = readFileSync(values["--output"]);
    const record = JSON.parse(readFileSync(values["--record"], "utf8"));
    verifyRecord({ record, sourceBytes, emittedBytes, options, transformer });
  }
} catch (error) {
  const code = error instanceof BoundaryRefusal ? error.code : "LOCAL_FAILURE";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
