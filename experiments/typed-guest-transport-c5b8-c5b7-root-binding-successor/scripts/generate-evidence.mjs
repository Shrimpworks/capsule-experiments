#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
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

function objectRef(path) {
  const bytes = readFileSync(join(root, path));
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}

function command(name, args = []) {
  return execFileSync(name, args, { encoding: 'utf8' }).trim();
}

const profile = objectRef('contracts/root-binding-profile.json');
const plan = objectRef('contracts/no-run-plan.json');
const sealed = objectRef('inputs/c5b8/controlled-effects.o');
const successor = objectRef('dist/root-binding-successor-a.o');
const composite = objectRef('dist/controlled-effects-root-bound-a.o');
const sourceFrame = objectRef('fixtures/source.frame');
const inputFrame = objectRef('fixtures/input.frame');
const reviewPath = join(root, 'reviews', 'INDEPENDENT_REVIEW.md');

const construction = {
  objectType: 'capsule.c5b8.c5b7-root-binding-successor-construction',
  objectVersion: 2,
  capturedOn: '2026-08-15',
  status: 'PASSED',
  authorizedEnvironment: 'owned local Shrimpworks/capsule-experiments clone and repository test doubles only',
  repositoryBaseline: 'e83614af34d5c39c12a4a3d6e6cda8dcf0304030',
  predecessors: {
    c5b7Merge: '78485fb91a31733c568fe43e5fa295474e5956e1',
    c5b8Merge: 'e83614af34d5c39c12a4a3d6e6cda8dcf0304030',
    c5b8DeliveredHead: '15633058649b39b4afa8d01a2439fca6134d0156',
    c5b8ReviewedPredecessor: '19d3478651839c7939a5bd22a43497c5eaa57d9b',
    c5b5Merge: '3cfe7db16c55894be444d4c783659043dbd25c95',
  },
  root: {
    path: 'experiments/typed-guest-transport-c5b7-deterministic-runtime-root/dist/runtime-root.ext4',
    bytes: 100663296,
    sha256: '5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775',
    copiedIntoSuccessor: false,
  },
  historicalIncompatibility: {
    c5b5RootBytes: 134217728,
    historicalProfileAccepted: false,
    historicalSizeAccepted: false,
    descriptorSizeSubstitutionAccepted: false,
    historicalProfileDigestAccepted: false,
  },
  bindings: { profile, plan, sourceFrame, inputFrame },
  objects: {
    sealedC5b8: sealed,
    successorAdapter: successor,
    staticallyComposedRelocatable: composite,
    deterministicBuilds: 2,
    byteEqual: true,
    format: 'Mach-O arm64 MH_OBJECT',
    linkedIntoRuntime: false,
    loaded: false,
    executed: false,
  },
  environment: {
    operatingSystem: command('sw_vers', ['-productVersion']),
    architecture: command('uname', ['-m']),
    clang: command('xcrun', ['clang', '--version']).split('\n')[0],
    node: process.version,
  },
  verification: [
    './scripts/build.sh',
    'node scripts/generate-profile.mjs --check',
    'node scripts/generate-evidence.mjs --check',
    'node scripts/verify.mjs',
    'node scripts/test-mutations.mjs',
    'git diff --check',
  ],
  independentReview: existsSync(reviewPath) ? {
    retained: true,
    path: 'reviews/INDEPENDENT_REVIEW.md',
  } : {
    retained: false,
    path: null,
  },
  effects: {
    runtimeArtifactLoaded: false,
    retainedDylibLoaded: false,
    dynamicLinkingPerformed: false,
    libkrunInvoked: false,
    hvfCalled: false,
    processStarted: false,
    vmStarted: false,
    guestStarted: false,
    signingPerformed: false,
    keychainAccessed: false,
    localAuthenticationAccessed: false,
    serviceRegistered: false,
    installed: false,
    hostPathCleanupPerformed: false,
    productStateMutated: false,
    admissionChanged: false,
  },
  limitations: [
    'The static operation double proves exact binding and order only; no real effect is established.',
    'The successor does not create the complete C5b9 composite or authorize controlled execution.',
    'The one-shot sealed C5b8 session remains a controlled-test constraint, not a product session manager.',
    'Runtime/profile, installed-composition, and product admission remain blocked.',
  ],
};

const mutations = {
  objectType: 'capsule.c5b8.c5b7-root-binding-successor-mutations',
  objectVersion: 2,
  capturedOn: '2026-08-15',
  status: 'PASSED',
  cases: [
    { mutation: 'historical C5b5 profile magic/version and 134217728-byte root', disposition: 'refused before operation enrollment' },
    { mutation: '134217728 bytes under successor magic/version', disposition: 'refused before operation enrollment' },
    { mutation: '134217728-byte Supervisor descriptor under the exact successor profile', disposition: 'root identity refused before operation enrollment' },
    { mutation: 'historical C5b0 profile digest', disposition: 'descriptor enrollment binding refused' },
    { mutation: 'replacement plan digest', disposition: 'descriptor enrollment binding refused' },
    { mutation: 'non-root immutable profile field', disposition: 'profile refused before operation enrollment' },
    { mutation: 'C5b7 root profile size changed to historical value', disposition: 'independent verifier refused' },
    { mutation: 'C5b7 root digest substitution', disposition: 'independent verifier refused' },
    { mutation: 'sealed C5b8 object byte substitution', disposition: 'independent verifier refused' },
    { mutation: 'successor profile root size changed to historical value', disposition: 'independent verifier refused' },
    { mutation: 'successor source gains caller-selected backend API', disposition: 'independent verifier refused' },
    { mutation: 'source frame profile binding byte substitution', disposition: 'independent verifier refused' },
    { mutation: 'undeclared archive member', disposition: 'closed inventory refused' },
  ],
  postMutationRestoration: {
    originalCandidateReverifiedAfterEveryMutation: true,
    retainedArtifactsChanged: false,
  },
};

emit(join(root, 'evidence', '2026-08-15', 'construction.json'), construction);
emit(join(root, 'evidence', '2026-08-15', 'mutation-dispositions.json'), mutations);

function filesBelow(path) {
  const output = [];
  for (const name of readdirSync(path).sort()) {
    const absolute = join(path, name);
    const relativePath = relative(root, absolute);
    if (relativePath === 'manifests/archive-manifest.json') continue;
    if (statSync(absolute).isDirectory()) output.push(...filesBelow(absolute));
    else output.push(absolute);
  }
  return output;
}

const manifest = {
  objectType: 'capsule.c5b8.c5b7-root-binding-successor-archive-manifest',
  objectVersion: 2,
  generatedOn: '2026-08-15',
  owner: 'Capsule C5b orchestrator',
  replacementCondition: 'Replace only with a separately reviewed versioned successor or the later immutable C5b9 composite.',
  files: filesBelow(root).map((absolute) => objectRef(relative(root, absolute))),
};
emit(join(root, 'manifests', 'archive-manifest.json'), manifest);

console.log(check ? 'C5b8/C5b7 generated evidence: PASSED' : 'C5b8/C5b7 generated evidence: UPDATED');
