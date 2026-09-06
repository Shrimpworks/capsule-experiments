import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';

const root=resolve(import.meta.dirname,'..');
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const originBytes=readFileSync(join(root,'inputs/ORIGINS.json'));
assert.equal(sha256(originBytes),'fcc374cfcb306e83e9713b62b39d2efe76b2fdcdb10825b49c19618570ce7145','origin ledger changed; explicit successor required');
export const origins=JSON.parse(originBytes);
export function readInputs(directory=join(root,'inputs')) {
  assert.deepEqual(readdirSync(directory).sort(),['ORIGINS.json',...Object.keys(origins)].sort());
  return Object.fromEntries([...Object.keys(origins),'ORIGINS.json'].map(name=>{
    const path=join(directory,name),s=lstatSync(path);
    assert(s.isFile() && s.size<=1048576,`invalid input file: ${name}`);
    return [name,readFileSync(path)];
  }));
}
export function verifyInputs(inputs) {
  assert.deepEqual(Object.keys(inputs).sort(),['ORIGINS.json',...Object.keys(origins)].sort());
  assert.deepEqual(inputs['ORIGINS.json'],originBytes,'origin substitution');
  for(const [name,pin] of Object.entries(origins)) {
    assert.equal(inputs[name].length,pin.bytes,`length: ${name}`);
    assert.equal(sha256(inputs[name]),pin.sha256,`digest: ${name}`);
  }
}
function one(text,pattern) {
  const matches=[...text.matchAll(pattern)];
  assert.equal(matches.length,1,`unrecognized or ambiguous source: ${pattern}`);
  return matches[0][1];
}
export function audit(inputs) {
  verifyInputs(inputs);
  const text=name=>inputs[name].toString('utf8'),json=name=>JSON.parse(text(name));
  const old=json('c11-profile.json'),runtime=json('c11-runtime.json'),native=json('c14-results.json');
  const fixture=native.profiles[0],life=text('c14-lifecycle.c'),runner=text('c11-runner.c');
  assert.equal(native.status,'PASSED');assert.equal(native.profiles.length,4);
  assert.equal(sha256(inputs['c11-runtime.json']),old.components.attemptRuntimeProfile.sha256);
  assert.equal(sha256(inputs['c11-runner.c']),old.components.fixedRunnerSource.sha256);
  const mapped={'c14-lifecycle.c':'source/native/lifecycle.c','c14-transport.c':'inputs/c5b12-transport.c','c14-transitions.go':'source/store/transitions.go','c14-generate.mjs':'scripts/generate.mjs','c14-readme.md':'README.md','c14-abi.h':'inputs/supervisor_effect_abi.h'};
  for(const [name,path] of Object.entries(mapped))assert.equal(sha256(inputs[name]),native.materials[path]);
  assert.deepEqual(inputs['c11-abi.h'],inputs['c14-abi.h'],'logical ABI lineage');
  const rootBytes=Number(one(runner,/#define C5B11_ROOT_BYTES UINT64_C\((\d+)\)/g));
  assert.equal(rootBytes,runtime.runtimeRoot.bytes);assert.equal(rootBytes,old.runnerRoot.bytes);
  const argv=one(runner,/#define C5B11_RUNNER_ARGV0 "([^"]+)"/g);
  const fixtureArgv=one(life,/char \*const argv\[\]=\{"([^"]+)",NULL\}/g);
  assert.equal(fixtureArgv,fixture.argv[0]);
  const nativeSymbols=native.exports.filter(s=>s.startsWith('_c5b14b_supervisor_'));
  assert.equal(nativeSymbols.length,24);assert.equal(old.effectAbi.providerSymbols.length,24);
  assert.deepEqual(nativeSymbols.map(s=>s.replace('_c5b14b_','_c5b11_')).sort(),[...old.effectAbi.providerSymbols].sort());
  const teardown=one(life,/c5b13_supervisor_request_teardown\([\s\S]+?\) \{([\s\S]+?)\n\}/g);
  const gate=teardown.indexOf('if(c5b13_store_before_teardown(q)!=0)return refuse(r);');
  const clock=teardown.indexOf('life.cleanup_deadline=now+1000;');
  assert(gate>=0 && clock>gate,'unrecognized teardown clock/gate order');
  assert(text('c14-transport.c').includes('state.deadline = now + DEADLINE_MS;'));
  const setupMs=Number(one(text('c14-transport.c'),/DEADLINE_MS = (\d+)/g));
  assert.equal(setupMs,fixture.setupDeadlineMs);
  const reopen=one(text('c14-transitions.go'),/func \(s \*Store\) LookupRecovery\(q Request\) \(Cursor, error\) \{([\s\S]+?)\n\}/g);
  for(const token of ['next.Failure = 2','next.Step = 17','next.Resume = 17','next.Unresolved = true'])assert(reopen.includes(token));
  return {scope:'C5b15 exact-input static reconciliation only',status:'PASSED',
    directSubstitution:{status:'NO_GO',candidate:'unchanged C5b14B providers substituted into retained C5b11',
      rootBytes:{c5b11:rootBytes,c5b14b:fixture.root.length},argv0:{c5b11:argv,c5b14b:fixtureArgv},
      providerNamespaces:{c5b11:'_c5b11_',c5b14b:'_c5b14b_',logicalRoles:24},
      profileSHA256:{c5b11:old.components.attemptRuntimeProfile.sha256,c5b14b:native.artifacts[0]['inputs/profile.json']}},
    sourceObservations:{setupDeadlineMs:setupMs,setupClock:'endpoint-creation',cleanupDeadlineMs:1000,
      cleanupClock:'after-durable-teardown-gate-return',restartWithoutCustody:'unresolved-resume-17',
      executableCheck:'fixed-path-preflight-in-trusted-fixture-directory'},
    retainedTestimony:{source:'c14-results.json',nativeCases:native.cases.length,goSuites:native.passedGoTests.filter(n=>!n.includes('/')).length,mutations:native.mutations.length,freshlyRerun:false},
    remaining:{composition:'BLOCKED',launchIdentity:'BLOCKED',restartCustody:'BLOCKED',timing:'BLOCKED',provenance:'BLOCKED',candidateReview:'BLOCKED'},
    executionAuthorized:false,productAdmission:'BLOCKED',performedCandidateEffects:'NONE'};
}
export function verifyReport(report,inputs) {assert.deepEqual(report,audit(inputs),'report differs from exact static observations');}
