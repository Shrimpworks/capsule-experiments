import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

export const MAX_SOURCE_FILE_BYTES = 262_144;
export const MAX_EMITTED_FILE_BYTES = 262_144;
export const MAX_SOURCE_AGGREGATE_BYTES = 1_048_576;
export const MAX_EMITTED_AGGREGATE_BYTES = 1_048_576;
export const MAX_SOURCE_FILES = 32;

export const EXPECTED_OPTIONS = Object.freeze({
  diagnostics: "reject-any",
  inputMediaType: "application/capsule.typescript-source;v=0;module=esm",
  mode: "strip",
  outputMediaType: "application/capsule.javascript-source;v=0;module=esm",
  sourceMap: "absent",
  sourceUrl: "absent",
});

export const EXPECTED_OPTIONS_BYTES = Buffer.from(`${JSON.stringify(EXPECTED_OPTIONS)}\n`);
export const EXPECTED_TRANSFORMER_PROFILE_SHA256 =
  "3bc25a01c3059776070a5354e7c6560d06f031ef0336c6a96d34c41f5577aec5";

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export class BoundaryRefusal extends Error {
  constructor(code) {
    super(code);
    this.name = "BoundaryRefusal";
    this.code = code;
  }
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function refuseUnless(condition, code) {
  if (!condition) {
    throw new BoundaryRefusal(code);
  }
}

export function loadExactOptions(path) {
  const bytes = readFileSync(path);
  refuseUnless(bytes.equals(EXPECTED_OPTIONS_BYTES), "OPTIONS");
  return { bytes, digest: sha256(bytes), value: EXPECTED_OPTIONS };
}

export function loadTransformerProfile(path) {
  const bytes = readFileSync(path);
  refuseUnless(sha256(bytes) === EXPECTED_TRANSFORMER_PROFILE_SHA256, "TRANSFORMER");
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new BoundaryRefusal("TRANSFORMER");
  }
  const expectedKeys = [
    "amaroVersion",
    "distribution",
    "executableSha256",
    "nodeVersion",
    "objectType",
    "objectVersion",
    "sourceArchive",
    "transformer",
  ];
  refuseUnless(
    Object.keys(value).sort().join("\0") === expectedKeys.join("\0") &&
      value.objectType === "capsule.typescript-transformer-profile" &&
      value.objectVersion === 0 &&
      value.transformer === "node:module.stripTypeScriptTypes" &&
      value.nodeVersion === "22.22.1" &&
      value.amaroVersion === "1.1.5" &&
      value.sourceArchive?.sha256 ===
        "87104b07e7acee748bcc5391e1bc69cf3571caa0fdfb8b1d6b5fd3f9599b7849" &&
      value.distribution?.platform === "darwin" &&
      value.distribution?.architecture === "arm64" &&
      value.distribution?.sha256 ===
        "261da057fb25ff2912dd6abb7842fc915ddf7947a2cb3c8cce90875d2b9bb667" &&
      value.executableSha256 === "245e0321af97d3c21dd4e7104457334dfe3c3ba7982d0db75363e354565f8cbb",
    "TRANSFORMER",
  );
  refuseUnless(
    process.version === "v22.22.1" &&
      process.versions.amaro === "1.1.5" &&
      process.platform === "darwin" &&
      process.arch === "arm64" &&
      sha256(readFileSync(process.execPath)) === value.executableSha256,
    "TOOLCHAIN",
  );
  return { bytes, digest: sha256(bytes), value };
}

export function transformExactSource(sourceBytes) {
  refuseUnless(sourceBytes.length <= MAX_SOURCE_FILE_BYTES, "SOURCE_CAP");
  refuseUnless(
    !(sourceBytes[0] === 0xef && sourceBytes[1] === 0xbb && sourceBytes[2] === 0xbf),
    "SOURCE_BOM",
  );
  let source;
  try {
    source = decoder.decode(sourceBytes);
  } catch {
    throw new BoundaryRefusal("SOURCE_UTF8");
  }

  let emitted;
  try {
    emitted = stripTypeScriptTypes(source, { mode: "strip" });
  } catch {
    throw new BoundaryRefusal("DIAGNOSTIC");
  }
  const emittedBytes = Buffer.from(emitted, "utf8");
  refuseUnless(emittedBytes.length <= MAX_EMITTED_FILE_BYTES, "EMITTED_CAP");
  return emittedBytes;
}

