import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

const root=resolve(import.meta.dirname,'..');
assert(process.argv.slice(2).every(v=>v==='--record'),'unknown argument');
const record=process.argv.includes('--record');
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const env={...process.env,ZERO_AR_DATE:'1',GOFLAGS:'',GOEXPERIMENT:'',GOOS:'darwin',GOARCH:'arm64',CGO_ENABLED:'1',CC:'/usr/bin/clang',CXX:'/usr/bin/clang++',CGO_CFLAGS:'-O2 -g',CGO_CXXFLAGS:'-O2 -g',CGO_CPPFLAGS:'',CGO_LDFLAGS:'',GOTOOLCHAIN:'go1.25.13',GOCACHE:process.env.GOCACHE??join(tmpdir(),'capsule-c5b14b-go-cache')};
delete env.CAPSULE_C5B14_CRASH_MODE;delete env.CAPSULE_C5B14_CRASH_DIRECTORY;
const hash=b=>createHash('sha256').update(b).digest('hex');
function files(dir,prefix='') {return readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?files(join(dir,e.name),join(prefix,e.name)):[join(prefix,e.name)]);}
const materialPaths=['PLAN.md','README.md','go.mod',...['inputs','source','scripts','tests'].flatMap(d=>files(join(root,d),d))];
const materials=Object.fromEntries(materialPaths.sort().map(p=>[p,hash(readFileSync(join(root,p)))]));
const retained=record?null:JSON.parse(readFileSync(join(root,'evidence/results.json')));
if(retained)assert.deepEqual(materials,retained.materials,'stale material evidence; review changes before --record');
function run(cmd,args,{cwd=root,status=0,signal=null,timeout=60000,extraEnv={}}={}) {
  const r=spawnSync(cmd,args,{cwd,env:{...env,...extraEnv},encoding:'utf8',timeout,maxBuffer:12*1024*1024});
  assert.ifError(r.error);assert.equal(r.signal,signal,`${cmd} ${args.join(' ')}\n${r.stderr}`);
  assert.equal(r.status,status,`${cmd} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r.stdout+r.stderr;
}
const flags=['-std=c17','-Wall','-Wextra','-Werror','-Wno-deprecated-declarations','-pthread'];
const temp=mkdtempSync(join(tmpdir(),'capsule-c5b14b-verifier-'));
const builds=[],results=[],variants=[],mutations=[],artifacts={};
const modeFor=id=>[7,8,9,13].includes(id)?1:id===11?2:id===12?3:0;
function fixture(build,fn) {
  const dir=mkdtempSync(join(temp,'fixture-'));
  for(const name of ['fixture-runner','root.input'])cpSync(join(build,name),join(dir,name));
  return fn(dir);
}
function invoke(build,binary,args,dir,options={}) {return run(join(build,binary),args.map(String),{cwd:dir,timeout:9000,...options});}
function caseRun(build,binary,args,label) {fixture(build,dir=>invoke(build,binary,args,dir));results.push({variant:binary,case:label,status:'PASSED'});}
const mutationRoot=join(temp,'mutations');mkdirSync(mutationRoot);
try {
  assert.equal(run('go',['version']).trim(),'go version go1.25.13 darwin/arm64');
  run('go',['test','-count=1','source/bridge/contract.go','source/bridge/contract_test.go']);
  for(let mode=0;mode<4;mode++) {
    const build=join(temp,`mode${mode}`);builds.push(build);
    run('node',['scripts/build.mjs',build,String(mode)]);
    run('/usr/bin/clang',[...flags,'-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','tests/driver_test.c','owner.a','-o','driver-sanitized'],{cwd:build});
    run('/usr/bin/clang',[...flags,'-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','tests/normal.c','source/providers.c','owner.a','-o','native-sanitized'],{cwd:build});
    artifacts[mode]={};
    for(const p of ['fixture-runner','root.input','owner.a','owner.h','providers.o','native-driver','driver-test','inputs/profile.json','inputs/plan.json','inputs/attempt_bindings.h','inputs/supervisor_effect_abi.h','inputs/supervisor_effect_driver.c','inputs/source.frame','inputs/input.frame','inputs/completion.frame','source/transport.c','source/frames.h','source/lifecycle.c','source/providers.c','store/fixture_generated.go'])artifacts[mode][p]=hash(readFileSync(join(build,p)));
    console.log(`PASSED: build and store tests, variant ${mode}`);
  }
  const main=builds[0];
  const testEvents=run('go',['test','-json','-count=1','-timeout=45s','./store'],{cwd:main}).trim().split('\n').map(l=>JSON.parse(l));
  const passedGoTests=testEvents.filter(e=>e.Action==='pass'&&e.Test).map(e=>e.Test).sort();
  run('go',['test','-race','-count=1','-timeout=45s','./store'],{cwd:main});
  run('go',['vet','./store'],{cwd:main});
  run('go',['build','./store'],{cwd:main});
  const exports=run('/usr/bin/nm',['-gjU','providers.o'],{cwd:main}).trim().split('\n').sort();
  const imports=run('/usr/bin/nm',['-uj','providers.o'],{cwd:main}).trim().split('\n').sort();
  assert.equal(exports.filter(s=>s.startsWith('_c5b14b_supervisor_')).length,24);
  assert.equal(exports.length,28);
  assert.deepEqual(imports.filter(s=>s.startsWith('_Bridge')),['_BridgeApply']);
  assert.deepEqual(imports.filter(s=>s.startsWith('_c5b14b')),[]);
  const libraries=run('/usr/bin/otool',['-L','native-driver'],{cwd:main}).trim().split('\n').slice(1).map(s=>s.trim());
  assert.equal(libraries.length,1);assert(libraries[0].startsWith('/usr/lib/libSystem.B.dylib'));
  const rebuild=join(temp,'rebuild');run('node',['scripts/build.mjs',rebuild,'0']);
  for(const [p,digest] of Object.entries(artifacts[0]))assert.equal(hash(readFileSync(join(rebuild,p))),digest,`two-directory reproduction: ${p}`);
  console.log('PASSED: complete mode-0 reproduction and closed native provider inventory');
  for(const binary of ['driver-test','driver-sanitized']) {
    for(const id of [...Array.from({length:24},(_,i)=>i),29])caseRun(builds[modeFor(id)],binary,[id],`functional-${id}`);
    console.log(`PASSED: ${binary} functional/refusal cases`);
    for(const [scenario,effects,mode] of [[24,[14,15,17,18,19,20],1],[25,[21],0],[26,[22,23],0],[27,[24],0]]) {
      for(const effect of effects)for(const edge of [1,2,3])caseRun(builds[mode],binary,[scenario,effect,edge],`publication-${effect}-${edge}`);
    }
    console.log(`PASSED: ${binary} recovery publication matrix`);
    for(const [crash,reopen,mode] of [[50,60,0],[51,61,0],[52,60,1],[53,62,0]]) {
      fixture(builds[mode],dir=>{
        invoke(builds[mode],binary,[crash],dir,{status:73});
        if(crash===53)assert(existsSync(join(dir,'attempt-state/pending.json')));
        invoke(builds[mode],binary,[reopen],dir);
        if(crash===53)assert(existsSync(join(dir,'attempt-state/pending.json')),'orphan evidence erased');
      });
      results.push({variant:binary,case:`crash-reopen-${crash}`,status:'PASSED'});
    }
    for(const kind of ['missing','corrupt','cross-profile']) {
      fixture(main,dir=>{
        invoke(main,binary,[0],dir);
        const path=join(dir,'attempt-state/attempt.json');
        if(kind==='missing')rmSync(path);
        if(kind==='corrupt')writeFileSync(path,'{}\n');
        invoke(kind==='cross-profile'?builds[2]:main,binary,[62],dir);
      });
      results.push({variant:binary,case:`store-refusal-${kind}`,status:'PASSED'});
    }
    caseRun(main,binary==='driver-test'?'native-driver':'native-sanitized',[],'uninterposed-native');
    console.log(`PASSED: ${binary} restart/refusal and uninterposed cases`);
  }
  run('go',['build','-race','-buildmode=c-archive','-trimpath','-buildvcs=false','-ldflags=-buildid=','-o','owner-race.a','./bridge'],{cwd:main});
  const raceLink=run('/usr/bin/clang',[...flags,'-O2','tests/driver_test.c','owner-race.a','-o','driver-race'],{cwd:main});
  for(const id of [0,16,17,18,19,20,21,29])fixture(main,dir=>invoke(main,'driver-race',[id],dir));
  variants.push({name:'Go race archive',cases:8,status:'PASSED',linkerOutput:raceLink.trim()});
  const mutantCases=[
    ['spawn-gate',0,'source/providers.c','struct bridge_reply reply={0};\n    return q && q->effect==2 ? BridgeApply((struct c5b14b_effect_request *)q,&reply):-1;','return q && q->effect==2?0:-1;',[0],false],
    ['teardown-gate',1,'source/providers.c','struct bridge_reply reply={0};\n    return q && q->effect==16 ? BridgeApply((struct c5b14b_effect_request *)q,&reply):-1;','return q && q->effect==16?0:-1;',[13],false],
    ['native-absence',0,'source/providers.c','life.ownership_lost || !life.absent || !life.root_removed ||','life.ownership_lost || !life.root_removed ||',[18],false],
    ['recovery-checkpoint',1,'source/lifecycle.c','if(!recovery_begin(q,r,17) || store_checkpoint(q)!=0)return refuse(r);','if(!recovery_begin(q,r,17))return refuse(r);',[24,17,2],false],
    ['endpoint-terminal-cursor',0,'inputs/supervisor_effect_driver.c','if (result.outcome == C5B14B_EFFECT_APPLIED && result.facts == C5B14B_FACT_ATTEMPT_REOPENED && result.failed_sequence == 1 && result.recovery_step == 21 && result.durable_resume_step == 21) return -2;','if (0) return -2;',[10],false],
    ['native-terminal-exit',2,'source/lifecycle.c','WEXITSTATUS(life.terminal_status)!=0','false',[11],false],
    ['request-binding',0,'store/transitions.go','q.Binding != FixtureBinding() || ','',[16],true],
    ['native-frame-fields',0,'bridge/owner.go','q.maximum_bytes != 0 || q.frame_bytes != 0','false',[17],true],
    ['delivery-store-recheck',0,'bridge/owner.go','view, err := owner.View()','view, err := store.View{Completed:true}, error(nil)',[29],true],
    ['restart-fresh-refusal',0,'store/transitions.go','if !s.current.SpawnIntent {\n\t\treturn Cursor{Fresh: true}, nil','if len(s.current.Completion)==0 {\n\t\treturn Cursor{Fresh: true}, nil','crash',true],
  ];
  const expectedAssertions={
  "spawn-gate": "(BridgeFact(1)==1), function checked_spawn",
  "teardown-gate": "(BridgeFact(2)==1 && BridgeFact(6)==17), function checked_kill",
  "native-absence": "(c5b14b_supervisor_commit_durable_completion(&q,&r)==-1), function contract_refusals",
  "recovery-checkpoint": "(first<0 && BridgeFact(8)==0), function publication_matrix",
  "endpoint-terminal-cursor": "(c5b14b_drive_registered_attempt(registration)==-2), function main",
  "native-terminal-exit": "(result==-1 && spawn_calls==1 && BridgeFact(5)==20), function main",
  "request-binding": "(c5b14b_supervisor_lookup_recovery_cursor(&q,&r)==-1), function contract_refusals",
  "native-frame-fields": "(c5b14b_supervisor_commit_durable_completion(&q,&r)==-1), function contract_refusals",
  "delivery-store-recheck": "(BridgeCopyDelivery(b,sizeof(b))==-1), function main",
  "restart-fresh-refusal": "(result==-2 && BridgeFact(3)==1 && BridgeFact(6)==17), function main"
};
  for(const [name,mode,path,before,after,args,rebuildGo] of mutantCases) {
    const dir=join(mutationRoot,name);cpSync(builds[mode],dir,{recursive:true});
    const original=readFileSync(join(dir,path),'utf8');assert.equal(original.split(before).length,2,`mutation not unique: ${name}`);
    writeFileSync(join(dir,path),original.replace(before,after));
    if(rebuildGo)run('go',['build','-buildmode=c-archive','-trimpath','-buildvcs=false','-ldflags=-buildid=','-o','owner.a','./bridge'],{cwd:dir});
    run('/usr/bin/clang',[...flags,'-O2','tests/driver_test.c','owner.a','-o','mutant'],{cwd:dir});
    const output=fixture(dir,world=>{
      if(args==='crash')invoke(dir,'mutant',[50],world,{status:73});
      return invoke(dir,'mutant',args==='crash'?[60]:args,world,{status:null,signal:'SIGABRT'});
    });
    assert(output.includes('Assertion failed: '+expectedAssertions[name]),`mutation did not reach its intended assertion: ${name}\n${output}`);
    mutations.push({name,status:'PASSED',assertion:output.trim(),outputSHA256:hash(output)});
    console.log(`PASSED: compiled assertion mutation ${name}`);
  }
  const profiles=builds.map(dir=>JSON.parse(readFileSync(join(dir,'inputs/profile.json'))));
  const sanitizerArtifacts=builds.map(dir=>Object.fromEntries(['driver-sanitized','native-sanitized'].map(p=>[p,hash(readFileSync(join(dir,p)))])));
  variants[0].linkerOutput=variants[0].linkerOutput.replaceAll(temp,'<verifier-temp>');
  variants[0].artifacts=Object.fromEntries(['owner-race.a','driver-race'].map(p=>[p,hash(readFileSync(join(main,p)))]));
  const result={status:'PASSED',scope:'C5b14B local benign native fixture integration; installed/guest/product boundary BLOCKED',
    environment:{go:run('go',['version']).trim(),node:process.version,compiler:run('/usr/bin/clang',['--version']).trim(),os:run('/usr/bin/sw_vers',[]).trim(),sdk:run('/usr/bin/xcrun',['--show-sdk-version']).trim()},
    materials,profiles,artifacts,sanitizerArtifacts,passedGoTests,goRace:'PASSED',goVetBuild:'PASSED',
    cases:results,variants,mutations,exports,imports,libraries,
    reproduction:{mode:0,directories:2,artifacts:Object.keys(artifacts[0])},
    limits:['No interpreter/guest/backend, installed service, signing, Keychain or user content.',
      'No restart process-custody reconstruction, PID adoption, power-loss, rollback or installed-root claim.',
      'ASan/UBSan cover parent C code; ordinary Go archive and benign child are not instrumented by those native checks.',
      'Go race archive is a separate variant; linker diagnostic is retained. Debug sanitizer binaries are hashed but not included in two-directory reproduction.',
      'Bridge fixture provisioning, fault and copy-inspection exports are trusted test controls, not product/daemon APIs.']};
  if(retained) {
    for(const key of ['profiles','artifacts','passedGoTests','cases','exports','imports','libraries','reproduction'])assert.deepEqual(result[key],retained[key],`retained ${key} differs`);
    assert.deepEqual(result.mutations.map(m=>m.name),retained.mutations.map(m=>m.name));
  } else writeFileSync(join(root,'evidence/results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(`PASSED: ${results.length} native case records; ${passedGoTests.filter(n=>!n.includes('/')).length} Go suites/${passedGoTests.filter(n=>n.includes('/')).length} subtests; ${mutations.length} assertion mutations; 24 providers; reproduction and review-ready evidence.`);
} finally {
  // Any child orphaned by a deliberate parent assertion/crash has its own four-
  // second alarm. Preserve test directories until that containment bound elapses.
  await new Promise(resolve=>setTimeout(resolve,4500));
  rmSync(temp,{recursive:true,force:true});
}
