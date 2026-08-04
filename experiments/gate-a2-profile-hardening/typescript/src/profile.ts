import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { decode, encode, Tag } from "cbor2";

export type Kind = "approval-grant" | "enforcement-transcript";

const COSE_SIGN1_TAG = 18;
const ES256 = -7;
const MAX_ENVELOPE_BYTES = 4096;
const MAX_PROTECTED_BYTES = 256;
const MAX_PAYLOAD_BYTES = 2048;
const MAX_KEY_ID_BYTES = 64;
const MAX_TEXT_BYTES = 96;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const P256_N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");

const privateKey = createPrivateKey({
  key: {
    kty: "EC",
    crv: "P-256",
    x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
    y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
    d: "jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI",
  },
  format: "jwk",
});
const publicKey = createPublicKey(privateKey);

export function expectedPayload(kind: Kind): Map<number, unknown> {
  if (kind === "approval-grant") {
    return new Map<number, unknown>([
      [1, "capsule.approval-grant"],
      [2, 0],
      [3, repeated(0x11, 16)],
      [4, repeated(0x22, 32)],
      [5, repeated(0x33, 16)],
      [6, repeated(0x44, 32)],
      [7, repeated(0x55, 16)],
      [8, repeated(0x66, 16)],
      [9, "capsule.plan.approve"],
      [10, "capsule.execution-supervisor"],
      [11, 1_785_456_000],
      [12, 1_785_456_300],
    ]);
  }
  return new Map<number, unknown>([
    [1, "capsule.enforcement-transcript"],
    [2, 0],
    [3, repeated(0x11, 16)],
    [4, repeated(0x22, 32)],
    [5, repeated(0x33, 16)],
    [6, repeated(0x77, 16)],
    [7, repeated(0x44, 32)],
    [8, repeated(0x88, 32)],
    [9, "capsule.execution.attest"],
    [10, "capsule.receipt-composer"],
    [11, "completed"],
    [12, "destroyed"],
    [13, 1_785_456_360],
  ]);
}

function contentType(kind: Kind): string {
  return kind === "approval-grant"
    ? "application/capsule.approval-grant+cbor;v=0"
    : "application/capsule.enforcement-transcript+cbor;v=0";
}

function keyID(kind: Kind): Uint8Array {
  return text(kind === "approval-grant" ? "approval-test-key" : "supervisor-test-key");
}

export function payloadBytes(kind: Kind): Uint8Array {
  return encodeProfile(expectedPayload(kind));
}

export function protectedBytes(kind: Kind): Uint8Array {
  return encodeProfile(
    new Map<number, unknown>([
      [1, ES256],
      [3, contentType(kind)],
      [4, keyID(kind)],
    ]),
  );
}

export function signEnvelope(kind: Kind): Uint8Array {
  const protectedHeader = protectedBytes(kind);
  const payload = payloadBytes(kind);
  const signatureInput = encodeProfile([
    "Signature1",
    plain(protectedHeader),
    new Uint8Array(),
    plain(payload),
  ]);
  const signature = new Uint8Array(
    cryptoSign("sha256", signatureInput, { key: privateKey, dsaEncoding: "ieee-p1363" }),
  );
  if (signature.byteLength !== 64) throw new Error("Node did not produce raw ES256");
  return encodeProfile(new Tag(COSE_SIGN1_TAG, [protectedHeader, new Map(), payload, signature]));
}

export function verifyEnvelope(kind: Kind, wire: Uint8Array): void {
  if (wire.byteLength === 0 || wire.byteLength > MAX_ENVELOPE_BYTES) {
    throw new Error("envelope byte bound exceeded");
  }
  const decoded = decodeProfile(wire);
  if (!(decoded instanceof Tag) || decoded.tag !== COSE_SIGN1_TAG)
    throw new Error("expected tag 18");
  if (!equal(encodeProfile(normalize(decoded)), wire)) throw new Error("noncanonical envelope");
  if (!Array.isArray(decoded.contents) || decoded.contents.length !== 4)
    throw new Error("wrong body shape");
  const [protectedHeader, unprotected, payload, signature] = decoded.contents;
  assertBytes(protectedHeader, "protected");
  assertBytes(payload, "payload");
  assertBytes(signature, "signature");
  if (protectedHeader.byteLength === 0 || protectedHeader.byteLength > MAX_PROTECTED_BYTES)
    throw new Error("protected byte bound exceeded");
  if (payload.byteLength === 0 || payload.byteLength > MAX_PAYLOAD_BYTES)
    throw new Error("payload byte bound exceeded");
  if (!(unprotected instanceof Map) || unprotected.size !== 0)
    throw new Error("unprotected headers forbidden");
  if (signature.byteLength !== 64) throw new Error("signature must be 64 bytes");
  validateProtected(kind, protectedHeader);
  validatePayload(kind, payload);
  const r = bytesToBigInt(signature.subarray(0, 32));
  const s = bytesToBigInt(signature.subarray(32));
  if (r <= 0n || r >= P256_N || s <= 0n || s >= P256_N) throw new Error("invalid signature scalar");
  const signatureInput = encodeProfile([
    "Signature1",
    plain(protectedHeader),
    new Uint8Array(),
    plain(payload),
  ]);
  if (
    !cryptoVerify(
      "sha256",
      signatureInput,
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      plain(signature),
    )
  ) {
    throw new Error("signature verification failed");
  }
}

