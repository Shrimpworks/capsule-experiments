import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  layout,
  loadCorpus,
  roles,
  validateCompletionFrame,
  validateDataFrame,
  validInlineJSON,
  verifyRetainedCorpus,
} from "./verifier.mjs";

const experimentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("independent implementation verifies every retained byte, digest, binding, and disposition", async () => {
  const result = await verifyRetainedCorpus(experimentRoot);
  assert.equal(result.cases, 43);
  assert.equal(result.independentlyEncodedKnownAnswers, 6);
  assert.deepEqual(result.caps, layout);
});

test("strict JSON parser rejects duplicate keys, unsafe numbers, trailing data, and invalid UTF-8", () => {
  assert.equal(validInlineJSON(Buffer.from('{"ok":1}')), true);
  assert.equal(validInlineJSON(Buffer.from('{"ok":1,"ok":2}')), false);
  assert.equal(validInlineJSON(Buffer.from("9007199254740992")), false);
  assert.equal(validInlineJSON(Buffer.from("{} {}")), false);
  assert.equal(validInlineJSON(Buffer.from([0xff])), false);
});

test("all three endpoints reject cross-role known answers", async () => {
  const corpus = await loadCorpus(experimentRoot);
  assert.equal(
    validateDataFrame(corpus.cases.get("input-small-accept").bytes, roles.source),
    "DOMAIN",
  );
  assert.equal(
    validateDataFrame(corpus.cases.get("completion-small-accept").bytes, roles.input),
    "DOMAIN",
  );
  assert.equal(validateCompletionFrame(corpus.cases.get("source-small-accept").bytes), "DOMAIN");
});
