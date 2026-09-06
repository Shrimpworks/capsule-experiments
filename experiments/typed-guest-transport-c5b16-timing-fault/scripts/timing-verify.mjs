import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {analyze,cases,kinds} from './timing-analysis.mjs';
const root=resolve(import.meta.dirname,'..');
assert(process.argv.slice(2).every(v=>v==='--record'),'unknown argument');
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const record=process.argv.includes('--record');
const hash=b=>createHash('sha256').update(b).digest('hex');
function files(dir,prefix='') {return readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?files(join(dir,e.name),join(prefix,e.name)):[join(prefix,e.name)]);}
const materialPaths=['PLAN.md','README.md','go.mod',...['inputs','source','scripts','tests'].flatMap(d=>files(join(root,d),d))];
const materials=Object.fromEntries(materialPaths.sort().map(p=>[p,hash(readFileSync(join(root,p)))]));
for(const item of JSON.parse(readFileSync(join(root,'inputs/ORIGINS.json')))) {
  if(item.derivation==='unchanged')assert.equal(materials[item.path],item.sha256,'predecessor input substitution');
}
const retained=record?null:JSON.parse(readFileSync(join(root,'evidence/timing.json')));
function checkEvidence(evidence) {
  assert.equal(evidence.status,'PASSED');assert.equal(evidence.productAdmission,'BLOCKED');
  assert.deepEqual(evidence.kinds,kinds);assert.deepEqual(evidence.specifications,cases);
  assert.equal(evidence.runs.length,cases.length*2);
  for(const [i,run] of evidence.runs.entries()) {
    const spec=cases[i%cases.length];
    assert.equal(run.variant,i<cases.length?'ordinary':'parent-C-ASan-UBSan');
    assert.equal(run.rawSHA256,hash(JSON.stringify(run.raw)));
    assert.deepEqual(run.analysis,analyze(run.raw,spec),'retained timing summary');
  }
}
if(retained){assert.deepEqual(retained.materials,materials,'stale timing materials');checkEvidence(retained);}
const env={...process.env,ZERO_AR_DATE:'1',GOFLAGS:'',GOEXPERIMENT:'',GOOS:'darwin',GOARCH:'arm64',CGO_ENABLED:'1',CC:'/usr/bin/clang',CXX:'/usr/bin/clang++',CGO_CFLAGS:'-O2 -g',CGO_CXXFLAGS:'-O2 -g',CGO_CPPFLAGS:'',CGO_LDFLAGS:'',GOTOOLCHAIN:'go1.25.13',GOCACHE:join(tmpdir(),'capsule-c5b16-go-cache')};
const temp=mkdtempSync(join(tmpdir(),'capsule-c5b16-timing-'));
const flags=['-std=c17','-Wall','-Wextra','-Werror','-Wno-deprecated-declarations','-pthread'];
function run(cmd,args,{cwd=root,timeout=60000}={}) {
  const r=spawnSync(cmd,args,{cwd,env,encoding:'utf8',timeout,maxBuffer:12*1024*1024});
  assert.ifError(r.error);assert.equal(r.signal,null,`${cmd}\n${r.stdout}\n${r.stderr}`);assert.equal(r.status,0,`${cmd}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}
function invoke(build,binary,spec) {
  const dir=mkdtempSync(join(temp,'fixture-'));
  for(const name of ['fixture-runner','root.input'])cpSync(join(build,name),join(dir,name));
  return JSON.parse(run(join(build,binary),spec.args.map(String),{cwd:dir,timeout:9000}));
}
function replace(path,before,after) {const text=readFileSync(path,'utf8');assert.equal(text.split(before).length,2,'unique mutation');writeFileSync(path,text.replace(before,after));}
try {
  const environment={go:run('go',['version']).trim(),node:process.version,compiler:run('/usr/bin/clang',['--version']).trim(),os:run('/usr/bin/sw_vers',[]).trim(),hardware:run('/usr/sbin/sysctl',['-n','hw.model']).trim(),sdk:run('/usr/bin/xcrun',['--show-sdk-version']).trim()};
  const builds=[],artifacts=[];
  assert.equal(run('go',['version']).trim(),'go version go1.25.13 darwin/arm64');
  for(let mode=0;mode<=1;mode++) {
    const build=join(temp,`build-${mode}`);builds.push(build);
    run('node',['scripts/build.mjs',build,String(mode)]);
    run('/usr/bin/clang',[...flags,'-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','tests/timing.c','owner.a','-o','timing-sanitized'],{cwd:build});
    artifacts.push(Object.fromEntries(['timing-test','fixture-runner','owner.a','inputs/profile.json','inputs/plan.json','inputs/attempt_bindings.h','inputs/completion.frame'].map(p=>[p,hash(readFileSync(join(build,p)))])));
  }
  const runs=[];
  for(const [binary,variant] of [['timing-test','ordinary'],['timing-sanitized','parent-C-ASan-UBSan']]) {
    for(const spec of cases) {
      const raw=invoke(builds[spec.mode],binary,spec),analysis=analyze(raw,spec);
      runs.push({variant,raw,rawSHA256:hash(JSON.stringify(raw)),analysis});
      console.log(`PASSED: ${variant} ${spec.name} gate=${analysis.intervals.teardownGateMs} total=${analysis.intervals.totalTeardownAbsenceMs}`);
    }
  }
  const mutations=[];
  for(const [name,path,before,after,spec,go,expected] of [
    ['missing-teardown-request','source/lifecycle.c','timing_event(T_TEARDOWN_REQUEST,16,state.phase,0);','/* omitted observation */',cases[2],false,'missing teardown request/gate'],
    ['missing-absence','source/lifecycle.c','life.absent=true;timing_event(T_ABSENT,q->effect,state.phase,0);return applied(q,r,UINT64_C(1)<<10);','life.absent=true;return applied(q,r,UINT64_C(1)<<10);',cases[2],false,'absence observation count'],
    ['delay-not-executed','bridge/owner.go','time.Sleep(time.Duration(delayMS) * time.Millisecond)','time.Sleep(0)',cases[3],true,'delay not observed'],
  ]) {
    const build=join(temp,name);cpSync(builds[spec.mode],build,{recursive:true});
    // Both nominal and recovery absence sites deliberately share the exact line.
    if(name==='missing-absence') {
      const f=join(build,path),s=readFileSync(f,'utf8');assert.equal(s.split(before).length,3);writeFileSync(f,s.replaceAll(before,after));
    } else replace(join(build,path),before,after);
    if(go)run('go',['build','-buildmode=c-archive','-trimpath','-buildvcs=false','-ldflags=-buildid=','-o','owner.a','./bridge'],{cwd:build});
    run('/usr/bin/clang',[...flags,'-O2','tests/timing.c','owner.a','-o','timing-mutant'],{cwd:build});
    const raw=invoke(build,'timing-mutant',spec);
    let refusal;try{analyze(raw,spec);}catch(e){refusal=e.message;}
    assert(refusal&&refusal.includes(expected),`mutation accepted or wrong failure: ${name}: ${refusal}`);
    mutations.push({name,status:'PASSED',refusal,rawSHA256:hash(JSON.stringify(raw)),raw});
    console.log(`PASSED: compiled timing mutation ${name}`);
  }
  const evidence={status:'PASSED',productAdmission:'BLOCKED',materials,kinds,specifications:cases,artifacts,runs,mutations,
    environment,
    limits:['One fixed benign child, exclusive temporary directories, no guest/backend/installed authority.',
      'C ASan/UBSan covers parent C only; Go race checked separately in regression verifier.',
      'Finite sleeps model publication latency; no disk hang, power loss, load distribution, or product timer guarantee.',
      'Teardown request entry is fixture-local initial action, not a measured guest wall/cancel dispatch.',
      'Existing clock limits and durable order unchanged; refused gate has no Supervisor absence evidence.']};
  checkEvidence(evidence);
  // False retained claims must be rejected even if their raw digest is recomputed.
  for(const [name,change] of [
    ['false-product-admission',e=>e.productAdmission='PASSED'],
    ['false-total-bound',e=>e.runs[0].analysis.totalWithin1200=true],
    ['missing-case',e=>e.runs.pop()],
    ['reversed-time',e=>{e.runs[0].raw.events[1][0]=-1;e.runs[0].rawSHA256=hash(JSON.stringify(e.runs[0].raw));}],
    ['invented-absence',e=>{e.runs[0].raw.nativeAbsent=1;e.runs[0].rawSHA256=hash(JSON.stringify(e.runs[0].raw));}],
  ]) {
    const altered=structuredClone(evidence);change(altered);assert.throws(()=>checkEvidence(altered),undefined,name);
    mutations.push({name,status:'PASSED'});
  }
  if(retained) {
    assert.deepEqual(artifacts,retained.artifacts,'timing artifact reproduction');
    assert.deepEqual(mutations.map(m=>m.name),retained.mutations.map(m=>m.name));
  } else writeFileSync(join(root,'evidence/timing.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(`PASSED: ${runs.length} timing runs, ${mutations.length} observer/evidence mutations`);
} finally {
  await new Promise(resolve=>setTimeout(resolve,4500));
  rmSync(temp,{recursive:true,force:true});
}
