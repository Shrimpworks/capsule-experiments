#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const objectA = join(root, 'dist', 'controlled-effects-a.o');
const objectB = join(root, 'dist', 'controlled-effects-b.o');
const header = readFileSync(join(root, 'source', 'controlled_effects.h'), 'utf8');
const source = readFileSync(join(root, 'source', 'controlled_effects.c'), 'utf8');
const publicSurface = header.replace(/\/\*[\s\S]*?\*\//g, '');
const a = readFileSync(objectA);
const b = readFileSync(objectB);

assert.deepEqual(a, b, 'A/B production objects differ');
assert.equal(a.subarray(0, 4).toString('hex'), 'cffaedfe', 'not a 64-bit Mach-O object');

const symbols = execFileSync('nm', ['-g', objectA], { encoding: 'utf8' });
const undefinedSymbols = symbols.split('\n')
  .filter((line) => /\bU\b/.test(line))
  .map((line) => line.trim().split(/\s+/).at(-1))
  .sort();
assert.deepEqual(undefinedSymbols, [
  '_c5b3_controller_reset',
  '_c5b3_controller_step',
  '_c5b5_translate_controller_actions',
  '_c5b5_validate_immutable_profile',
  '_c5b8_controlled_test_operation',
]);

const exports = symbols.split('\n')
  .filter((line) => /\bT\b/.test(line))
  .map((line) => line.trim().split(/\s+/).at(-1))
  .sort();
assert.deepEqual(exports, ['_c5b8_apply_observation', '_c5b8_initialize']);

for (const forbidden of [
  /execute_controller_actions/,
  /observed_facts/,
  /request_handler/,
  /request_opaque/,
  /\(\s*\*[^)]*\)\s*\(/,
  /\bpath\b/i,
  /\bimage\b/i,
  /\bmount\b/i,
  /\bendpoint[_ ]?(path|name|config)/i,
  /\bbackend\b/i,
  /replacement[_ ]?plan/i,
]) {
  assert.equal(forbidden.test(publicSurface), false, `public header exposes forbidden surface: ${forbidden}`);
}

for (const forbidden of [
  /\bdlopen\b/,
  /\bdlsym\b/,
  /\bgetenv\b/,
  /\bposix_spawn\b/,
  /\bfork\b/,
  /\bexecve\b/,
  /\bopen\s*\(/,
  /\bsocket\s*\(/,
  /\bconnect\s*\(/,
  /\bSecKey\b/,
  /\bKeychain\b/,
]) {
  assert.equal(forbidden.test(source), false, `implementation contains forbidden operation: ${forbidden}`);
}

const digest = createHash('sha256').update(a).digest('hex');
assert.equal(
  createHash('sha256').update(readFileSync(join(root, 'inputs', 'c5b0', 'fixtures', 'source.frame'))).digest('hex'),
  'c8d035b02af814c2df23916bb060018c50412dd208131ec37a65f87c94ce8173',
);
assert.equal(
  createHash('sha256').update(readFileSync(join(root, 'inputs', 'c5b0', 'fixtures', 'input.frame'))).digest('hex'),
  'c4b66bba6dd33af06760118f34955b637308538d300ace79aa68381ae3f7f2c2',
);
assert.equal(
  createHash('sha256').update(readFileSync(join(root, 'inputs', 'c5b0', 'manifests', 'no-run-plan.json'))).digest('hex'),
  '5a806ac1628537c999e73b07b0d73d1a96a31507d1e91fd0f9a0535787e6fb64',
);
assert.equal(
  createHash('sha256').update(readFileSync(join(root, 'inputs', 'c5b0', 'manifests', 'successor-profile.json'))).digest('hex'),
  'c0a2d0ec6337d4cb4ed52e8a930a54a59ec3e677d4ad9da1a602c4cd7124f04b',
);
console.log(JSON.stringify({
  status: 'PASSED',
  objectBytes: a.length,
  objectSha256: digest,
  undefinedSymbols,
  exports,
  runtimeLoaded: false,
  guestLaunched: false,
  operationPort: '_c5b8_controlled_test_operation',
}, null, 2));
