import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const layout = Object.freeze({
  sourcePayloadMax: 1_048_576,
  canonicalInputMax: 262_144,
  inlineJSONPayloadMax: 262_144,
  dataHeaderLength: 152,
  completionHeaderLength: 160,
  commitTrailerLength: 64,
  sourcePhysicalMax: 1_048_728,
  inputPhysicalMax: 262_296,
  completionPhysicalMax: 262_368,
});

export const roles = Object.freeze({ source: 1, input: 2, completion: 3 });
const status = Object.freeze({
  succeeded: 1,
  workloadFailed: 2,
  resultInvalid: 3,
  childTerminated: 4,
});
const magic = Object.freeze({
  1: Buffer.from("CAPSRC01"),
  2: Buffer.from("CAPINP01"),
  3: Buffer.from("CAPCMP01"),
  commit: Buffer.from("CAPCMT01"),
});
const version = 1;
const maximumSafeInteger = 9_007_199_254_740_991n;
const expectedBinding = Object.freeze({
  attemptId: Buffer.alloc(16, 0x11),
  registrationId: Buffer.alloc(16, 0x22),
  planDigest: Buffer.alloc(32, 0x33),
  runtimeProfileDigest: Buffer.alloc(32, 0x44),
});
const staleAttemptId = Buffer.alloc(16, 0x55);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest();
}

function physicalMaximum(role) {
  if (role === roles.source) return layout.sourcePhysicalMax;
  if (role === roles.input) return layout.inputPhysicalMax;
  if (role === roles.completion) return layout.completionPhysicalMax;
  return 0;
}

function payloadMaximum(role) {
  if (role === roles.source) return layout.sourcePayloadMax;
  if (role === roles.input) return layout.canonicalInputMax;
  if (role === roles.completion) return layout.inlineJSONPayloadMax;
  return 0;
}

function bindingFromHeader(bytes) {
  return {
    attemptId: bytes.subarray(16, 32),
    registrationId: bytes.subarray(32, 48),
    planDigest: bytes.subarray(48, 80),
    runtimeProfileDigest: bytes.subarray(80, 112),
  };
}

function validateBinding(actual) {
  if (
    actual.attemptId.equals(Buffer.alloc(16)) ||
    actual.registrationId.equals(Buffer.alloc(16)) ||
    actual.attemptId.equals(actual.registrationId)
  ) {
    return "DOMAIN";
  }
  if (actual.attemptId.equals(staleAttemptId)) return "STALE";
  for (const name of ["attemptId", "registrationId", "planDigest", "runtimeProfileDigest"]) {
    if (!actual[name].equals(expectedBinding[name])) return "BINDING";
  }
  return "ACCEPT";
}

function allZero(bytes) {
  return bytes.every((byte) => byte === 0);
}

function decodeLength(bytes, offset) {
  const value = bytes.readBigUInt64BE(offset);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : Number.MAX_SAFE_INTEGER + 1;
}

export function validateDataFrame(bytes, endpointRole, totalDrained = bytes.length) {
  if (endpointRole !== roles.source && endpointRole !== roles.input) return "DOMAIN";
  if (totalDrained > physicalMaximum(endpointRole)) return "OVERSIZE";
  if (bytes.length < layout.dataHeaderLength) return "TRUNCATED";
  if (!bytes.subarray(0, 8).equals(magic[endpointRole]) || bytes.readUInt16BE(10) !== endpointRole)
    return "DOMAIN";
  if (bytes.readUInt16BE(8) !== version || bytes.readUInt32BE(12) !== layout.dataHeaderLength)
    return "MALFORMED_HEADER";
  const payloadLength = decodeLength(bytes, 112);
  if (payloadLength > payloadMaximum(endpointRole)) return "OVERSIZE";
  const expectedLength = layout.dataHeaderLength + payloadLength;
  if (bytes.length < expectedLength) return "TRUNCATED";
  if (bytes.length > expectedLength) {
    return bytes.subarray(expectedLength, expectedLength + 8).equals(magic[endpointRole])
      ? "DUPLICATE_FRAME"
      : "TRAILING_DATA";
  }
  const bindingDisposition = validateBinding(bindingFromHeader(bytes));
  if (bindingDisposition !== "ACCEPT") return bindingDisposition;
  return sha256(bytes.subarray(layout.dataHeaderLength)).equals(bytes.subarray(120, 152))
    ? "ACCEPT"
    : "BAD_DIGEST";
}

