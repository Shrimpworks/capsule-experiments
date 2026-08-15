#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest();
const sha256Hex = (bytes) => sha256(bytes).toString('hex');
const ref = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256Hex(bytes) });

function emit(relativePath, bytes) {
  const destination = join(root, relativePath);
  if (check) {
    if (!readFileSync(destination).equals(bytes)) throw new Error(`generated file stale: ${relativePath}`);
    return;
  }
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
}

function exactJson(relativePath) {
  const bytes = readFileSync(join(root, relativePath));
  return { bytes, value: JSON.parse(bytes) };
}

function hexArray(bytes) {
  return [...bytes].map((value) => `0x${value.toString(16).padStart(2, '0')}`).join(', ');
}

function encodeInputFrame(role, payload, bindings) {
  const header = Buffer.alloc(152);
  header.write(role === 1 ? 'CPSRC001' : 'CPINP001', 0, 'ascii');
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(1, 10);
  header.writeUInt16BE(role, 12);
  header.writeUInt16BE(152, 14);
  bindings.attemptId.copy(header, 16);
  bindings.registrationId.copy(header, 32);
  bindings.planDigest.copy(header, 48);
  bindings.profileDigest.copy(header, 80);
  header.writeBigUInt64BE(BigInt(payload.length), 112);
  sha256(payload).copy(header, 120);
  return Buffer.concat([header, payload]);
}

const profile = exactJson('contracts/root-binding-profile.json');
const c5b7 = exactJson('inputs/c5b7/runtime-root-profile.json');
const c5b8Construction = exactJson('inputs/c5b8/construction.json');
const c5b5Contract = exactJson('inputs/c5b8/inputs/c5b5/effect-adapter-contract.json');
const c5b8Object = readFileSync(join(root, 'inputs/c5b8/controlled-effects.o'));
const historicalAdapterSource = readFileSync(
  join(root, 'inputs/c5b8/inputs/c5b5/source/effect_adapter.c'), 'utf8');
const oldSourceFrame = readFileSync(join(root, 'inputs/c5b8/inputs/c5b0/fixtures/source.frame'));
const oldInputFrame = readFileSync(join(root, 'inputs/c5b8/inputs/c5b0/fixtures/input.frame'));
const sourcePayload = oldSourceFrame.subarray(152);
const inputPayload = oldInputFrame.subarray(152);

if (profile.value.immutableProfile.rootBytes !== 100663296 ||
    profile.value.immutableProfile.rootSha256 !== '5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775') {
  throw new Error('successor profile does not bind the exact C5b7 root');
}
if (c5b7.value.root.bytes !== 100663296 || c5b7.value.root.sha256 !== profile.value.immutableProfile.rootSha256) {
  throw new Error('copied C5b7 profile disagrees with successor profile');
}
if (c5b5Contract.value.immutableProfile.rootBytes !== 134217728) {
  throw new Error('historical C5b5 contract changed');
}
if (c5b8Construction.value.object.sha256 !== sha256Hex(c5b8Object) ||
    c5b8Construction.value.object.sha256 !== 'b15c4eb6abfbf0bf6ff6d1bf860081be0378273af7c14a9f9a24fd65ffe941ce') {
  throw new Error('sealed C5b8 object identity mismatch');
}
if (sourcePayload.length !== 103 || inputPayload.length !== 36) throw new Error('C5b0 payload sizes changed');

const profileRef = ref('contracts/root-binding-profile.json', profile.bytes);
const rootRef = {
  path: 'experiments/typed-guest-transport-c5b7-deterministic-runtime-root/dist/runtime-root.ext4',
  bytes: c5b7.value.root.bytes,
  sha256: c5b7.value.root.sha256,
};
const c5b8Ref = ref('inputs/c5b8/controlled-effects.o', c5b8Object);
const sourceRef = { bytes: sourcePayload.length, sha256: sha256Hex(sourcePayload) };
const inputRef = { bytes: inputPayload.length, sha256: sha256Hex(inputPayload) };
const attemptId = sha256(Buffer.from('capsule.c5b8.c5b7-root-binding-successor/attempt/v2')).subarray(0, 16);
const registrationId = sha256(Buffer.from('capsule.c5b8.c5b7-root-binding-successor/registration/v2')).subarray(0, 16);

