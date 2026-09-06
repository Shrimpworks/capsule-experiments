import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Defensive local-only verifier: this module, copied mutation fixtures, Go test
// subprocesses and owned temporary directories. No native runner/guest executes.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const record = process.argv.slice(2).includes('--record');
assert(process.argv.slice(2).every((v) => v === '--record'), 'unknown argument');
assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'arm64');
const env = { ...process.env, GOTOOLCHAIN: 'go1.25.13', GOFLAGS: '', GOOS: 'darwin', GOARCH: 'arm64', CGO_ENABLED: '1' };
delete env.CAPSULE_C5B14_CRASH_MODE;
delete env.CAPSULE_C5B14_CRASH_DIRECTORY;
const hash = (b) => createHash('sha256').update(b).digest('hex');
const materials = ['go.mod', 'PLAN.md', 'README.md', 'scripts/verify.mjs', ...readdirSync(join(root, 'store')).sort().map((p) => `store/${p}`)];
const materialSHA256 = Object.fromEntries(materials.map((p) => [p, hash(readFileSync(join(root, p)))]));
const evidencePath = join(root, 'evidence/results.json');
const retained = record ? null : JSON.parse(readFileSync(evidencePath));
if (retained) assert.deepEqual(materialSHA256, retained.materialSHA256, 'stale material evidence; review changes before --record');
function run(cmd, args, cwd = root, expected = 0) {
  const result = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `${cmd} terminated`);
  assert.equal(result.status, expected, `${cmd} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout + result.stderr;
}
const version = run('go', ['version']).trim();
assert.equal(version, 'go version go1.25.13 darwin/arm64');
assert.equal(run('gofmt', ['-l', 'store']).trim(), '');
const ordinary = run('go', ['test', '-json', '-count=1', '-timeout=45s', './...']);
const events = ordinary.trim().split('\n').map((line) => JSON.parse(line));
const passedTests = events.filter((e) => e.Action === 'pass' && e.Test).map((e) => e.Test).sort();
assert(passedTests.includes('TestSubprocessCrashReopen/staging'));
run('go', ['test', '-race', '-count=1', '-timeout=45s', './...']);
run('go', ['vet', './...']);
run('go', ['build', './...']);
const mutations = [
  ['binding', 'transitions.go', 'q.Binding != FixtureBinding() || ', '', 'TestBoundRequestsAndSkippedRecoveryRefuse'],
  ['spawn-redrive', 'transitions.go', 'if s.current.SpawnIntent || s.current.Fenced {', 'if s.current.Fenced {', 'TestIntentRestartNeverFresh'],
  ['teardown-redrive', 'transitions.go', 'q.Failure >= 12 || s.current.Step != 15', 'q.Failure >= 12 || (s.current.Step != 15 && s.current.Step != 16)', 'TestTeardownPersistsSafeCursorAndCannotRedrive'],
  ['root-observation', 'completion.go', ' || !observed.RootRemoved', '', 'TestCompletionLastImmutableAndCopied'],
  ['delivery-copy', 'completion.go', 'return bytes.Clone(s.current.Completion), nil\n}\nfunc (s *Store) ReopenCompletion', 'return s.current.Completion, nil\n}\nfunc (s *Store) ReopenCompletion', 'TestConcurrentImmutableReads'],
  ['bootstrap-nonempty', 'files.go', 'readErr != nil || len(entries) != 0', 'readErr != nil', 'TestBootstrapRefusesNonempty'],
  ['canonical-bytes', 'types.go', 'err != nil || !bytes.Equal(exact, b)', 'err != nil || len(exact) == 0', 'TestCanonicalSnapshotRefusals'],
  ['recovery-fresh', 'transitions.go', 'if !s.current.SpawnIntent {\n\t\treturn Cursor{Fresh: true}', 'if len(s.current.Completion) == 0 {\n\t\treturn Cursor{Fresh: true}', 'TestIntentRestartNeverFresh'],
  ['uncertain-handle', 'files.go', 's.fault(AfterPublish) != nil {\n\t\ts.fenced = true', 's.fault(AfterPublish) != nil {\n\t\ts.fenced = false', 'TestEveryMutationPublicationBoundary'],
];
const temp = mkdtempSync(join(tmpdir(), 'capsule-c5b14a-verifier-'));
const mutationResults = [];
let testBinarySHA256;
try {
  for (const output of ['build-a', 'build-b']) {
    const cwd = join(temp, output);
    cpSync(root, cwd, { recursive: true });
    run('go', ['test', '-c', '-trimpath', '-buildvcs=false', '-ldflags=-buildid=', '-o', join(cwd, 'store.test'), './store'], cwd);
    const digest = hash(readFileSync(join(cwd, 'store.test')));
    if (testBinarySHA256) assert.equal(digest, testBinarySHA256, 'two-directory reproduction differs');
    testBinarySHA256 = digest;
  }
  for (const [name, file, before, after, test] of mutations) {
    const cwd = join(temp, name);
    cpSync(root, cwd, { recursive: true });
    const path = join(cwd, 'store', file);
    const source = readFileSync(path, 'utf8');
    assert.equal(source.split(before).length, 2, `${name}: mutation not unique`);
    // The bootstrap mutation must remain compiled after removing len(entries).
    const changed = source.replace(before, after).replace(name === 'bootstrap-nonempty' ? 'entries, readErr := os.ReadDir(directory)' : '\0', name === 'bootstrap-nonempty' ? '_, readErr := os.ReadDir(directory)' : '\0');
    writeFileSync(path, changed);
    const output = run('go', ['test', '-count=1', '-timeout=45s', `-run=^${test}$`, './store'], cwd, 1);
    assert(output.includes(`--- FAIL: ${test}`), `${name}: no intended assertion failure`);
    assert(!/build failed|panic: test timed out|undefined:|syntax error/.test(output), `${name}: not an assertion failure`);
    mutationResults.push({ name, test, status: 'PASSED', outputSHA256: hash(output), assertion: output.split('\n').filter((line) => line.includes('.go:')).map((line) => line.trim()) });
  }
} finally { rmSync(temp, { recursive: true, force: true }); }
const result = {
  status: 'PASSED', scope: 'C5b14A storage-only Go fixture; native providers and product admission BLOCKED',
  environment: { go: version, node: process.version, macOS: run('sw_vers', ['-productVersion']).trim(), build: run('sw_vers', ['-buildVersion']).trim() },
  materialSHA256, passedTests, race: 'PASSED', vet: 'PASSED', build: 'PASSED',
  reproduction: { outputDirectories: 2, testBinarySHA256 }, mutations: mutationResults,
  limits: ['Process exit and injected publication-edge faults; no power loss or physical disk faults.', 'Go fixture observations are trusted testimony, not native lifecycle evidence.', 'No C ABI bridge, complete driver, installed owner, rollback defense, authenticated delivery or product database admission.'],
};
if (retained) {
  assert.deepEqual(result.passedTests, retained.passedTests);
  assert.deepEqual(result.reproduction, retained.reproduction);
  assert.deepEqual(result.mutations.map(({ name, test, status }) => ({ name, test, status })), retained.mutations.map(({ name, test, status }) => ({ name, test, status })));
} else writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`PASSED: ${passedTests.filter((n) => !n.includes('/')).length} top-level tests; ${passedTests.filter((n) => n.includes('/')).length} subtests; race/vet/build; two-directory reproduction; ${mutations.length} compiled assertion mutations.`);
