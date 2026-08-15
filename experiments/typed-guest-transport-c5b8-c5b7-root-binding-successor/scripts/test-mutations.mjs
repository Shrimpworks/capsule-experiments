#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCandidate } from './verify-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(root, '..', '..');
const mutationRoot = mkdtempSync(join(tmpdir(), 'capsule-c5b8-root-binding-mutation.'));
let completed = 0;

function jsonMutation(path, mutate) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  mutate(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function mutateByte(path, offset) {
  const bytes = readFileSync(path);
  assert.ok(offset >= 0 && offset < bytes.length);
  bytes[offset] ^= 0x01;
  writeFileSync(path, bytes);
}

const cases = [
  {
    name: 'C5b7 root size substitution',
    expected: /100663296|rootBytes|root size|equal/i,
    mutate(candidate) {
      jsonMutation(join(candidate, 'inputs/c5b7/runtime-root-profile.json'), (value) => {
        value.root.bytes = 134217728;
      });
    },
  },
  {
    name: 'C5b7 root digest substitution',
    expected: /5ad18f20|rootSha256|equal/i,
    mutate(candidate) {
      jsonMutation(join(candidate, 'inputs/c5b7/runtime-root-profile.json'), (value) => {
        value.root.sha256 = '0'.repeat(64);
      });
    },
  },
  {
    name: 'sealed C5b8 object byte substitution',
    expected: /b15c4eb6|equal/i,
    mutate(candidate) {
      mutateByte(join(candidate, 'inputs/c5b8/controlled-effects.o'), 64);
    },
  },
  {
    name: 'successor profile historical root size substitution',
    expected: /100663296|rootBytes|equal/i,
    mutate(candidate) {
      jsonMutation(join(candidate, 'contracts/root-binding-profile.json'), (value) => {
        value.immutableProfile.rootBytes = 134217728;
      });
    },
  },
  {
    name: 'caller-selected backend API smuggling',
    expected: /widens authority|backend/i,
    mutate(candidate) {
      const path = join(candidate, 'source/root_binding_successor.h');
      writeFileSync(path, `${readFileSync(path, 'utf8')}\nvoid set_backend_configuration(const char *value);\n`);
    },
  },
  {
    name: 'source frame profile-binding substitution',
    expected: /equal/i,
    mutate(candidate) {
      mutateByte(join(candidate, 'fixtures/source.frame'), 80);
    },
  },
  {
    name: 'replacement plan digest',
    expected: /equal/i,
    mutate(candidate) {
      const path = join(candidate, 'contracts/no-run-plan.json');
      jsonMutation(path, (value) => {
        value.registrationId = '0'.repeat(32);
      });
    },
  },
  {
    name: 'historical adapter helper export',
    expected: /historical|equal/i,
    mutate(candidate) {
      const path = join(candidate, 'generated/historical_adapter_local.c');
      writeFileSync(path, readFileSync(path, 'utf8').replace(
        'static int32_t c5b5_historical_validate_immutable_profile',
        'int32_t c5b5_historical_validate_immutable_profile',
      ));
    },
  },
  {
    name: 'composite object substitution',
    expected: /equal/i,
    mutate(candidate) {
      mutateByte(join(candidate, 'dist/controlled-effects-root-bound-a.o'), 64);
    },
  },
  {
    name: 'undeclared archive member',
    expected: /equal/i,
    mutate(candidate) {
      writeFileSync(join(candidate, 'undeclared-authority.txt'), 'caller path\n');
    },
  },
];

try {
  assert.equal(verifyCandidate(root, repositoryRoot).status, 'PASSED');
  for (const entry of cases) {
    const candidate = join(mutationRoot, `case-${completed}`);
    cpSync(root, candidate, { recursive: true });
    entry.mutate(candidate);
    assert.throws(() => verifyCandidate(candidate, repositoryRoot), entry.expected, entry.name);
    assert.equal(verifyCandidate(root, repositoryRoot).status, 'PASSED',
      `original candidate did not restore after ${entry.name}`);
    completed += 1;
  }
} finally {
  rmSync(mutationRoot, { recursive: true, force: true });
}

console.log(`C5b8/C5b7 mutation and restoration verification: PASSED (${completed} cases)`);
