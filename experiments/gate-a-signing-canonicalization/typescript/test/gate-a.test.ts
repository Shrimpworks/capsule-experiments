import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import canonicalize from "canonicalize";
import {
  FlattenedSign,
  flattenedVerify,
  importJWK,
  type JWK,
  type KeyInput,
  type SignOptions,
} from "jose";
import {
  canonicalizeRaw,
  importPublicKey,
  verifyApproval,
  verifyCanonicalWire,
} from "../src/profile.js";

const fixturesRoot = resolve(process.cwd(), "../fixtures");
const encoder = new TextEncoder();

type CanonicalFixtures = {
  valid: Array<{ id: string; input: string; canonical: string }>;
  reject: Array<{ id: string; input: string }>;
  nonCanonicalWire: Array<{ id: string; input: string }>;
};

type JWSFixtures = {
  testKey: { privateJwk: JWK; publicJwk: JWK };
  profile: {
    protectedJson: string;
    payloadJson: string;
    producerSamples: Record<"go" | "typescript" | "swift", string>;
    flattenedJws: null | { payload: string; protected: string; signature: string };
  };
};

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(resolve(fixturesRoot, name), "utf8")) as T;
}

test("RFC 8785 and Capsule strict-input vectors", async (suite) => {
  const fixtures = await fixture<CanonicalFixtures>("canonicalization.json");
  for (const vector of fixtures.valid) {
    await suite.test(vector.id, () => {
      assert.equal(
        new TextDecoder().decode(canonicalizeRaw(encoder.encode(vector.input))),
        vector.canonical,
      );
    });
  }
  for (const vector of fixtures.reject) {
    await suite.test(vector.id, () => {
      assert.throws(() => canonicalizeRaw(encoder.encode(vector.input)));
    });
  }
  for (const vector of fixtures.nonCanonicalWire) {
    await suite.test(vector.id, () => {
      assert.throws(() => verifyCanonicalWire(encoder.encode(vector.input)));
    });
  }
  const invalidUtf8 = Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
  assert.throws(() => canonicalizeRaw(invalidUtf8));
});

test("RFC 7515 Appendix A.3 fixed-width ES256 known answer", async () => {
  const fixtures = await fixture<JWSFixtures>("jws.json");
  const key = await importJWK(fixtures.testKey.publicJwk, "ES256");
  const envelope = {
    protected: "eyJhbGciOiJFUzI1NiJ9",
    payload:
      "eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ",
    signature:
      "DtEhU3ljbEg8L38VWAfUAqOyKAM6-Xx-F4GawxaepmXFCgfTjDxw5djxLa8ISlSApmWQxfKTUJqPP3-Kg6NU1Q",
  };
  await flattenedVerify(envelope, key, { algorithms: ["ES256"] });
  assert.equal(Buffer.from(envelope.signature, "base64url").byteLength, 64);
});

