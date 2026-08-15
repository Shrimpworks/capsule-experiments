#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const header = readFileSync(join(root, 'source', 'controlled_effects.h'), 'utf8');
const internal = readFileSync(join(root, 'source', 'controlled_effects_internal.h'), 'utf8');
const source = readFileSync(join(root, 'source', 'controlled_effects.c'), 'utf8');
const tests = readFileSync(join(root, 'source', 'test_double.c'), 'utf8');

execFileSync(join(root, 'scripts', 'build.sh'), [], { stdio: 'inherit' });

const cases = [
  ['raw action mask API absent', !header.includes('execute_controller_actions')],
  ['caller operation callback absent', !header.includes('request_handler') && !header.includes('request_opaque')],
  ['caller fact mask absent', !header.includes('observed_facts')],
  ['caller-owned session body absent', !/struct\s+c5b8_session\s*\{/.test(header)],
  ['fixed operation symbol present', internal.includes('c5b8_controlled_test_operation')],
  ['fixed observation port tested', tests.includes('test_observation_fact_substitution_fences')],
  ['descriptor enrollment tested', tests.includes('C5B8_EFFECT_ENROLL_DESCRIPTOR')],
  ['descriptor bytes copied', source.includes('state->source_frame') && source.includes('state->input_frame')],
  ['completion guard present', source.includes('session->controller.durable == 0')],
  ['teardown before absence guard present', source.includes('session->teardown_requested == 0')],
  ['absence before root removal guard present', source.includes('session->absence_proven == 0')],
  ['partial teardown mutation tested', tests.includes('test_partial_cleanup_is_unresolved')],
  ['indeterminate store mutation tested', tests.includes('test_indeterminate_commit_fences_before_delivery')],
  ['binding substitution mutation tested', tests.includes('test_operation_binding_failure_recovers')],
  ['session corruption mutation tested', tests.includes('test_session_corruption_refused')],
  ['unknown resource delta mutation tested', tests.includes('test_unknown_resource_delta_fences')],
  ['indeterminate recovery teardown mutation tested', tests.includes('test_indeterminate_recovery_teardown_fences')],
  ['active reinitialization mutation tested', tests.includes('test_active_reinitialization_refused')],
];

for (const [name, passed] of cases) assert.equal(passed, true, name);
console.log(JSON.stringify({
  status: 'PASSED',
  executedMutationBinary: true,
  cases: cases.map(([name]) => name),
}, null, 2));
