import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path));
const keys = (value) => Object.keys(value).sort();

function ref(path, bytes) {
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}

function filesBelow(root, current = root) {
  const output = [];
  for (const name of readdirSync(current).sort()) {
    const absolute = join(current, name);
    if (statSync(absolute).isDirectory()) output.push(...filesBelow(root, absolute));
    else if (relative(root, absolute) !== 'manifests/archive-manifest.json') output.push(absolute);
  }
  return output;
}

function globalSymbols(object) {
  const output = execFileSync('nm', ['-g', object], { encoding: 'utf8' });
  const defined = [];
  const undefinedSymbols = [];
  for (const line of output.trim().split('\n')) {
    const fields = line.trim().split(/\s+/);
    if (fields.includes('U')) undefinedSymbols.push(fields.at(-1));
    if (fields.includes('T')) defined.push(fields.at(-1));
  }
  return { defined: defined.sort(), undefinedSymbols: undefinedSymbols.sort() };
}

function verifyFrame(frame, role, payload, bindings) {
  assert.equal(frame.subarray(0, 8).toString('ascii'), role === 1 ? 'CPSRC001' : 'CPINP001');
  assert.equal(frame.readUInt16BE(8), 1);
  assert.equal(frame.readUInt16BE(10), 1);
  assert.equal(frame.readUInt16BE(12), role);
  assert.equal(frame.readUInt16BE(14), 152);
  assert.equal(frame.subarray(16, 32).toString('hex'), bindings.attemptId);
  assert.equal(frame.subarray(32, 48).toString('hex'), bindings.registrationId);
  assert.equal(frame.subarray(48, 80).toString('hex'), bindings.planSha256);
  assert.equal(frame.subarray(80, 112).toString('hex'), bindings.profileSha256);
  assert.equal(frame.readBigUInt64BE(112), BigInt(payload.length));
  assert.equal(frame.subarray(120, 152).toString('hex'), sha256(payload));
  assert.deepEqual(frame.subarray(152), payload);
}

