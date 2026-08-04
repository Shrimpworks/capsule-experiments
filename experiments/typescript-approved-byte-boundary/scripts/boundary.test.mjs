import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BoundaryRefusal,
  createRecord,
  loadExactOptions,
  loadTransformerProfile,
  MAX_EMITTED_FILE_BYTES,
  MAX_SOURCE_AGGREGATE_BYTES,
  MAX_SOURCE_FILE_BYTES,
  sha256,
  transformExactBundle,
  transformExactSource,
  verifyRecord,
} from "./boundary.mjs";

const experiment = fileURLToPath(new URL("..", import.meta.url));
const optionsPath = join(experiment, "options.json");
const transformerPath = join(experiment, "transformer-profile.json");
const ordinaryPath = join(experiment, "fixtures", "ordinary.ts");
const diagnosticPath = join(experiment, "fixtures", "diagnostic.ts");
const nonErasablePath = join(experiment, "fixtures", "non-erasable.ts");
const cliPath = join(experiment, "scripts", "transform.mjs");

const options = loadExactOptions(optionsPath);
const transformer = loadTransformerProfile(transformerPath);

function expectRefusal(code, operation) {
  assert.throws(operation, (error) => error instanceof BoundaryRefusal && error.code === code);
}

test("repeated same-process emission is byte-identical", () => {
  const sourceBytes = readFileSync(ordinaryPath);
  const expected = transformExactSource(sourceBytes);
  for (let index = 0; index < 20; index += 1) {
    assert.deepEqual(transformExactSource(sourceBytes), expected);
  }
  assert.equal(expected.length, sourceBytes.length);
  assert.equal(
    sha256(expected),
    "f91911dd606409fed94c214381533f5ece3e2ae23ea861a3a55192cefad884cd",
  );
});

