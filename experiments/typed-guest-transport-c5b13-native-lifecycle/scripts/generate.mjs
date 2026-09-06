import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
export const hash=b=>createHash('sha256').update(b).digest();
const root=resolve(import.meta.dirname,'..');
const array=(name,b)=>`static const uint8_t ${name}[${b.length}] = {${[...b].join(',')}};\n`;
export function prepare(out) {
  mkdirSync(join(out,'source'),{recursive:true}); mkdirSync(join(out,'inputs'),{recursive:true});
  const input=n=>readFileSync(join(root,'inputs',n));
  writeFileSync(join(out,'inputs/supervisor_effect_abi.h'),input('supervisor_effect_abi.h').toString().replaceAll('c5b11','c5b13').replaceAll('C5B11','C5B13'));
  let transport=input('c5b12-transport.c').toString().replaceAll('c5b11','c5b13').replaceAll('C5B11','C5B13');
  transport=transport.replace(/static const uint8_t registration\[16\] = \{[^}]+\};\nstatic const uint8_t attempt\[16\] = \{[^}]+\};\n/,'');
  transport=transport.replace('bool consumed, poisoned, draining;','bool consumed, poisoned, draining, close_uncertain;\n    pid_t owner;');
  transport=transport.replace('!r || state.poisoned || state.phase != phase ||','!r || (state.consumed && state.owner != getpid()) || state.poisoned || state.phase != phase ||');
  transport=transport.replace('state.consumed = true;','state.consumed = true;\n    state.owner = getpid();');
  transport=transport.replace('return fd < 0 ? 0 : close(fd);','int result = fd < 0 ? 0 : close(fd);\n    if (result != 0) state.close_uncertain = true;\n    return result;');
  transport=transport.replace('r->sequence = q->sequence;','r->failed_sequence = q->failed_sequence;\n    r->recovery_step = q->recovery_step;\n    r->durable_resume_step = q->durable_resume_step;\n    r->sequence = q->sequence;');
  transport=transport.replace('begin(q, r, 3, 1, 1, 1, NULL)','begin(q, r, 3, 2, 1, 1, NULL)');
  transport=transport.replace(/\/\* Experiment-only[\s\S]*?\*\//,'/* Generated C5b13 transport derivation; see scripts/generate.mjs. */');
  writeFileSync(join(out,'source/transport.c'),transport);
  writeFileSync(join(out,'source/payloads.h'),['source','input','completion'].map(n=>array(n+'_payload',input(n+'.payload'))).join(''));
  const bytes=Buffer.alloc(65536); for(let i=0;i<bytes.length;i++)bytes[i]=(i*17+29)%251;
  writeFileSync(join(out,'root.input'),bytes);
}
export function bind(out,mode) {
  const rootBytes=readFileSync(join(out,'root.input')),exe=readFileSync(join(out,'fixture-runner'));
  const profile={schema:'c5b13-benign-fixture-v1',mode,executable:{sha256:hash(exe).toString('hex'),length:exe.length},root:{sha256:hash(rootBytes).toString('hex'),length:rootBytes.length},fds:[0,1,2,3,4,5,6,7],argv:['fixture-runner'],environment:[],setupDeadlineMs:1000,cleanupDeadlineMs:1000};
  const encoded=p=>Buffer.from(JSON.stringify(p,null,2)+'\n');
  const profileBytes=encoded(profile),profileHash=hash(profileBytes);
  const payloads=Object.fromEntries(['source','input','completion'].map(n=>[n,readFileSync(join(root,'inputs',n+'.payload'))]));
  const planBytes=encoded({schema:'c5b13-fixture-plan-v1',profile:profileHash.toString('hex'),payloads:Object.fromEntries(Object.entries(payloads).map(([n,b])=>[n,{sha256:hash(b).toString('hex'),length:b.length}]))});
  const planHash=hash(planBytes),registration=hash(Buffer.concat([Buffer.from('c5b13 registration'),planHash])).subarray(0,16),attempt=hash(Buffer.concat([Buffer.from('c5b13 attempt'),planHash])).subarray(0,16);
  let bindings=array('registration',registration)+array('attempt',attempt)+array('c5b13_plan_sha256',planHash)+array('c5b13_profile_sha256',profileHash)+array('fixture_exe_sha256',hash(exe))+`#define FIXTURE_EXE_BYTES ${exe.length}\n`+array('fixture_root_sha256',hash(rootBytes));
  let frames='';
  for (const [index,name] of ['source','input','completion'].entries()) {
    const completion=index===2,b=payloads[name],header=Buffer.alloc(completion?160:152);
    header.write(['CPSRC001','CPINP001','CPCMP001'][index]);
    [1,1,index+1,header.length].forEach((v,i)=>header.writeUInt16BE(v,8+i*2));
    attempt.copy(header,16);registration.copy(header,32);planHash.copy(header,48);profileHash.copy(header,80);
    if(completion)header.writeUInt16BE(1,112);
    header.writeBigUInt64BE(BigInt(b.length),completion?120:112);hash(b).copy(header,completion?128:120);
    let frame=Buffer.concat([header,b]);
    if(completion){const t=Buffer.alloc(64);t.write('CPEND001');[1,1,3,64].forEach((v,i)=>t.writeUInt16BE(v,8+i*2));attempt.copy(t,16);hash(frame).copy(t,32);frame=Buffer.concat([frame,t]);}
    frames+=array(name+'_frame',frame); bindings+=array('c5b13_'+name+'_frame_sha256',hash(frame));
    writeFileSync(join(out,'inputs',name+'.frame'),frame);
  }
  writeFileSync(join(out,'inputs/attempt_bindings.h'),bindings);writeFileSync(join(out,'source/frames.h'),frames);
  writeFileSync(join(out,'inputs/profile.json'),profileBytes);writeFileSync(join(out,'inputs/plan.json'),planBytes);
}
