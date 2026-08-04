import canonicalize from "canonicalize";
import { flattenedVerify, importJWK, type JWK, type KeyInput } from "jose";

const MAX_SAFE_INTEGER = 9_007_199_254_740_991;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type FlattenedJWS = {
  payload: string;
  protected: string;
  signature: string;
};

export function parseStrict(raw: Uint8Array): JsonValue {
  const source = decoder.decode(raw);
  rejectDuplicateKeys(source);
  const value = JSON.parse(source) as JsonValue;
  validateValue(value);
  return value;
}

export function canonicalizeRaw(raw: Uint8Array): Uint8Array {
  const value = parseStrict(raw);
  const canonical = canonicalize(value);
  if (canonical === undefined) {
    throw new Error("value is not canonicalizable JSON");
  }
  return encoder.encode(canonical);
}

export function verifyCanonicalWire(raw: Uint8Array): void {
  const canonical = canonicalizeRaw(raw);
  if (!Buffer.from(raw).equals(Buffer.from(canonical))) {
    throw new Error("payload is not canonical on wire");
  }
}

export async function importPublicKey(jwk: JWK): Promise<KeyInput> {
  return importJWK(jwk, "ES256");
}

export async function verifyApproval(rawEnvelope: Uint8Array, key: KeyInput): Promise<void> {
  const value = parseStrict(rawEnvelope);
  assertExactKeys(value, ["payload", "protected", "signature"]);
  const envelope = value as FlattenedJWS;
  if (
    ![envelope.payload, envelope.protected, envelope.signature].every(
      (part) => typeof part === "string" && part.length > 0,
    )
  ) {
    throw new Error("flattened JWS requires payload, protected, and signature");
  }

  const protectedBytes = decodeBase64URL(envelope.protected, "protected");
  decodeBase64URL(envelope.payload, "payload");
  verifyCanonicalWire(protectedBytes);
  const protectedValue = parseStrict(protectedBytes);
  assertExactKeys(protectedValue, ["alg", "cty", "kid", "typ", "v"]);
  const expectedHeader = {
    alg: "ES256",
    cty: "application/capsule.approval-grant+jcs",
    kid: "approval-test-key",
    typ: "capsule.signed-object+jws",
    v: 1,
  };
  if (JSON.stringify(protectedValue) !== JSON.stringify(expectedHeader)) {
    throw new Error("protected header is outside the exact allowlist/profile");
  }

  const signature = decodeBase64URL(envelope.signature, "signature");
  if (signature.byteLength !== 64) {
    throw new Error(`ES256 signature must be raw 64-byte R || S, got ${signature.byteLength}`);
  }

  const verified = await flattenedVerify(envelope, key, { algorithms: ["ES256"] });
  verifyCanonicalWire(verified.payload);
  const payload = parseStrict(verified.payload);
  assertExactKeys(payload, [
    "attemptNonce",
    "audience",
    "epochDigest",
    "epochNumber",
    "expiresAt",
    "installationId",
    "issuedAt",
    "objectType",
    "objectVersion",
    "planDigest",
    "purpose",
    "registrationId",
    "supervisorId",
  ]);
  const object = payload as Record<string, JsonValue>;
  const bindings = {
    attemptNonce: "nonce_01",
    audience: "capsule.execution-supervisor",
    epochDigest: "sha256:epoch_07",
    epochNumber: "7",
    installationId: "installation_01",
    objectType: "capsule.approval-grant",
    objectVersion: 1,
    purpose: "capsule.plan.approve",
    registrationId: "registration_01",
    supervisorId: "supervisor_01",
  };
  for (const [name, expected] of Object.entries(bindings)) {
    if (object[name] !== expected) {
      throw new Error(`approval object binding/profile mismatch: ${name}`);
    }
  }
}

function decodeBase64URL(value: string, label: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error(`${label} is not unpadded base64url`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error(`${label} is not canonical base64url`);
  }
  return decoded;
}

function validateValue(value: JsonValue): void {
  if (typeof value === "string") {
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) {
          throw new Error("lone high surrogate");
        }
        index += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        throw new Error("lone low surrogate");
      }
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("non-finite number");
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(validateValue);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      validateValue(key);
      validateValue(child);
    }
  }
}

function assertExactKeys(
  value: JsonValue,
  expected: string[],
): asserts value is Record<string, JsonValue> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("expected JSON object");
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`unexpected object fields: ${actual.join(",")}`);
  }
}

// This experiment-only lexical pass runs before JSON.parse so duplicate names are
// never collapsed. Product code must use a reviewed bounded parser, not this spike.
function rejectDuplicateKeys(source: string): void {
  let index = 0;

  const whitespace = () => {
    while (/\s/u.test(source[index] ?? "")) index += 1;
  };

  const stringToken = (): string => {
    if (source[index] !== '"') throw new Error("expected string");
    const start = index;
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index)) as string;
      }
      if (character === "\\") {
        index += 1;
        if (source[index] === "u") index += 4;
      }
      index += 1;
    }
    throw new Error("unterminated string");
  };

  const primitive = () => {
    const start = index;
    while (index < source.length && !/[\s,\]}]/u.test(source[index] ?? "")) index += 1;
    const token = source.slice(start, index);
    JSON.parse(token);
    if (/^-?\d/u.test(token)) {
      const numeric = Number(token);
      if (!Number.isFinite(numeric)) throw new Error("number outside IEEE 754 range");
      const mantissa = token.split(/[eE]/u, 1)[0];
      if (numeric === 0 && /[1-9]/u.test(mantissa))
        throw new Error("number underflows IEEE 754 double precision");
      if (
        !/[.eE]/u.test(token) &&
        (BigInt(token) > BigInt(MAX_SAFE_INTEGER) || BigInt(token) < BigInt(-MAX_SAFE_INTEGER))
      ) {
        throw new Error("integer outside Capsule safe range");
      }
    }
  };

  const value = (): void => {
    whitespace();
    if (source[index] === "{") {
      index += 1;
      whitespace();
      const names = new Set<string>();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      while (true) {
        whitespace();
        const name = stringToken();
        if (names.has(name)) throw new Error(`duplicate key: ${name}`);
        names.add(name);
        whitespace();
        if (source[index] !== ":") throw new Error("expected colon");
        index += 1;
        value();
        whitespace();
        if (source[index] === "}") {
          index += 1;
          return;
        }
        if (source[index] !== ",") throw new Error("expected comma");
        index += 1;
      }
    }
    if (source[index] === "[") {
      index += 1;
      whitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      while (true) {
        value();
        whitespace();
        if (source[index] === "]") {
          index += 1;
          return;
        }
        if (source[index] !== ",") throw new Error("expected comma");
        index += 1;
      }
    }
    if (source[index] === '"') {
      stringToken();
      return;
    }
    primitive();
  };

  value();
  whitespace();
  if (index !== source.length) throw new Error("trailing data");
}