const planBytes = json({
  objectType: 'capsule.c5b8.c5b7-root-binding-no-run-plan',
  objectVersion: 2,
  identity: 'capsule.c5b8.c5b7-root-binding-successor-plan/2026-08-15',
  status: 'construction-only-not-authorized',
  attemptId: attemptId.toString('hex'),
  registrationId: registrationId.toString('hex'),
  profile: profileRef,
  runtimeRoot: rootRef,
  sealedControlledEffects: c5b8Ref,
  source: sourceRef,
  input: inputRef,
  authority: {
    callerPaths: false,
    callerFlags: false,
    callerImages: false,
    callerMounts: false,
    callerEndpoints: false,
    callerBackendConfiguration: false,
    replacementPlanBytes: false,
    rawActionMask: false,
    rawFactMask: false,
    executionAuthorized: false,
  },
});
const planRef = ref('contracts/no-run-plan.json', planBytes);
const bindings = {
  attemptId,
  registrationId,
  planDigest: Buffer.from(planRef.sha256, 'hex'),
  profileDigest: Buffer.from(profileRef.sha256, 'hex'),
};
const sourceFrame = encodeInputFrame(1, sourcePayload, bindings);
const inputFrame = encodeInputFrame(2, inputPayload, bindings);
const descriptorBytes = json({
  objectType: 'capsule.c5b8.c5b7-root-binding-supervisor-descriptor-fixture',
  objectVersion: 2,
  magic: 1127563832,
  descriptorVersion: 1,
  attemptId: attemptId.toString('hex'),
  registrationId: registrationId.toString('hex'),
  registeredPlanSha256: planRef.sha256,
  profileBindingSha256: profileRef.sha256,
  rootDevice: 101,
  rootInode: 202,
  rootBytes: 100663296,
  rootSha256: rootRef.sha256,
  sourceFrame: ref('fixtures/source.frame', sourceFrame),
  inputFrame: ref('fixtures/input.frame', inputFrame),
  callerSelectedAuthority: false,
});
const summaryBytes = json({
  objectType: 'capsule.c5b8.c5b7-root-binding-generated-summary',
  objectVersion: 2,
  profile: profileRef,
  plan: planRef,
  descriptor: ref('fixtures/supervisor-descriptor.json', descriptorBytes),
  sourceFrame: ref('fixtures/source.frame', sourceFrame),
  inputFrame: ref('fixtures/input.frame', inputFrame),
  root: rootRef,
  historicalRootBytesRejected: 134217728,
});
const headerBytes = Buffer.from(`#ifndef CAPSULE_C5B8_ROOT_BINDING_VALUES_H\n#define CAPSULE_C5B8_ROOT_BINDING_VALUES_H\n\n#include <stdint.h>\n\n#define C5B8_BOUND_ROOT_BYTES UINT64_C(100663296)\n#define C5B8_SOURCE_FRAME_BYTES UINT64_C(${sourceFrame.length})\n#define C5B8_INPUT_FRAME_BYTES UINT64_C(${inputFrame.length})\nstatic const uint8_t c5b8_bound_attempt_id[16] = { ${hexArray(attemptId)} };\nstatic const uint8_t c5b8_bound_registration_id[16] = { ${hexArray(registrationId)} };\nstatic const uint8_t c5b8_bound_plan_sha256[32] = { ${hexArray(bindings.planDigest)} };\nstatic const uint8_t c5b8_bound_profile_sha256[32] = { ${hexArray(bindings.profileDigest)} };\n\n#endif\n`);
let localHistoricalSource = historicalAdapterSource
  .replace('#include "effect_adapter.h"',
    '#include "../inputs/c5b8/inputs/c5b5/source/effect_adapter.h"')
  .replace('#include "../inputs/c5b2/libkrun.h"',
    '#include "../inputs/c5b8/inputs/c5b5/inputs/c5b2/libkrun.h"')
  .replaceAll('c5b5_validate_immutable_profile',
    'c5b5_historical_validate_immutable_profile')
  .replaceAll('c5b5_translate_controller_actions',
    'c5b5_historical_translate_controller_actions')
  .replace('int32_t c5b5_historical_validate_immutable_profile(',
    'static int32_t c5b5_historical_validate_immutable_profile(')
  .replace('int32_t c5b5_historical_translate_controller_actions(',
    'static int32_t c5b5_historical_translate_controller_actions(');
if (!localHistoricalSource.includes('static int32_t c5b5_historical_validate_immutable_profile') ||
    !localHistoricalSource.includes('static int32_t c5b5_historical_translate_controller_actions')) {
  throw new Error('historical adapter local transformation failed');
}
localHistoricalSource = Buffer.from(localHistoricalSource);

emit('contracts/no-run-plan.json', planBytes);
emit('fixtures/source.frame', sourceFrame);
emit('fixtures/input.frame', inputFrame);
emit('fixtures/supervisor-descriptor.json', descriptorBytes);
emit('generated/binding-summary.json', summaryBytes);
emit('generated/root_binding_values.h', headerBytes);
emit('generated/historical_adapter_local.c', localHistoricalSource);

console.log(check ? 'C5b8/C5b7 generated bindings: PASSED' : 'C5b8/C5b7 generated bindings: UPDATED');
