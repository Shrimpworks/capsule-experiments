import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {prepare,bind,hash} from './generate.mjs';
const root=resolve(import.meta.dirname,'..'),temp=mkdtempSync(join(tmpdir(),'capsule-c5b13-'));
const run=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:20000,...options});
const flags=['-std=c17','-Wall','-Wextra','-Werror','-Wno-deprecated-declarations','-pthread'];
const cases=Array.from({length:27},(_,i)=>i);
const modeFor=id=>[2,3,6,7,8,13,14,21].includes(id)?1:[4,15].includes(id)?2:id===5?3:0;
try {
  const profiles={},objects={},generated={};
  for(let mode=0;mode<4;mode++) {
    const dir=join(temp,'mode'+mode);prepare(dir);
    cpSync(join(root,'source/fixture-runner.c'),join(dir,'source/fixture-runner.c'));
    cpSync(join(root,'source/lifecycle.c'),join(dir,'source/lifecycle.c'));
    mkdirSync(join(dir,'tests'));cpSync(join(root,'tests/lifecycle_test.c'),join(dir,'tests/lifecycle_test.c'));
    run('/usr/bin/clang',[...flags,'-O2','-DFIXTURE_MODE='+mode,'source/fixture-runner.c','-o','fixture-runner'],{cwd:dir});bind(dir,mode);
    profiles[mode]=JSON.parse(readFileSync(join(dir,'inputs/profile.json')));
    run('/usr/bin/clang',[...flags,'-O2','-c','source/lifecycle.c','-o','lifecycle.o'],{cwd:dir});
    objects[mode]=hash(readFileSync(join(dir,'lifecycle.o'))).toString('hex');
    const rebuilt=join(temp,'rebuild'+mode);prepare(rebuilt);
    for(const name of ['fixture-runner.c','lifecycle.c'])cpSync(join(root,'source',name),join(rebuilt,'source',name));
    run('/usr/bin/clang',[...flags,'-O2','-DFIXTURE_MODE='+mode,'source/fixture-runner.c','-o','fixture-runner'],{cwd:rebuilt});bind(rebuilt,mode);
    run('/usr/bin/clang',[...flags,'-O2','-c','source/lifecycle.c','-o','lifecycle.o'],{cwd:rebuilt});
    generated[mode]={};
    for(const name of ['fixture-runner','root.input','lifecycle.o','inputs/profile.json','inputs/plan.json','inputs/attempt_bindings.h','inputs/supervisor_effect_abi.h','inputs/source.frame','inputs/input.frame','inputs/completion.frame','source/transport.c','source/frames.h','source/payloads.h']) {
      const bytes=readFileSync(join(dir,name));assert.deepEqual(readFileSync(join(rebuilt,name)),bytes,`reproduction ${mode}/${name}`);
      generated[mode][name]=hash(bytes).toString('hex');
    }
    for(const variant of ['normal','sanitized']) {
      run('/usr/bin/clang',[...flags,...(variant==='normal'?['-O2']:['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer']),'tests/lifecycle_test.c','-o',variant],{cwd:dir});
      for(const id of cases.filter(id=>modeFor(id)===mode)) {
        const sandbox=join(temp,variant+'-'+id);mkdirSync(sandbox);
        cpSync(join(dir,'fixture-runner'),join(sandbox,'fixture-runner'));cpSync(join(dir,'root.input'),join(sandbox,'root.input'));
        try {run(join(dir,variant),[String(id)],{cwd:sandbox,timeout:6500});}
        catch(e){throw new Error(`${variant} case ${id}: ${e.stderr || e.message}`);}
      }
    }
  }
  const main=join(temp,'mode0');
  const exports=run('/usr/bin/nm',['-gjU',join(main,'lifecycle.o')]).trim().split('\n').sort();
  const providers=['create_fixed_endpoints','spawn_fixed_runner','verify_ready_byte','write_source_frame','write_input_frame','close_input_writers','send_start_byte','drain_validate_completion','join_terminal_state','prove_authoritative_absence','remove_fixed_root','request_teardown','reconcile_teardown_outcome','reconcile_terminal_state','reconcile_authoritative_absence','reconcile_fixed_root_removal'];
  assert.deepEqual(exports,providers.map(n=>'_c5b13_supervisor_'+n).sort());
  const imports=run('/usr/bin/nm',['-uj',join(main,'lifecycle.o')]).trim().split('\n').sort();
  assert.deepEqual(imports,["_CC_SHA256_Final", "_CC_SHA256_Init", "_CC_SHA256_Update", "___chkstk_darwin", "___error", "___stack_chk_fail", "___stack_chk_guard", "_c5b13_store_before_spawn", "_c5b13_store_before_teardown", "_clock_gettime", "_close", "_fchmod", "_fcntl", "_fstat", "_getpid", "_getuid", "_kill", "_memcmp", "_memcpy", "_nanosleep", "_open", "_pipe", "_poll", "_posix_spawn", "_posix_spawn_file_actions_addclose", "_posix_spawn_file_actions_adddup2", "_posix_spawn_file_actions_destroy", "_posix_spawn_file_actions_init", "_posix_spawnattr_destroy", "_posix_spawnattr_init", "_posix_spawnattr_setflags", "_posix_spawnattr_setsigdefault", "_posix_spawnattr_setsigmask", "_pread", "_pthread_create", "_pthread_join", "_read", "_sigaction", "_unlink", "_waitpid", "_write"].sort());
  assert.deepEqual(imports.filter(n=>n.startsWith('_c5b13_')),['_c5b13_store_before_spawn','_c5b13_store_before_teardown']);
  const mutations=[
    ['spawn durable gate','source/lifecycle.c','c5b13_store_before_spawn(q)!=0','false',1],
    ['teardown durable gate','source/lifecycle.c','c5b13_store_before_teardown(q)!=0','false',2],
    ['request registration','source/transport.c','memcmp(q->registration_id, registration, 16) == 0','true',12],
    ['safe resume cursor','source/lifecycle.c','q->durable_resume_step!=(effect==16?17:effect)','false',14],
    ['root absence prerequisite','source/lifecycle.c','!life.absent || life.cleanup_uncertain','life.cleanup_uncertain',9],
    ['nonzero terminal refusal','source/lifecycle.c','WEXITSTATUS(life.terminal_status)!=0','false',15],
    ['reaped child signal prohibition','source/lifecycle.c','if(observation==0 && kill(life.child,SIGKILL)!=0)','if(observation>=0 && kill(life.child,SIGKILL)!=0)',15],
    ['transport close uncertainty','source/lifecycle.c',' || state.close_uncertain','',24],
    ['post-store deadline','source/lifecycle.c','c5b13_store_before_spawn(q)!=0 || remaining_ms()==0','c5b13_store_before_spawn(q)!=0',22],
  ];
  for(const [name,path,from,to,id] of mutations) {
    const copy=join(temp,'mutation-'+id+'-'+name.replaceAll(' ','-'));
    cpSync(join(temp,'mode'+modeFor(id)),copy,{recursive:true});
    const original=readFileSync(join(copy,path),'utf8');assert.equal(original.split(from).length,2,name);
    writeFileSync(join(copy,path),original.replace(from,to));
    run('/usr/bin/clang',['-std=c17','-Wno-deprecated-declarations','-pthread','-O2','tests/lifecycle_test.c','-o','mutant'],{cwd:copy});
    let killed=false;
    try {run(join(copy,'mutant'),[String(id)],{cwd:copy,timeout:6500,stdio:['ignore','pipe','pipe']});}
    catch(e){assert.equal(e.signal,'SIGABRT',`${name}: must fail assertion, not timeout or compile`);killed=true;}
    assert(killed,`surviving mutation ${name}`);
  }
  const materials={};
  for(const dir of ['source','tests','scripts','inputs'])for(const file of readdirSync(join(root,dir)).sort())materials[dir+'/'+file]=hash(readFileSync(join(root,dir,file))).toString('hex');
  const result={status:'PASSED',scope:'same-session benign native lifecycle fixture; test-only store acknowledgments',materials,profiles,objects,generated,exports,imports,mutations:mutations.map(m=>m[0]),cases:cases.length,sanitizedCases:cases.length,guestEffects:'NONE',storeEvidence:'NONE',compiler:run('/usr/bin/clang',['--version']).trim(),os:run('/usr/bin/sw_vers',[]).trim(),sdk:run('/usr/bin/xcrun',['--show-sdk-version']).trim()};
  if(process.argv.includes('--record'))writeFileSync(join(root,'evidence/verification.json'),JSON.stringify(result,null,2)+'\n');
  else {const recorded=JSON.parse(readFileSync(join(root,'evidence/verification.json')));assert.deepEqual(result.materials,recorded.materials);assert.deepEqual(result.objects,recorded.objects);assert.deepEqual(result.generated,recorded.generated);}
  console.log(JSON.stringify(result,null,2));
} finally {rmSync(temp,{recursive:true,force:true});}
