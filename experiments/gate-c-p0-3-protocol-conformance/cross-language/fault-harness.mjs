import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  drainReadable,
  layout,
  loadCorpus,
  observeCompletion,
  rolePhysicalMaximum,
  roles,
  validateCompletionFrame,
  validateDataFrame,
} from "./verifier.mjs";

const crossLanguageRoot = path.dirname(fileURLToPath(import.meta.url));
const experimentRoot = path.resolve(crossLanguageRoot, "..");
const peer = path.join(crossLanguageRoot, "stream-peer.mjs");

function spawnPeer(arguments_) {
  const child = spawn(process.execPath, [peer, ...arguments_], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exitPromise = once(child, "exit").then(([code, signal]) => ({ code, signal, stderr }));
  return { child, exitPromise };
}

function drainChild(child, cap, timeoutMs = 2_000) {
  return drainReadable(child.stdout, cap, {
    timeoutMs,
    onTimeout: () => child.kill("SIGKILL"),
  });
}

function fixturePath(corpus, name) {
  return path.join(experimentRoot, "fixtures", corpus.cases.get(name).file);
}

async function firstDataOrTimeout(child, timeoutMs = 2_000) {
  let timer;
  try {
    await Promise.race([
      once(child.stdout, "data"),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("peer made no progress")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function step(name, action) {
  process.stdout.write(`run ${name}\n`);
  await action();
  process.stdout.write(`ok ${name}\n`);
}

const corpus = await loadCorpus(experimentRoot);

await step("exact caps accepted and cap-plus-one fully drained then refused", async () => {
  for (const [exactName, oversizeName, role] of [
    ["source-payload-exact", "source-payload-cap-plus-one", roles.source],
    ["input-payload-exact", "input-payload-cap-plus-one", roles.input],
    ["completion-json-exact", "completion-physical-cap-plus-one", roles.completion],
  ]) {
    for (const name of [exactName, oversizeName]) {
      const record = corpus.cases.get(name);
      const { child, exitPromise } = spawnPeer([`file=${fixturePath(corpus, name)}`, "chunk=4096"]);
      const drain = await drainChild(child, rolePhysicalMaximum(role));
      const exit = await exitPromise;
      assert.equal(exit.code, 0);
      assert.equal(drain.drainedBytes, record.bytes.length);
      assert.ok(drain.retainedBytes <= rolePhysicalMaximum(role) + 1);
      const disposition =
        role === roles.completion
          ? validateCompletionFrame(drain.retained, drain.drainedBytes)
          : validateDataFrame(drain.retained, role, drain.drainedBytes);
      assert.equal(disposition, record.expectedDisposition);
    }
  }
});

await step("one-byte partial writes preserve the committed frame", async () => {
  const { child, exitPromise } = spawnPeer([
    `file=${fixturePath(corpus, "completion-small-accept")}`,
    "chunk=1",
  ]);
  const drain = await drainChild(child, layout.completionPhysicalMax);
  const exit = await exitPromise;
  assert.equal(exit.code, 0);
  assert.deepEqual(observeCompletion(drain, true), {
    frameDisposition: "ACCEPT",
    committed: true,
    ordinarySuccess: true,
  });
});

await step("zero progress and stall fail closed with forced teardown", async () => {
  const { child, exitPromise } = spawnPeer(["bytes=0", "stall"]);
  const drain = await drainChild(child, layout.completionPhysicalMax, 100);
  const exit = await exitPromise;
  assert.equal(drain.disposition, "READER_STALL");
  assert.equal(drain.drainedBytes, 0);
  assert.equal(exit.signal, "SIGKILL");
  assert.equal(observeCompletion(drain, true).ordinarySuccess, false);
});

await step("reader death after partial progress fails closed", async () => {
  let sent = false;
  const readable = new Readable({
    read() {
      if (!sent) {
        sent = true;
        this.push(Buffer.from("partial"));
        this.destroy(new Error("injected reader death"));
      }
    },
  });
  const drain = await drainReadable(readable, layout.completionPhysicalMax);
  assert.equal(drain.disposition, "READER_DIED");
  assert.equal(drain.drainedBytes, 7);
  assert.equal(observeCompletion(drain, true).ordinarySuccess, false);
});

await step("peer close produces an EPIPE-equivalent writer failure", async () => {
  const { child, exitPromise } = spawnPeer([
    `bytes=${layout.completionPhysicalMax * 256}`,
    "chunk=65536",
  ]);
  await firstDataOrTimeout(child);
  child.stdout.destroy();
  const exit = await exitPromise;
  assert.equal(exit.code, 73);
});

await step(
  "backpressure still drains an entire oversize flood with cap-plus-one retention",
  async () => {
    const floodBytes = layout.completionPhysicalMax * 4;
    const { child, exitPromise } = spawnPeer([`bytes=${floodBytes}`, "chunk=65536"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const drain = await drainChild(child, layout.completionPhysicalMax);
    const exit = await exitPromise;
    assert.equal(exit.code, 0);
    assert.match(exit.stderr, /backpressure=true/);
    assert.equal(drain.drainedBytes, floodBytes);
    assert.equal(drain.retainedBytes, layout.completionPhysicalMax + 1);
    assert.equal(validateCompletionFrame(drain.retained, drain.drainedBytes), "OVERSIZE");
  },
);

await step("runner death before and after commit never becomes ordinary success", async () => {
  const record = corpus.cases.get("completion-small-accept");
  for (const [cut, expected] of [
    [record.bytes.length - layout.commitTrailerLength, "MISSING_COMMIT"],
    [record.bytes.length, "ACCEPT"],
  ]) {
    const { child, exitPromise } = spawnPeer([
      `file=${fixturePath(corpus, "completion-small-accept")}`,
      `cut=${cut}`,
      "chunk=7",
      "exit=17",
    ]);
    const drain = await drainChild(child, layout.completionPhysicalMax);
    const exit = await exitPromise;
    assert.equal(exit.code, 17);
    const observation = observeCompletion(drain, false);
    assert.equal(observation.frameDisposition, expected);
    assert.equal(observation.ordinarySuccess, false);
  }
});

await step("cancellation tears down a partial producer without accepting EOF", async () => {
  const { child, exitPromise } = spawnPeer([
    `file=${fixturePath(corpus, "completion-small-accept")}`,
    "cut=80",
    "chunk=7",
    "stall",
  ]);
  await firstDataOrTimeout(child);
  child.kill("SIGTERM");
  const drain = await drainChild(child, layout.completionPhysicalMax);
  const exit = await exitPromise;
  assert.equal(exit.signal, "SIGTERM");
  assert.notEqual(validateCompletionFrame(drain.retained, drain.drainedBytes), "ACCEPT");
  assert.equal(observeCompletion(drain, false).ordinarySuccess, false);
});

await step("source input and completion endpoint role confusion is refused", async () => {
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

await step("EOF and clean runner exit never substitute for a commit", async () => {
  const record = corpus.cases.get("completion-small-accept");
  const { child, exitPromise } = spawnPeer([
    `file=${fixturePath(corpus, "completion-small-accept")}`,
    `cut=${record.bytes.length - layout.commitTrailerLength}`,
    "exit=0",
  ]);
  const drain = await drainChild(child, layout.completionPhysicalMax);
  const exit = await exitPromise;
  assert.equal(exit.code, 0);
  assert.deepEqual(observeCompletion(drain, true), {
    frameDisposition: "MISSING_COMMIT",
    committed: false,
    ordinarySuccess: false,
  });
});

process.stdout.write("faultHarness=PASS\n");
