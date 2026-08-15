#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function emit(path, value) {
  const bytes = json(value);
  if (check) {
    if (readFileSync(path, 'utf8') !== bytes) throw new Error(`generated file stale: ${path}`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
}

const object = readFileSync(join(root, 'dist', 'controlled-effects-a.o'));
const construction = {
  objectType: 'capsule.c5b8.controlled-test-effect-construction',
  objectVersion: 1,
  capturedOn: '2026-08-14',
  status: 'IN_PROGRESS — TRENDING_GOOD',
  sourceBaseline: {
    repository: 'Shrimpworks/capsule-experiments',
    commit: 'c3264cb6c1f524622cf09519ed43b7a2e07a971c',
  },
  acceptedInputs: {
    c5b0Merge: 'b357d0c0fb29100c180494e67cebd7809aabe3c5',
    c5b3Merge: '60234e22674e46a42e8e5c382d85217a930c2c13',
    c5b5Merge: '3cfe7db16c55894be444d4c783659043dbd25c95',
  },
  object: {
    path: 'dist/controlled-effects-a.o',
    bytes: object.length,
    sha256: digest(object),
    deterministicBuilds: 2,
    byteEqual: true,
    format: 'Mach-O arm64 MH_OBJECT',
    exports: ['_c5b8_apply_observation', '_c5b8_initialize'],
    undefinedSymbols: [
      '_c5b3_controller_reset',
      '_c5b3_controller_step',
      '_c5b5_translate_controller_actions',
      '_c5b5_validate_immutable_profile',
      '_c5b8_controlled_test_operation',
    ],
  },
  verification: [
    './scripts/build.sh',
    'node scripts/generate.mjs --check',
    'node scripts/verify.mjs',
    'node scripts/test-mutations.mjs',
    'git diff --check',
  ],
  effects: {
    productionObjectLinked: false,
    productionObjectLoaded: false,
    productionObjectExecuted: false,
    testDoubleExecuted: true,
    libkrunLoaded: false,
    hvfCalled: false,
    processStarted: false,
    vmStarted: false,
    guestStarted: false,
    networkAccessedByExperiment: false,
    credentialAccessed: false,
    keychainAccessed: false,
    signed: false,
    productStateMutated: false,
    admissionChanged: false,
  },
  nonComposition: {
    c5b5RootBytes: 134217728,
    retainedC5b7RootBytes: 100663296,
    mismatchResolved: false,
    c5b9Ready: false,
  },
};

const mutations = {
  objectType: 'capsule.c5b8.controlled-test-effect-mutations',
  objectVersion: 1,
  capturedOn: '2026-08-14',
  status: 'PASSED',
  cases: [
    { mutation: 'raw caller-selected action/delivery attempt', disposition: 'observation plus STOP_MISMATCH only' },
    { mutation: 'fixed observation port returns a substituted fact', disposition: 'indeterminate; fence and controller-issued teardown' },
    { mutation: 'owner descriptor enrollment returns a mismatched binding', disposition: 'initialization refused and session zeroed' },
    { mutation: 'caller source/input buffer changed after initialize', disposition: 'sealed copy used' },
    { mutation: 'wrong attempt echo from operation', disposition: 'protocol refusal and controller-issued teardown' },
    { mutation: 'durable commit indeterminate', disposition: 'fence and controller-issued teardown; no delivery' },
    { mutation: 'one input writer remains open during teardown', disposition: 'cleanup unresolved; progress blocked' },
    { mutation: 'live context not released during teardown', disposition: 'cleanup unresolved; progress blocked' },
    { mutation: 'effect result includes an unknown resource bit', disposition: 'indeterminate; fence and controller-issued teardown' },
    { mutation: 'source cap plus one', disposition: 'descriptor refused before any operation' },
    { mutation: '96 MiB root supplied to 128 MiB C5b5 profile', disposition: 'descriptor refused before any operation' },
    { mutation: 'opaque session storage corrupted', disposition: 'session refused before any operation' },
    { mutation: 'controller/durable/resource authority state corrupted through test-only hook', disposition: 'all-state tag mismatch; session refused before replay' },
    { mutation: 'effect not applied and recovery teardown indeterminate', disposition: 'indeterminate overrides original; fixed fence runs; cleanup unresolved' },
  ],
};

emit(join(root, 'evidence', '2026-08-14', 'construction.json'), construction);
emit(join(root, 'evidence', '2026-08-14', 'mutation-dispositions.json'), mutations);

function filesBelow(path) {
  const output = [];
  for (const name of readdirSync(path).sort()) {
    const absolute = join(path, name);
    const relativePath = relative(root, absolute);
    if (relativePath === 'manifests/archive-manifest.json' ||
        relativePath === 'dist/controlled-effects-test-double') continue;
    if (statSync(absolute).isDirectory()) output.push(...filesBelow(absolute));
    else output.push(absolute);
  }
  return output;
}

const manifest = {
  objectType: 'capsule.c5b8.controlled-test-effect-archive-manifest',
  objectVersion: 1,
  generatedOn: '2026-08-14',
  files: filesBelow(root).map((absolute) => {
    const bytes = readFileSync(absolute);
    return { path: relative(root, absolute), bytes: bytes.length, sha256: digest(bytes) };
  }),
};
emit(join(root, 'manifests', 'archive-manifest.json'), manifest);

console.log(check ? 'C5b8 generated evidence: PASSED' : 'C5b8 generated evidence: UPDATED');