function validateProtected(kind: Kind, raw: Uint8Array): void {
  const value = decodeProfile(raw);
  assertExactIntegerMap(value, [1, 3, 4], "protected");
  if (!equal(encodeProfile(normalize(value)), raw))
    throw new Error("noncanonical protected headers");
  const algorithm = value.get(1);
  const type = value.get(3);
  const kid = value.get(4);
  assertBytes(kid, "kid");
  if (algorithm !== ES256 || type !== contentType(kind) || !equal(kid, keyID(kind)))
    throw new Error("protected confusion");
  if (
    typeof type !== "string" ||
    text(type).byteLength > MAX_TEXT_BYTES ||
    kid.byteLength === 0 ||
    kid.byteLength > MAX_KEY_ID_BYTES
  ) {
    throw new Error("protected resource bound exceeded");
  }
}

function validatePayload(kind: Kind, raw: Uint8Array): void {
  const value = decodeProfile(raw);
  const keys =
    kind === "approval-grant"
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  assertExactIntegerMap(value, keys, "payload");
  if (!equal(encodeProfile(normalize(value)), raw)) throw new Error("noncanonical payload");
  if (kind === "approval-grant") validateApprovalShape(value);
  else validateTranscriptShape(value);
  if (!deepEqual(value, expectedPayload(kind))) throw new Error("payload binding mismatch");
}

function validateApprovalShape(value: Map<number, unknown>): void {
  if (
    value.get(1) !== "capsule.approval-grant" ||
    value.get(2) !== 0 ||
    value.get(9) !== "capsule.plan.approve" ||
    value.get(10) !== "capsule.execution-supervisor"
  )
    throw new Error("approval type/purpose confusion");
  for (const [key, size] of [
    [3, 16],
    [4, 32],
    [5, 16],
    [6, 32],
    [7, 16],
    [8, 16],
  ] as const) {
    const field = value.get(key);
    assertBytes(field, `field ${key}`);
    if (field.byteLength !== size) throw new Error("approval identifier length");
  }
  const issued = value.get(11);
  const expires = value.get(12);
  if (!safeUnsigned(issued) || !safeUnsigned(expires) || expires <= issued)
    throw new Error("approval time bound");
}

function validateTranscriptShape(value: Map<number, unknown>): void {
  if (
    value.get(1) !== "capsule.enforcement-transcript" ||
    value.get(2) !== 0 ||
    value.get(9) !== "capsule.execution.attest" ||
    value.get(10) !== "capsule.receipt-composer"
  )
    throw new Error("transcript type/purpose confusion");
  for (const [key, size] of [
    [3, 16],
    [4, 32],
    [5, 16],
    [6, 16],
    [7, 32],
    [8, 32],
  ] as const) {
    const field = value.get(key);
    assertBytes(field, `field ${key}`);
    if (field.byteLength !== size) throw new Error("transcript identifier length");
  }
  if (
    value.get(11) !== "completed" ||
    value.get(12) !== "destroyed" ||
    !safeUnsigned(value.get(13))
  )
    throw new Error("transcript state/time");
}

function encodeProfile(value: unknown): Uint8Array {
  return encode(value, {
    cde: true,
    rejectDuplicateKeys: true,
    rejectFloats: true,
    rejectUndefined: true,
  });
}

function decodeProfile(value: Uint8Array): unknown {
  return decode(value, {
    cde: true,
    ignoreGlobalTags: true,
    maxDepth: 12,
    preferMap: true,
    rejectBigInts: true,
    rejectDuplicateKeys: true,
    rejectFloats: true,
    rejectStreaming: true,
    rejectUndefined: true,
  });
}

function assertExactIntegerMap(
  value: unknown,
  keys: number[],
  label: string,
): asserts value is Map<number, unknown> {
  if (!(value instanceof Map) || value.size !== keys.length) throw new Error(`${label} map size`);
  const got = [...value.keys()];
  if (got.some((key) => typeof key !== "number") || got.some((key, index) => key !== keys[index]))
    throw new Error(`${label} keys`);
}

function safeUnsigned(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_SAFE
  );
}
function assertBytes(value: unknown, label: string): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error(`${label} must be bytes`);
}
function repeated(value: number, count: number): Uint8Array {
  return new Uint8Array(count).fill(value);
}
function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
function plain(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}
function equal(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}
function bytesToBigInt(value: Uint8Array): bigint {
  return BigInt(`0x${Buffer.from(value).toString("hex") || "0"}`);
}

function normalize(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof Tag) return new Tag(value.tag, normalize(value.contents));
  if (Array.isArray(value)) return value.map(normalize);
  if (value instanceof Map)
    return new Map([...value].map(([key, child]) => [normalize(key), normalize(child)]));
  return value;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Uint8Array && right instanceof Uint8Array) return equal(left, right);
  if (left instanceof Map && right instanceof Map) {
    if (left.size !== right.size) return false;
    for (const [key, value] of left)
      if (!right.has(key) || !deepEqual(value, right.get(key))) return false;
    return true;
  }
  return left === right;
}

export function encodeBase64URL(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}
export function decodeBase64URL(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("not unpadded base64url");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new Error("noncanonical base64url");
  return decoded;
}