export function verifyCandidate(candidateRoot, repositoryRoot = resolve(candidateRoot, '..', '..')) {
  const profilePath = join(candidateRoot, 'contracts', 'root-binding-profile.json');
  const planPath = join(candidateRoot, 'contracts', 'no-run-plan.json');
  const profileBytes = readFileSync(profilePath);
  const planBytes = readFileSync(planPath);
  const profile = JSON.parse(profileBytes);
  const plan = JSON.parse(planBytes);
  const c5b7 = readJson(join(candidateRoot, 'inputs', 'c5b7', 'runtime-root-profile.json'));
  const c5b8Construction = readJson(join(candidateRoot, 'inputs', 'c5b8', 'construction.json'));
  const c5b5Contract = readJson(join(candidateRoot, 'inputs', 'c5b8', 'inputs', 'c5b5', 'effect-adapter-contract.json'));
  const descriptor = readJson(join(candidateRoot, 'fixtures', 'supervisor-descriptor.json'));
  const summary = readJson(join(candidateRoot, 'generated', 'binding-summary.json'));
  const c5b8Object = readFileSync(join(candidateRoot, 'inputs', 'c5b8', 'controlled-effects.o'));
  const successorA = readFileSync(join(candidateRoot, 'dist', 'root-binding-successor-a.o'));
  const successorB = readFileSync(join(candidateRoot, 'dist', 'root-binding-successor-b.o'));
  const compositeAPath = join(candidateRoot, 'dist', 'controlled-effects-root-bound-a.o');
  const compositeBPath = join(candidateRoot, 'dist', 'controlled-effects-root-bound-b.o');
  const compositeA = readFileSync(compositeAPath);
  const compositeB = readFileSync(compositeBPath);
  const sourceFrame = readFileSync(join(candidateRoot, 'fixtures', 'source.frame'));
  const inputFrame = readFileSync(join(candidateRoot, 'fixtures', 'input.frame'));
  const oldSourceFrame = readFileSync(join(candidateRoot, 'inputs', 'c5b8', 'inputs', 'c5b0', 'fixtures', 'source.frame'));
  const oldInputFrame = readFileSync(join(candidateRoot, 'inputs', 'c5b8', 'inputs', 'c5b0', 'fixtures', 'input.frame'));
  const sourcePayload = oldSourceFrame.subarray(152);
  const inputPayload = oldInputFrame.subarray(152);

  assert.deepEqual(keys(profile), [
    'authorityOwner', 'callerAuthority', 'compatibilityAbi', 'effects', 'identity',
    'immutableProfile', 'mechanicalDelta', 'objectType', 'objectVersion', 'predecessors', 'status',
  ].sort());
  assert.equal(profile.objectType, 'capsule.c5b8.c5b7-root-binding-successor-profile');
  assert.equal(profile.objectVersion, 2);
  assert.equal(profile.immutableProfile.magic, 1127563859);
  assert.equal(profile.immutableProfile.version, 2);
  assert.equal(profile.immutableProfile.structureBytes, 240);
  assert.equal(profile.immutableProfile.rootBytes, 100663296);
  assert.equal(profile.immutableProfile.rootSha256, '5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775');
  assert.equal(profile.predecessors.c5b5HistoricalAdapter.rootBytes, 134217728);
  assert.equal(profile.predecessors.c5b5HistoricalAdapter.acceptedBySuccessor, false);
  assert.equal(c5b5Contract.immutableProfile.rootBytes, 134217728);
  assert.equal(c5b7.root.bytes, profile.immutableProfile.rootBytes);
  assert.equal(c5b7.root.sha256, profile.immutableProfile.rootSha256);
  assert.equal(sha256(readFileSync(join(candidateRoot, 'inputs', 'c5b7', 'runtime-root-profile.json'))),
    '6c39f9803cdd4129c10f86f3eecd10ed9e40d89548a8745221818539b65b644d');

  const retainedRoot = readFileSync(join(repositoryRoot, 'experiments',
    'typed-guest-transport-c5b7-deterministic-runtime-root', 'dist', 'runtime-root.ext4'));
  assert.equal(retainedRoot.length, 100663296);
  assert.equal(sha256(retainedRoot), profile.immutableProfile.rootSha256);

  assert.equal(c5b8Object.length, 8728);
  assert.equal(sha256(c5b8Object), 'b15c4eb6abfbf0bf6ff6d1bf860081be0378273af7c14a9f9a24fd65ffe941ce');
  assert.equal(c5b8Construction.object.sha256, sha256(c5b8Object));
  assert.equal(profile.predecessors.c5b8ControlledEffects.mergeCommit,
    'e83614af34d5c39c12a4a3d6e6cda8dcf0304030');
  assert.equal(profile.predecessors.c5b8ControlledEffects.deliveredHead,
    '15633058649b39b4afa8d01a2439fca6134d0156');
  assert.equal(profile.predecessors.c5b8ControlledEffects.reviewedPredecessor,
    '19d3478651839c7939a5bd22a43497c5eaa57d9b');

  assert.deepEqual(successorA, successorB);
  assert.deepEqual(compositeA, compositeB);
  assert.equal(successorA.subarray(0, 4).toString('hex'), 'cffaedfe');
  assert.equal(compositeA.subarray(0, 4).toString('hex'), 'cffaedfe');
  const successorSymbols = globalSymbols(join(candidateRoot, 'dist', 'root-binding-successor-a.o'));
  assert.deepEqual(successorSymbols.defined, [
    '_c5b5_translate_controller_actions', '_c5b5_validate_immutable_profile',
  ]);
  assert.equal(successorSymbols.undefinedSymbols.length, 13);
  assert.equal(successorSymbols.undefinedSymbols.every((value) => value.startsWith('_krun_')), true);
  const compositeSymbols = globalSymbols(compositeAPath);
  assert.deepEqual(compositeSymbols.defined, [
    '_c5b5_translate_controller_actions', '_c5b5_validate_immutable_profile',
    '_c5b8_apply_observation', '_c5b8_initialize',
  ]);
  assert.deepEqual(compositeSymbols.undefinedSymbols, [
    '_c5b3_controller_reset', '_c5b3_controller_step', '_c5b8_controlled_test_operation',
    '_krun_add_console_port_inout', '_krun_add_read_only_raw_root_fd',
    '_krun_add_virtio_console_multiport', '_krun_create_ctx',
    '_krun_disable_implicit_console', '_krun_disable_implicit_init',
    '_krun_disable_implicit_vsock', '_krun_set_exec', '_krun_set_kernel_console',
    '_krun_set_root_disk_remount', '_krun_set_vm_config', '_krun_set_workdir',
    '_krun_start_enter',
  ]);
  assert.equal(compositeSymbols.defined.some((value) => value.includes('historical')), false);

  assert.equal(plan.objectType, 'capsule.c5b8.c5b7-root-binding-no-run-plan');
  assert.equal(plan.objectVersion, 2);
  assert.equal(plan.profile.sha256, sha256(profileBytes));
  assert.equal(plan.runtimeRoot.bytes, 100663296);
  assert.equal(plan.runtimeRoot.sha256, profile.immutableProfile.rootSha256);
  assert.equal(plan.sealedControlledEffects.sha256, sha256(c5b8Object));
  assert.equal(Object.values(plan.authority).every((value) => value === false), true);
  assert.equal(Object.values(profile.callerAuthority).every((value) => value === false), true);
  assert.equal(Object.values(profile.effects).every((value) => value === false), true);

  const bindings = {
    attemptId: plan.attemptId,
    registrationId: plan.registrationId,
    planSha256: sha256(planBytes),
    profileSha256: sha256(profileBytes),
  };
  verifyFrame(sourceFrame, 1, sourcePayload, bindings);
  verifyFrame(inputFrame, 2, inputPayload, bindings);
  assert.equal(descriptor.attemptId, bindings.attemptId);
  assert.equal(descriptor.registrationId, bindings.registrationId);
  assert.equal(descriptor.registeredPlanSha256, bindings.planSha256);
  assert.equal(descriptor.profileBindingSha256, bindings.profileSha256);
  assert.equal(descriptor.rootBytes, 100663296);
  assert.equal(descriptor.rootSha256, profile.immutableProfile.rootSha256);
  assert.equal(descriptor.callerSelectedAuthority, false);
  assert.equal(summary.profile.sha256, bindings.profileSha256);
  assert.equal(summary.plan.sha256, bindings.planSha256);
  assert.equal(summary.historicalRootBytesRejected, 134217728);

  const source = readFileSync(join(candidateRoot, 'source', 'root_binding_successor.c'), 'utf8');
  const publicHeader = readFileSync(join(candidateRoot, 'source', 'root_binding_successor.h'), 'utf8');
  const generatedHistorical = readFileSync(join(candidateRoot, 'generated', 'historical_adapter_local.c'), 'utf8');
  assert.equal(sha256(readFileSync(join(candidateRoot, 'inputs', 'c5b8', 'inputs', 'c5b5', 'source', 'effect_adapter.c'))),
    'd3c7a234d9ea03d317dfd8766307be48bb581b2559cdb145884dedc89c12fac2');
  assert.match(generatedHistorical, /static int32_t c5b5_historical_validate_immutable_profile/);
  assert.match(generatedHistorical, /static int32_t c5b5_historical_translate_controller_actions/);
  assert.match(source, /operation->value_a = C5B8_SUCCESSOR_ROOT_BYTES/);
  for (const forbidden of [
    /\bdlopen\b/, /\bdlsym\b/, /\bopen\s*\(/, /\bsocket\s*\(/, /\bconnect\s*\(/,
    /\bfork\s*\(/, /\bexecve\s*\(/, /\bgetenv\s*\(/,
  ]) assert.equal(forbidden.test(source), false, `successor source contains forbidden API: ${forbidden}`);
  for (const forbidden of [
    /raw[_ ]?action/i, /raw[_ ]?fact/i, /callback/i, /opaque/i, /backend[_ ]?configuration/i,
    /replacement[_ ]?plan/i, /endpoint[_ ]?(path|name|config)/i,
  ]) assert.equal(forbidden.test(publicHeader), false, `successor public header widens authority: ${forbidden}`);

  const manifestPath = join(candidateRoot, 'manifests', 'archive-manifest.json');
  assert.equal(existsSync(manifestPath), true, 'archive manifest missing');
  const manifest = readJson(manifestPath);
  const actualFiles = filesBelow(candidateRoot).map((absolute) => {
    const bytes = readFileSync(absolute);
    return ref(relative(candidateRoot, absolute), bytes);
  });
  assert.deepEqual(manifest.files, actualFiles);
  assert.equal(manifest.files.some((entry) => entry.path.includes('runtime-root.ext4')), false,
    'successor must not duplicate the retained root');

  return {
    status: 'PASSED',
    rootBytes: 100663296,
    rootSha256: profile.immutableProfile.rootSha256,
    historicalRootBytesRejected: 134217728,
    sealedC5b8ObjectSha256: sha256(c5b8Object),
    successorObjectBytes: successorA.length,
    successorObjectSha256: sha256(successorA),
    compositeObjectBytes: compositeA.length,
    compositeObjectSha256: sha256(compositeA),
    planSha256: bindings.planSha256,
    profileSha256: bindings.profileSha256,
    sourceFrameSha256: sha256(sourceFrame),
    inputFrameSha256: sha256(inputFrame),
    runtimeArtifactLoaded: false,
    guestStarted: false,
  };
}