export function transformExactBundle(sources) {
  refuseUnless(sources.length <= MAX_SOURCE_FILES, "SOURCE_COUNT");
  const sourceBytes = sources.reduce((total, source) => total + source.length, 0);
  refuseUnless(sourceBytes <= MAX_SOURCE_AGGREGATE_BYTES, "SOURCE_AGGREGATE_CAP");
  const emitted = sources.map(transformExactSource);
  const emittedBytes = emitted.reduce((total, source) => total + source.length, 0);
  refuseUnless(emittedBytes <= MAX_EMITTED_AGGREGATE_BYTES, "EMITTED_AGGREGATE_CAP");
  return emitted;
}

export function createRecord({ sourceBytes, emittedBytes, options, transformer }) {
  return {
    schema: "capsule.typescript-transformation-record.v0",
    transformer: {
      identity: transformer.digest,
      nodeVersion: transformer.value.nodeVersion,
      amaroVersion: transformer.value.amaroVersion,
      sourceArchiveSha256: transformer.value.sourceArchive.sha256,
      distributionSha256: transformer.value.distribution.sha256,
      executableSha256: transformer.value.executableSha256,
    },
    options: {
      digest: options.digest,
      inputMediaType: options.value.inputMediaType,
      outputMediaType: options.value.outputMediaType,
      mode: options.value.mode,
    },
    source: {
      bytes: sourceBytes.length,
      sha256: sha256(sourceBytes),
    },
    emitted: {
      bytes: emittedBytes.length,
      sha256: sha256(emittedBytes),
    },
    sourceMap: { disposition: "absent" },
    diagnostics: { policy: "reject-any", count: 0 },
  };
}

export function verifyRecord({ record, sourceBytes, emittedBytes, options, transformer }) {
  refuseUnless(record.schema === "capsule.typescript-transformation-record.v0", "RECORD");
  refuseUnless(sourceBytes.length <= MAX_SOURCE_FILE_BYTES, "SOURCE_CAP");
  refuseUnless(emittedBytes.length <= MAX_EMITTED_FILE_BYTES, "EMITTED_CAP");
  refuseUnless(record.source?.bytes === sourceBytes.length, "SOURCE_BINDING");
  refuseUnless(record.source?.sha256 === sha256(sourceBytes), "SOURCE_BINDING");
  refuseUnless(record.emitted?.bytes === emittedBytes.length, "EMITTED_BINDING");
  refuseUnless(record.emitted?.sha256 === sha256(emittedBytes), "EMITTED_BINDING");
  refuseUnless(record.options?.digest === options.digest, "OPTIONS_BINDING");
  refuseUnless(record.options?.inputMediaType === options.value.inputMediaType, "OPTIONS_BINDING");
  refuseUnless(
    record.options?.outputMediaType === options.value.outputMediaType,
    "OPTIONS_BINDING",
  );
  refuseUnless(record.options?.mode === "strip", "OPTIONS_BINDING");
  refuseUnless(record.transformer?.identity === transformer.digest, "TRANSFORMER_BINDING");
  refuseUnless(record.transformer?.nodeVersion === "22.22.1", "TRANSFORMER_BINDING");
  refuseUnless(record.transformer?.amaroVersion === "1.1.5", "TRANSFORMER_BINDING");
  refuseUnless(
    record.transformer?.sourceArchiveSha256 === transformer.value.sourceArchive.sha256,
    "TRANSFORMER_BINDING",
  );
  refuseUnless(
    record.transformer?.distributionSha256 === transformer.value.distribution.sha256,
    "TRANSFORMER_BINDING",
  );
  refuseUnless(
    record.transformer?.executableSha256 === transformer.value.executableSha256,
    "TRANSFORMER_BINDING",
  );
  refuseUnless(record.sourceMap?.disposition === "absent", "SOURCE_MAP_BINDING");
  refuseUnless(record.diagnostics?.policy === "reject-any", "DIAGNOSTICS_BINDING");
  refuseUnless(record.diagnostics?.count === 0, "DIAGNOSTICS_BINDING");
  return true;
}
