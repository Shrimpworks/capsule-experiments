import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const experiment = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(experiment, "fixtures");
const mode = process.argv[2] ?? "check";
const binding = {
  attempt: Buffer.alloc(16, 0x11),
  registration: Buffer.alloc(16, 0x22),
  plan: Buffer.alloc(32, 0x33),
  profile: Buffer.alloc(32, 0x44),
};
const source = Buffer.from(
  "globalThis.capsuleMain = function (input) { return {doubled: input.value * 2, echo: input.message}; };\n",
);
const input = Buffer.from('{"message":"capsule-c2a","value":21}');
const completion = Buffer.from('{"doubled":42,"echo":"capsule-c2a"}');
const sha256 = (bytes) => createHash("sha256").update(bytes).digest();

function dataFrame(magic, role, payload) {
  const frame = Buffer.alloc(152 + payload.length);
  frame.write(magic, 0, "ascii");
  frame.writeUInt16BE(1, 8);
  frame.writeUInt16BE(role, 10);
  frame.writeUInt32BE(152, 12);
  binding.attempt.copy(frame, 16);
  binding.registration.copy(frame, 32);
  binding.plan.copy(frame, 48);
  binding.profile.copy(frame, 80);
  frame.writeBigUInt64BE(BigInt(payload.length), 112);
  sha256(payload).copy(frame, 120);
  payload.copy(frame, 152);
  return frame;
}

function completionFrame(payload) {
  const headerAndPayload = Buffer.alloc(160 + payload.length);
  headerAndPayload.write("CAPCMP01", 0, "ascii");
  headerAndPayload.writeUInt16BE(1, 8);
  headerAndPayload.writeUInt16BE(3, 10);
  headerAndPayload.writeUInt32BE(160, 12);
  binding.attempt.copy(headerAndPayload, 16);
  binding.registration.copy(headerAndPayload, 32);
  binding.plan.copy(headerAndPayload, 48);
  binding.profile.copy(headerAndPayload, 80);
  headerAndPayload.writeBigUInt64BE(BigInt(payload.length), 112);
  sha256(payload).copy(headerAndPayload, 120);
  headerAndPayload.writeUInt16BE(1, 152);
  payload.copy(headerAndPayload, 160);
  const trailer = Buffer.alloc(64);
  trailer.write("CAPCMT01", 0, "ascii");
  trailer.writeUInt16BE(1, 8);
  trailer.writeUInt16BE(64, 10);
  trailer.writeUInt16BE(3, 12);
  binding.attempt.copy(trailer, 16);
  sha256(headerAndPayload).copy(trailer, 32);
  return Buffer.concat([headerAndPayload, trailer]);
}

const expected = new Map([
  ["source.frame", dataFrame("CAPSRC01", 1, source)],
  ["input.frame", dataFrame("CAPINP01", 2, input)],
  ["completion.frame", completionFrame(completion)],
]);

mkdirSync(fixtures, { recursive: true });
for (const [name, bytes] of expected) {
  const path = join(fixtures, name);
  if (mode === "write") {
    writeFileSync(path, bytes);
  } else if (!readFileSync(path).equals(bytes)) {
    throw new Error(`${name} differs from deterministic generator`);
  }
  console.log(`${name}.bytes=${bytes.length}`);
  console.log(`${name}.sha256=${sha256(bytes).toString("hex")}`);
}