test("Capsule JWS profile and adversarial cases", async (suite) => {
  const fixtures = await fixture<JWSFixtures>("jws.json");
  if (fixtures.profile.flattenedJws === null) {
    suite.skip("retain generated flattenedJws before running cross-language profile cases");
    return;
  }
  const normative = fixtures.profile.flattenedJws;
  const key = await importPublicKey(fixtures.testKey.publicJwk);
  const privateKey = await importJWK(fixtures.testKey.privateJwk, "ES256");
  const protectedHeader = JSON.parse(fixtures.profile.protectedJson) as Record<string, unknown>;
  const raw = encoder.encode(JSON.stringify(normative));
  await verifyApproval(raw, key);

  for (const [producer, signature] of Object.entries(fixtures.profile.producerSamples)) {
    await suite.test(`producer-${producer}`, async () => {
      const candidate = {
        protected: Buffer.from(fixtures.profile.protectedJson).toString("base64url"),
        payload: Buffer.from(fixtures.profile.payloadJson).toString("base64url"),
        signature,
      };
      await verifyApproval(encoder.encode(JSON.stringify(candidate)), key);
    });
  }

  for (const algorithm of ["none", "ES999"]) {
    await suite.test(`algorithm-${algorithm}`, async () => {
      const header = { ...protectedHeader, alg: algorithm };
      const candidate = {
        ...normative,
        protected: Buffer.from(JSON.stringify(header)).toString("base64url"),
      };
      await assert.rejects(verifyApproval(encoder.encode(JSON.stringify(candidate)), key));
    });
  }

  await suite.test("tampered-payload", async () => {
    const candidate = {
      ...normative,
      payload: Buffer.from('{"objectType":"capsule.approval-grant"}').toString("base64url"),
    };
    await assert.rejects(verifyApproval(encoder.encode(JSON.stringify(candidate)), key));
  });
  await suite.test("tampered-signature", async () => {
    const signature = Buffer.from(normative.signature, "base64url");
    signature[0] ^= 1;
    const candidate = { ...normative, signature: signature.toString("base64url") };
    await assert.rejects(verifyApproval(encoder.encode(JSON.stringify(candidate)), key));
  });
  await suite.test("raw-length", async () => {
    const signature = Buffer.from(normative.signature, "base64url").subarray(0, 63);
    const candidate = { ...normative, signature: signature.toString("base64url") };
    await assert.rejects(verifyApproval(encoder.encode(JSON.stringify(candidate)), key));
  });
  await suite.test("DER-is-not-JWS-raw", async () => {
    const signature = Buffer.from(normative.signature, "base64url");
    const candidate = { ...normative, signature: rawToDER(signature).toString("base64url") };
    await assert.rejects(flattenedVerify(candidate, key, { algorithms: ["ES256"] }));
    await assert.rejects(verifyApproval(encoder.encode(JSON.stringify(candidate)), key));
  });
  await suite.test("high-and-low-S-policy-accepts-both", async () => {
    const signature = Buffer.from(normative.signature, "base64url");
    const order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
    const s = BigInt(`0x${signature.subarray(32).toString("hex")}`);
    const complement = Buffer.from((order - s).toString(16).padStart(64, "0"), "hex");
    complement.copy(signature, 32);
    const candidate = { ...normative, signature: signature.toString("base64url") };
    await verifyApproval(encoder.encode(JSON.stringify(candidate)), key);
  });
  await suite.test("padded-base64url", async () => {
    const candidate = { ...normative, signature: `${normative.signature}=` };
    await assert.rejects(verifyApproval(encoder.encode(JSON.stringify(candidate)), key));
  });
  for (const name of ["crit", "jwk", "jku", "x5u", "unknown"] as const) {
    await suite.test(`protected-header-${name}`, async () => {
      const header = JSON.parse(fixtures.profile.protectedJson) as Record<string, unknown>;
      header[name] =
        name === "crit"
          ? ["unknown"]
          : name === "jwk"
            ? fixtures.testKey.publicJwk
            : "https://attacker.invalid/key";
      const candidate = {
        ...normative,
        protected: Buffer.from(JSON.stringify(header)).toString("base64url"),
      };
      await assert.rejects(verifyApproval(encoder.encode(JSON.stringify(candidate)), key));
    });
  }
  await suite.test("unprotected-header", async () => {
    const candidate = { ...normative, header: { kid: "attacker" } };
    await assert.rejects(verifyApproval(encoder.encode(JSON.stringify(candidate)), key));
  });
  await suite.test("duplicate-envelope-key", async () => {
    const serialized = JSON.stringify(normative);
    const duplicate = serialized.replace('{"payload":', `{"payload":"ignored","payload":`);
    await assert.rejects(verifyApproval(encoder.encode(duplicate), key));
  });

  await suite.test("valid-signature-forbidden-protected-headers", async (headersSuite) => {
    for (const name of ["crit", "jwk", "jku", "x5u", "unknown"] as const) {
      await headersSuite.test(name, async () => {
        const header = { ...protectedHeader };
        header[name] =
          name === "crit"
            ? ["unknown"]
            : name === "jwk"
              ? fixtures.testKey.publicJwk
              : "https://attacker.invalid/key";
        if (name === "crit") header.unknown = true;
        const crit = name === "crit" ? { unknown: true } : undefined;
        const candidate = await signFlattened(
          fixtures.profile.payloadJson,
          header,
          privateKey,
          crit ? { crit } : undefined,
        );
        await flattenedVerify(candidate, key, { algorithms: ["ES256"], ...(crit ? { crit } : {}) });
        await assert.rejects(verifyApproval(encoder.encode(JSON.stringify(candidate)), key));
      });
    }
  });

  await suite.test("valid-signature-wrong-object-bindings", async (bindingsSuite) => {
    const replacements: Record<string, unknown> = {
      objectType: "capsule.enforcement-transcript",
      purpose: "capsule.execution.attest",
      audience: "capsule.receipt-verifier",
      installationId: "installation_02",
      epochNumber: "8",
      epochDigest: "sha256:epoch_08",
      registrationId: "registration_02",
      attemptNonce: "nonce_02",
    };
    for (const [name, replacement] of Object.entries(replacements)) {
      await bindingsSuite.test(name, async () => {
        const payload = JSON.parse(fixtures.profile.payloadJson) as Record<string, unknown>;
        payload[name] = replacement;
        const canonicalPayload = canonicalize(payload);
        assert.ok(canonicalPayload);
        const candidate = await signFlattened(canonicalPayload, protectedHeader, privateKey);
        await flattenedVerify(candidate, key, { algorithms: ["ES256"] });
        await assert.rejects(verifyApproval(encoder.encode(JSON.stringify(candidate)), key));
      });
    }
  });
});

async function signFlattened(
  payload: string,
  protectedHeader: Record<string, unknown>,
  key: KeyInput,
  options?: SignOptions,
) {
  return new FlattenedSign(encoder.encode(payload))
    .setProtectedHeader(protectedHeader)
    .sign(key, options);
}

function rawToDER(raw: Buffer): Buffer {
  assert.equal(raw.length, 64);
  const integer = (part: Buffer) => {
    let first = 0;
    while (first < part.length - 1 && part[first] === 0) first += 1;
    let value = part.subarray(first);
    if ((value[0] & 0x80) !== 0) value = Buffer.concat([Buffer.from([0]), value]);
    return Buffer.concat([Buffer.from([0x02, value.length]), value]);
  };
  const r = integer(raw.subarray(0, 32));
  const s = integer(raw.subarray(32));
  return Buffer.concat([Buffer.from([0x30, r.length + s.length]), r, s]);
}