export function validateCompletionFrame(bytes, totalDrained = bytes.length) {
  if (totalDrained > layout.completionPhysicalMax) return "OVERSIZE";
  if (bytes.length < layout.completionHeaderLength)
    return bytes.subarray(0, 8).equals(magic.commit) ? "EARLY_COMMIT" : "TRUNCATED";
  if (
    !bytes.subarray(0, 8).equals(magic[roles.completion]) ||
    bytes.readUInt16BE(10) !== roles.completion
  )
    return "DOMAIN";
  if (bytes.readUInt16BE(8) !== version || bytes.readUInt32BE(12) !== layout.completionHeaderLength)
    return "MALFORMED_HEADER";
  if (!allZero(bytes.subarray(154, 160))) return "MALFORMED_HEADER";
  const payloadLength = decodeLength(bytes, 112);
  if (payloadLength > layout.inlineJSONPayloadMax) return "OVERSIZE";
  const trailerOffset = layout.completionHeaderLength + payloadLength;
  const expectedLength = trailerOffset + layout.commitTrailerLength;
  if (bytes.length < trailerOffset)
    return bytes.indexOf(magic.commit, layout.completionHeaderLength) >= 0
      ? "EARLY_COMMIT"
      : "TRUNCATED";
  if (bytes.length < expectedLength) return "MISSING_COMMIT";
  if (bytes.length > expectedLength) {
    const extraMagic = bytes.subarray(expectedLength, expectedLength + 8);
    if (extraMagic.equals(magic.commit)) return "DUPLICATE_COMMIT";
    if (extraMagic.equals(magic[roles.completion])) return "DUPLICATE_FRAME";
    return "TRAILING_DATA";
  }
  const binding = bindingFromHeader(bytes);
  const bindingDisposition = validateBinding(binding);
  if (bindingDisposition !== "ACCEPT") return bindingDisposition;
  const terminalStatus = bytes.readUInt16BE(152);
  if (terminalStatus < status.succeeded || terminalStatus > status.childTerminated)
    return "MALFORMED_HEADER";
  const payload = bytes.subarray(layout.completionHeaderLength, trailerOffset);
  if (!sha256(payload).equals(bytes.subarray(120, 152))) return "BAD_DIGEST";
  if (!validInlineJSON(payload)) return "INVALID_JSON";
  if (terminalStatus !== status.succeeded && !payload.equals(Buffer.from("null")))
    return "INVALID_JSON";
  const trailer = bytes.subarray(trailerOffset);
  if (!trailer.subarray(0, 8).equals(magic.commit)) return "MISSING_COMMIT";
  if (
    trailer.readUInt16BE(8) !== version ||
    trailer.readUInt16BE(10) !== layout.commitTrailerLength ||
    trailer.readUInt16BE(12) !== roles.completion ||
    !allZero(trailer.subarray(14, 16))
  ) {
    return "MALFORMED_HEADER";
  }
  if (!trailer.subarray(16, 32).equals(binding.attemptId)) return "BINDING";
  return sha256(bytes.subarray(0, trailerOffset)).equals(trailer.subarray(32, 64))
    ? "ACCEPT"
    : "BAD_DIGEST";
}

class StrictJSONParser {
  constructor(text) {
    this.text = text;
    this.offset = 0;
    this.nodes = 0;
    this.members = 0;
    this.elements = 0;
  }

  parse() {
    this.skipWhitespace();
    this.value(1);
    this.skipWhitespace();
    if (this.offset !== this.text.length) throw new Error("trailing JSON data");
  }

  value(depth) {
    if (depth > 32 || ++this.nodes > 8193) throw new Error("JSON budget");
    const current = this.text[this.offset];
    if (current === '"') return this.string();
    if (current === "{") return this.object(depth);
    if (current === "[") return this.array(depth);
    if (current === "t") return this.literal("true");
    if (current === "f") return this.literal("false");
    if (current === "n") return this.literal("null");
    return this.integer();
  }

  object(depth) {
    const seen = new Set();
    let localMembers = 0;
    this.offset++;
    this.skipWhitespace();
    if (this.consume("}")) return;
    while (true) {
      if (this.text[this.offset] !== '"') throw new Error("object key");
      const key = this.string();
      if (seen.has(key)) throw new Error("duplicate key");
      seen.add(key);
      if (++localMembers > 256 || ++this.members > 4096) throw new Error("member budget");
      this.skipWhitespace();
      this.require(":");
      this.skipWhitespace();
      this.value(depth + 1);
      this.skipWhitespace();
      if (this.consume("}")) return;
      this.require(",");
      this.skipWhitespace();
    }
  }

  array(depth) {
    let localElements = 0;
    this.offset++;
    this.skipWhitespace();
    if (this.consume("]")) return;
    while (true) {
      if (++localElements > 256 || ++this.elements > 4096) throw new Error("element budget");
      this.value(depth + 1);
      this.skipWhitespace();
      if (this.consume("]")) return;
      this.require(",");
      this.skipWhitespace();
    }
  }

