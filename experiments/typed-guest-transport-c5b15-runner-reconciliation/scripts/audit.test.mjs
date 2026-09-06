import assert from 'node:assert/strict';
import {test} from 'node:test';
import {audit,readInputs,verifyReport,origins} from './audit.mjs';

const inputs=readInputs();
test('exact inputs retain incompatible identities without readiness promotion',()=>{
  const r=audit(inputs);
  assert.deepEqual(r.directSubstitution.rootBytes,{c5b11:100663296,c5b14b:65536});
  assert.deepEqual(r.directSubstitution.argv0,{c5b11:'capsule-c5b11-fixed-runner',c5b14b:'fixture-runner'});
  assert.notEqual(r.directSubstitution.profileSHA256.c5b11,r.directSubstitution.profileSHA256.c5b14b);
  assert.equal(r.sourceObservations.cleanupClock,'after-durable-teardown-gate-return');
  assert.deepEqual(r.sourceObservations.restartLookup,{alreadyFenced:'return-existing-cursor',
    unfencedWithoutSpawnIntent:'fresh',unfencedSpawnIntentWithCompletion:'fenced-resume-22',
    unfencedSpawnIntentWithoutCompletion:'unresolved-resume-17',consumedIntentBranchesRequireSuccessfulPublish:true});
  assert.equal(r.directSubstitution.status,'NO_GO');assert.equal(r.executionAuthorized,false);
});
for(const name of Object.keys(origins))test(`changed exact input refuses: ${name}`,()=>{
  const altered=Buffer.from(inputs[name]);altered[0]^=1;
  assert.throws(()=>audit({...inputs,[name]:altered}),/digest:/);
});
test('missing, extra and redirected inputs refuse',()=>{
  const missing={...inputs};delete missing['c11-runner.c'];
  assert.throws(()=>audit(missing));
  assert.throws(()=>audit({...inputs,'replacement-runner.c':Buffer.from('replacement')}));
  assert.throws(()=>audit({...inputs,'ORIGINS.json':Buffer.from('{}')}),/origin substitution/);
});
for(const [name,change] of [
  ['execution authorization',r=>{r.executionAuthorized=true;}],
  ['composition readiness',r=>{r.remaining.composition='PASSED';}],
  ['fresh execution testimony',r=>{r.retainedTestimony.freshlyRerun=true;}],
  ['cleanup clock hides publication',r=>{r.sourceObservations.cleanupClock='before-durable-teardown-gate';}],
  ['root identity collapse',r=>{r.directSubstitution.rootBytes.c5b14b=100663296;}],
  ['restart custody promotion',r=>{r.sourceObservations.restartLookup.unfencedSpawnIntentWithoutCompletion='recovered-child';}],
])test(`false report refuses: ${name}`,()=>{
  const report=audit(inputs);change(report);assert.throws(()=>verifyReport(report,inputs),/report differs/);
});