test("separate processes emit the same exact bytes and record", () => {
  const outputs = [];
  const records = [];
  for (let index = 0; index < 3; index += 1) {
    const directory = mkdtempSync(join(tmpdir(), "capsule-ts-process-"));
    try {
      const output = join(directory, "ordinary.js");
      const record = join(directory, "record.json");
      execFileSync(
        process.execPath,
        [
          cliPath,
          "emit",
          "--source",
          ordinaryPath,
          "--output",
          output,
          "--record",
          record,
          "--options",
          optionsPath,
          "--transformer",
          transformerPath,
        ],
        { env: { ...process.env, NODE_NO_WARNINGS: "1" } },
      );
      outputs.push(readFileSync(output));
      records.push(readFileSync(record));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  assert.deepEqual(outputs[0], outputs[1]);
  assert.deepEqual(outputs[1], outputs[2]);
  assert.deepEqual(records[0], records[1]);
  assert.deepEqual(records[1], records[2]);
});

test("Unicode scalar bytes and line endings are preserved without normalization", () => {
  const lf = Buffer.from('const composed = "é";\nconst decomposed = "é";\n', "utf8");
  const crlf = Buffer.from('const composed = "é";\r\nconst decomposed = "é";\r\n', "utf8");
  const lfOutput = transformExactSource(lf);
  const crlfOutput = transformExactSource(crlf);
  assert.deepEqual(lfOutput, lf);
  assert.deepEqual(crlfOutput, crlf);
  assert.notEqual(sha256(lf), sha256(crlf));
  assert.notEqual(sha256(lfOutput), sha256(crlfOutput));
  assert.notEqual(sha256(Buffer.from("é")), sha256(Buffer.from("é")));
});

test("file, aggregate, and file-count maxima are inclusive and cap-plus-one refuses", () => {
  const prefix = Buffer.from("const exact: number = 1;\n");
  const exact = Buffer.concat([prefix, Buffer.alloc(MAX_SOURCE_FILE_BYTES - prefix.length, 0x20)]);
  const exactOutput = transformExactSource(exact);
  assert.equal(exact.length, MAX_SOURCE_FILE_BYTES);
  assert.equal(exactOutput.length, MAX_EMITTED_FILE_BYTES);
  expectRefusal("SOURCE_CAP", () => transformExactSource(Buffer.concat([exact, Buffer.from(" ")])));

  const quarter = Buffer.alloc(MAX_SOURCE_AGGREGATE_BYTES / 4, 0x20);
  const bundle = transformExactBundle([quarter, quarter, quarter, quarter]);
  assert.equal(
    bundle.reduce((total, item) => total + item.length, 0),
    MAX_SOURCE_AGGREGATE_BYTES,
  );
  expectRefusal("SOURCE_AGGREGATE_CAP", () =>
    transformExactBundle([quarter, quarter, quarter, quarter, Buffer.from(" ")]),
  );
  expectRefusal("SOURCE_COUNT", () =>
    transformExactBundle(Array.from({ length: 33 }, () => Buffer.alloc(0))),
  );
});

test("malformed and transform-requiring TypeScript refuses without a success record", () => {
  expectRefusal("DIAGNOSTIC", () => transformExactSource(readFileSync(diagnosticPath)));
  expectRefusal("DIAGNOSTIC", () => transformExactSource(readFileSync(nonErasablePath)));
  expectRefusal("SOURCE_UTF8", () => transformExactSource(Buffer.from([0xc3, 0x28])));
  expectRefusal("SOURCE_BOM", () => transformExactSource(Buffer.from([0xef, 0xbb, 0xbf, 0x20])));
});

test("unknown or changed options and transformer identities refuse", () => {
  const directory = mkdtempSync(join(tmpdir(), "capsule-ts-options-"));
  try {
    const changedOptions = join(directory, "options.json");
    const changedTransformer = join(directory, "transformer.json");
    writeFileSync(changedOptions, `${JSON.stringify({ ...options.value, unknown: true })}\n`);
    writeFileSync(
      changedTransformer,
      `${JSON.stringify({ ...transformer.value, amaroVersion: "1.1.6" }, null, 2)}\n`,
    );
    expectRefusal("OPTIONS", () => loadExactOptions(changedOptions));
    expectRefusal("TRANSFORMER", () => loadTransformerProfile(changedTransformer));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("source, emitted output, options, transformer, source-map, and diagnostics mutations refuse", () => {
  const sourceBytes = readFileSync(ordinaryPath);
  const emittedBytes = transformExactSource(sourceBytes);
  const record = createRecord({ sourceBytes, emittedBytes, options, transformer });
  assert.equal(verifyRecord({ record, sourceBytes, emittedBytes, options, transformer }), true);

  expectRefusal("SOURCE_BINDING", () =>
    verifyRecord({
      record,
      sourceBytes: Buffer.concat([sourceBytes, Buffer.from(" ")]),
      emittedBytes,
      options,
      transformer,
    }),
  );
  expectRefusal("EMITTED_BINDING", () => {
    const changed = Buffer.from(emittedBytes);
    changed[0] ^= 1;
    verifyRecord({ record, sourceBytes, emittedBytes: changed, options, transformer });
  });
  expectRefusal("EMITTED_CAP", () =>
    verifyRecord({
      record,
      sourceBytes,
      emittedBytes: Buffer.alloc(MAX_EMITTED_FILE_BYTES + 1),
      options,
      transformer,
    }),
  );

  for (const [change, code] of [
    [(value) => (value.options.digest = "00".repeat(32)), "OPTIONS_BINDING"],
    [(value) => (value.transformer.nodeVersion = "22.22.2"), "TRANSFORMER_BINDING"],
    [(value) => (value.sourceMap.disposition = "separate"), "SOURCE_MAP_BINDING"],
    [(value) => (value.diagnostics.count = 1), "DIAGNOSTICS_BINDING"],
  ]) {
    const changedRecord = structuredClone(record);
    change(changedRecord);
    expectRefusal(code, () =>
      verifyRecord({ record: changedRecord, sourceBytes, emittedBytes, options, transformer }),
    );
  }
});