  string() {
    this.require('"');
    let decoded = "";
    while (this.offset < this.text.length) {
      const current = this.text[this.offset++];
      if (current === '"') return decoded;
      if (current.charCodeAt(0) < 0x20) throw new Error("control character");
      if (current !== "\\") {
        const code = current.charCodeAt(0);
        if (code >= 0xd800 && code <= 0xdfff) throw new Error("lone surrogate");
        decoded += current;
        continue;
      }
      const escapeCode = this.text[this.offset++];
      const simple = {
        '"': '"',
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
      };
      if (Object.hasOwn(simple, escapeCode)) {
        decoded += simple[escapeCode];
        continue;
      }
      if (escapeCode !== "u") throw new Error("escape");
      const first = this.hexCodeUnit();
      if (first >= 0xdc00 && first <= 0xdfff) throw new Error("lone low surrogate");
      if (first >= 0xd800 && first <= 0xdbff) {
        if (this.text.slice(this.offset, this.offset + 2) !== "\\u")
          throw new Error("lone high surrogate");
        this.offset += 2;
        const second = this.hexCodeUnit();
        if (second < 0xdc00 || second > 0xdfff) throw new Error("bad surrogate pair");
        decoded += String.fromCodePoint(0x10000 + ((first - 0xd800) << 10) + second - 0xdc00);
      } else {
        decoded += String.fromCharCode(first);
      }
    }
    throw new Error("unterminated string");
  }

  hexCodeUnit() {
    const hex = this.text.slice(this.offset, this.offset + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error("unicode escape");
    this.offset += 4;
    return Number.parseInt(hex, 16);
  }

  integer() {
    const match = /^-?(?:0|[1-9][0-9]*)/.exec(this.text.slice(this.offset));
    if (!match) throw new Error("number");
    const end = this.text[this.offset + match[0].length];
    if (end === "." || end === "e" || end === "E" || end === "+") throw new Error("non-integer");
    if (match[0] === "-0") throw new Error("negative zero");
    const value = BigInt(match[0]);
    if (value < -maximumSafeInteger || value > maximumSafeInteger)
      throw new Error("unsafe integer");
    this.offset += match[0].length;
  }

  literal(value) {
    if (this.text.slice(this.offset, this.offset + value.length) !== value)
      throw new Error("literal");
    this.offset += value.length;
  }

  skipWhitespace() {
    while (/[\t\n\r ]/.test(this.text[this.offset] ?? "x")) this.offset++;
  }

  consume(character) {
    if (this.text[this.offset] !== character) return false;
    this.offset++;
    return true;
  }

  require(character) {
    if (!this.consume(character)) throw new Error(`expected ${character}`);
  }
}

export function validInlineJSON(bytes) {
  if (
    bytes.length === 0 ||
    bytes.length > layout.inlineJSONPayloadMax ||
    bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
  )
    return false;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    new StrictJSONParser(text).parse();
    return true;
  } catch {
    return false;
  }
}

function encodeData(role, payload) {
  assert.ok(role === roles.source || role === roles.input);
  assert.ok(payload.length <= payloadMaximum(role));
  const frame = Buffer.alloc(layout.dataHeaderLength + payload.length);
  magic[role].copy(frame, 0);
  frame.writeUInt16BE(version, 8);
  frame.writeUInt16BE(role, 10);
  frame.writeUInt32BE(layout.dataHeaderLength, 12);
  expectedBinding.attemptId.copy(frame, 16);
  expectedBinding.registrationId.copy(frame, 32);
  expectedBinding.planDigest.copy(frame, 48);
  expectedBinding.runtimeProfileDigest.copy(frame, 80);
  frame.writeBigUInt64BE(BigInt(payload.length), 112);
  sha256(payload).copy(frame, 120);
  payload.copy(frame, layout.dataHeaderLength);
  return frame;
}

function encodeCompletion(payload) {
  assert.ok(payload.length <= layout.inlineJSONPayloadMax);
  const frame = Buffer.alloc(
    layout.completionHeaderLength + payload.length + layout.commitTrailerLength,
  );
  magic[roles.completion].copy(frame, 0);
  frame.writeUInt16BE(version, 8);
  frame.writeUInt16BE(roles.completion, 10);
  frame.writeUInt32BE(layout.completionHeaderLength, 12);
  expectedBinding.attemptId.copy(frame, 16);
  expectedBinding.registrationId.copy(frame, 32);
  expectedBinding.planDigest.copy(frame, 48);
  expectedBinding.runtimeProfileDigest.copy(frame, 80);
  frame.writeBigUInt64BE(BigInt(payload.length), 112);
  sha256(payload).copy(frame, 120);
  frame.writeUInt16BE(status.succeeded, 152);
  payload.copy(frame, layout.completionHeaderLength);
  const trailerOffset = layout.completionHeaderLength + payload.length;
  magic.commit.copy(frame, trailerOffset);
  frame.writeUInt16BE(version, trailerOffset + 8);
  frame.writeUInt16BE(layout.commitTrailerLength, trailerOffset + 10);
  frame.writeUInt16BE(roles.completion, trailerOffset + 12);
  expectedBinding.attemptId.copy(frame, trailerOffset + 16);
  sha256(frame.subarray(0, trailerOffset)).copy(frame, trailerOffset + 32);
  return frame;
}

