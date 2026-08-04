import { readFileSync } from "node:fs";
import {
  decodeBase64URL,
  encodeBase64URL,
  type Kind,
  signEnvelope,
  verifyEnvelope,
} from "./profile.js";

type Corpus = {
  cases: Array<{ name: string; profile: Kind; expectation: "accept" | "reject"; wire: string }>;
};
const command = process.argv[2];

if (command === "emit") {
  const kind = requireKind(process.argv[3]);
  console.log(encodeBase64URL(signEnvelope(kind)));
} else if (command === "verify") {
  const kind = requireKind(process.argv[3]);
  const envelopes = process.argv.slice(4);
  if (envelopes.length === 0) throw new Error("verify requires envelopes");
  for (const envelope of envelopes) verifyEnvelope(kind, decodeBase64URL(envelope));
  console.log(`typescript-verified=${kind}:${envelopes.length}`);
} else if (command === "self-test") {
  const path = process.argv[3];
  if (path === undefined) throw new Error("self-test requires corpus path");
  const corpus = JSON.parse(readFileSync(path, "utf8")) as Corpus;
  let accepted = 0;
  let rejected = 0;
  for (const testCase of corpus.cases) {
    let failure: unknown;
    try {
      verifyEnvelope(testCase.profile, decodeBase64URL(testCase.wire));
    } catch (error) {
      failure = error;
    }
    if (testCase.expectation === "accept" && failure !== undefined)
      throw new Error(`positive rejected ${testCase.name}: ${String(failure)}`);
    if (testCase.expectation === "reject" && failure === undefined)
      throw new Error(`negative accepted ${testCase.name}`);
    if (failure === undefined) accepted++;
    else rejected++;
  }
  console.log(`typescript-corpus=accepted:${accepted},rejected:${rejected}`);
} else {
  throw new Error("usage: emit KIND | verify KIND ENVELOPE... | self-test CORPUS");
}

function requireKind(value: string | undefined): Kind {
  if (value !== "approval-grant" && value !== "enforcement-transcript")
    throw new Error("invalid profile kind");
  return value;
}
