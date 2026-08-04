import { decodeBase64URL, encodeBase64URL, signEnvelope, verifyEnvelope } from "./profile.js";

const command = process.argv[2] ?? "emit";

if (command === "emit") {
  console.log(encodeBase64URL(signEnvelope()));
} else if (command === "verify") {
  const envelopes = process.argv.slice(3);
  if (envelopes.length === 0) {
    throw new Error("verify requires at least one base64url envelope");
  }
  for (const encoded of envelopes) {
    verifyEnvelope(decodeBase64URL(encoded));
  }
  console.log(`verified=${envelopes.length}`);
} else {
  throw new Error(`unknown command ${command}`);
}