export async function loadCorpus(experimentRoot) {
  const manifestPath = path.join(experimentRoot, "fixtures", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.version, version);
  assert.deepEqual(manifest.layout, layout);
  assert.equal(manifest.cases.length, 43);
  assert.deepEqual(manifest.bindingHex, {
    attemptId: expectedBinding.attemptId.toString("hex"),
    planDigest: expectedBinding.planDigest.toString("hex"),
    registrationId: expectedBinding.registrationId.toString("hex"),
    runtimeProfileDigest: expectedBinding.runtimeProfileDigest.toString("hex"),
  });
  const cases = new Map();
  for (const record of manifest.cases) {
    assert.equal(record.file, `cases/${record.name}.bin`);
    const bytes = await readFile(path.join(experimentRoot, "fixtures", record.file));
    assert.equal(bytes.length, record.bytes, `${record.name} byte length`);
    assert.equal(sha256(bytes).toString("hex"), record.sha256, `${record.name} SHA-256`);
    const disposition =
      record.endpointRole === roles.completion
        ? validateCompletionFrame(bytes)
        : validateDataFrame(bytes, record.endpointRole);
    assert.equal(disposition, record.expectedDisposition, `${record.name} disposition`);
    const ordinarySuccess =
      disposition === "ACCEPT" &&
      record.endpointRole === roles.completion &&
      record.runnerLifecycle === "clean-exit";
    assert.equal(
      ordinarySuccess,
      record.expectedOrdinarySuccess,
      `${record.name} ordinary success`,
    );
    cases.set(record.name, { ...record, bytes });
  }
  assert.equal(cases.size, 43);
  return { manifest, cases };
}

export async function verifyRetainedCorpus(experimentRoot) {
  const corpus = await loadCorpus(experimentRoot);
  const knownAnswers = [
    ["source-small-accept", encodeData(roles.source, Buffer.from("export default 1;\n"))],
    ["source-payload-exact", encodeData(roles.source, Buffer.alloc(layout.sourcePayloadMax, "s"))],
    ["input-small-accept", encodeData(roles.input, Buffer.from('{"value":1}'))],
    ["input-payload-exact", encodeData(roles.input, Buffer.alloc(layout.canonicalInputMax, "i"))],
    ["completion-small-accept", encodeCompletion(Buffer.from('{"value":1}'))],
    [
      "completion-json-exact",
      encodeCompletion(
        Buffer.concat([
          Buffer.from('"'),
          Buffer.alloc(layout.inlineJSONPayloadMax - 2, "j"),
          Buffer.from('"'),
        ]),
      ),
    ],
  ];
  for (const [name, independentlyEncoded] of knownAnswers) {
    assert.deepEqual(
      independentlyEncoded,
      corpus.cases.get(name).bytes,
      `${name} independent encoding`,
    );
  }
  return {
    cases: corpus.cases.size,
    independentlyEncodedKnownAnswers: knownAnswers.length,
    caps: layout,
  };
}

export async function drainReadable(
  readable,
  cap,
  { timeoutMs = 2_000, onTimeout = () => {} } = {},
) {
  let drainedBytes = 0;
  let retained = Buffer.alloc(0);
  let timedOut = false;
  let readerDied = false;
  const timer = setTimeout(() => {
    timedOut = true;
    onTimeout();
    readable.destroy(new Error("bounded reader stall"));
  }, timeoutMs);
  try {
    for await (const chunk of readable) {
      drainedBytes += chunk.length;
      if (retained.length < cap + 1)
        retained = Buffer.concat([retained, chunk.subarray(0, cap + 1 - retained.length)]);
    }
  } catch {
    if (!timedOut) readerDied = true;
  } finally {
    clearTimeout(timer);
  }
  return {
    retained,
    drainedBytes,
    retainedBytes: retained.length,
    disposition: timedOut ? "READER_STALL" : readerDied ? "READER_DIED" : "ACCEPT",
  };
}

export function observeCompletion(drain, runnerClean) {
  const frameDisposition =
    drain.disposition === "ACCEPT"
      ? validateCompletionFrame(drain.retained, drain.drainedBytes)
      : drain.disposition;
  return {
    frameDisposition,
    committed: frameDisposition === "ACCEPT",
    ordinarySuccess: frameDisposition === "ACCEPT" && runnerClean,
  };
}

export function rolePhysicalMaximum(role) {
  return physicalMaximum(role);
}

async function main() {
  const experimentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.stdout.write(`${JSON.stringify(await verifyRetainedCorpus(experimentRoot), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
