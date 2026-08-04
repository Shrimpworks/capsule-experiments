import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";
import { decode, encode, Tag } from "cbor2";

const COSE_SIGN1_TAG = 18;
const ES256 = -7;
const CONTENT_TYPE = "application/capsule.approval-grant+cbor;v=0";
const TEST_KEY_ID = bytesFromText("approval-test-key");

const privateJWK = {
  kty: "EC",
  crv: "P-256",
  x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
  y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
  d: "jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI",
};

const privateKey = createPrivateKey({ key: privateJWK, format: "jwk" });
const publicKey = createPublicKey(privateKey);

export type ApprovalGrant = Map<number, string | number | Uint8Array>;

export function expectedGrant(): ApprovalGrant {
  return new Map<number, string | number | Uint8Array>([
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

export function payloadBytes(): Uint8Array {
  return encodeProfile(expectedGrant());
}

export function protectedBytes(): Uint8Array {
  return encodeProfile(
    new Map<number, number | string | Uint8Array>([
      [1, ES256],
      [3, CONTENT_TYPE],
      [4, TEST_KEY_ID],
    ]),
  );
}

export function signEnvelope(): Uint8Array {
  const protectedHeader = protectedBytes();
  const payload = payloadBytes();
  const signatureInput = encodeProfile([
    "Signature1",
    plainBytes(protectedHeader),
    new Uint8Array(),
    plainBytes(payload),
  ]);
  const signature = new Uint8Array(
    cryptoSign("sha256", signatureInput, {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    }),
  );
  if (signature.byteLength !== 64) {
    throw new Error(`Node did not produce 64-byte raw ES256: ${signature.byteLength}`);
  }
  return encodeProfile(new Tag(COSE_SIGN1_TAG, [protectedHeader, new Map(), payload, signature]));
}

export function verifyEnvelope(wire: Uint8Array): void {
  const decoded = decodeProfile(wire);
  if (!(decoded instanceof Tag) || decoded.tag !== COSE_SIGN1_TAG) {
    throw new Error("expected tagged COSE_Sign1");
  }
  const canonical = encodeProfile(normalizeDecoded(decoded));
  if (!equalBytes(canonical, wire)) {
    throw new Error("COSE_Sign1 is not canonical on wire");
  }
  if (!Array.isArray(decoded.contents) || decoded.contents.length !== 4) {
    throw new Error("COSE_Sign1 content must be a four-item array");
  }
  const [protectedHeader, unprotected, payload, signature] = decoded.contents;
  assertBytes(protectedHeader, "protected header");
  if (!equalBytes(protectedHeader, protectedBytes())) {
    throw new Error("protected header is outside the exact Capsule profile");
  }
  if (!(unprotected instanceof Map) || unprotected.size !== 0) {
    throw new Error("unprotected headers are forbidden");
  }
  assertBytes(payload, "payload");
  if (!equalBytes(payload, payloadBytes())) {
    throw new Error("payload is non-canonical or outside the exact ApprovalGrant profile");
  }
  const grant = decodeProfile(payload);
  if (!(grant instanceof Map) || grant.size !== 12) {
    throw new Error("ApprovalGrant must be the exact 12-field integer-keyed map");
  }
  if (!equalBytes(encodeProfile(normalizeDecoded(grant)), payload)) {
    throw new Error("ApprovalGrant did not round-trip canonically");
  }
  assertBytes(signature, "signature");
  if (signature.byteLength !== 64) {
    throw new Error("ES256 signature must be exactly 64-byte raw R || S");
  }
  const signatureInput = encodeProfile([
    "Signature1",
    plainBytes(protectedHeader),
    new Uint8Array(),
    plainBytes(payload),
  ]);
  if (
    !cryptoVerify(
      "sha256",
      signatureInput,
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      plainBytes(signature),
    )
  ) {
    throw new Error("ES256 signature verification failed");
  }
}

export function encodeBase64URL(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

export function decodeBase64URL(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("value is not unpadded base64url");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error("value is not canonical base64url");
  }
  return decoded;
}

export function testPublicKey(): KeyObject {
  return publicKey;
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
    preferMap: true,
    rejectBigInts: true,
    rejectDuplicateKeys: true,
    rejectFloats: true,
    rejectStreaming: true,
    rejectUndefined: true,
  });
}

function repeated(value: number, count: number): Uint8Array {
  return new Uint8Array(count).fill(value);
}

function bytesFromText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

function assertBytes(value: unknown, label: string): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new Error(`${label} must be a byte string`);
  }
}

function plainBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

function normalizeDecoded(value: unknown): unknown {
  if (Buffer.isBuffer(value)) {
    return new Uint8Array(value);
  }
  if (value instanceof Tag) {
    return new Tag(value.tag, normalizeDecoded(value.contents));
  }
  if (Array.isArray(value)) {
    return value.map(normalizeDecoded);
  }
  if (value instanceof Map) {
    return new Map(
      [...value.entries()].map(([key, child]) => [normalizeDecoded(key), normalizeDecoded(child)]),
    );
  }
  return value;
}
