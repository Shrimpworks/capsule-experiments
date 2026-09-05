import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, mkdirSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'c5b12-verify-'));
const run = (cmd, args, options = {}) => execFileSync(cmd, args, {
  cwd: root, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'], ...options,
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cases = [0, ...Array.from({length:23}, (_, i) => i + 2), ...Array.from({length:15}, (_, i) => i + 30)];
const flags = ['-arch','arm64','-std=c17','-Wall','-Wextra','-Werror','-fno-ident','-pthread'];
try {
  const materialPaths = ['inputs/attempt_bindings.h','inputs/completion.frame','inputs/input.frame',
    'inputs/source.frame','inputs/supervisor_effect_abi.h','scripts/generate.mjs','scripts/verify.mjs',
    'source/frames.h','source/transport.c','tests/transport_test.c'].sort();
  const actualPaths = ['inputs','scripts','source','tests'].flatMap(dir =>
    readdirSync(join(root,dir)).map(name => `${dir}/${name}`)).sort();
  assert.deepEqual(actualPaths,materialPaths,'closed source/input/test inventory');
  const materials = Object.fromEntries(materialPaths.map(path => {
    assert(lstatSync(join(root,path)).isFile(),`material must be a regular file: ${path}`);
    return [path,hash(readFileSync(join(root,path)))];
  }));
  run(process.execPath, ['scripts/generate.mjs', '--check']);
  const predecessor = join(root, '../typed-guest-transport-c5b11-bound-fault-convergent-no-run-successor');
  for (const name of ['supervisor_effect_abi.h', 'attempt_bindings.h'])
    assert.deepEqual(readFileSync(join(root, 'inputs', name)), readFileSync(join(predecessor, 'source', name)));
  for (const name of ['a','b']) {
    mkdirSync(join(temp, name));
    run('/usr/bin/clang', [...flags, '-O2', '-c', 'source/transport.c', '-o', join(temp, name, 'transport.o')]);
  }
  const object = readFileSync(join(temp,'a/transport.o'));
  assert.deepEqual(object, readFileSync(join(temp,'b/transport.o')));
  const exports = run('/usr/bin/nm', ['-gUj', join(temp,'a/transport.o')]).trim().split('\n').sort();
  const names = ['create_fixed_endpoints','verify_ready_byte','write_source_frame','write_input_frame','close_input_writers','send_start_byte','drain_validate_completion'];
  assert.deepEqual(exports, names.map(n => '_c5b11_supervisor_' + n).sort());
  const imports = run('/usr/bin/nm', ['-uj', join(temp,'a/transport.o')]).trim().split('\n').sort();
  const allowed = ['___chkstk_darwin','___error','___stack_chk_fail','___stack_chk_guard','_clock_gettime','_close','_fcntl','_memcmp','_memcpy','_pipe','_poll','_pthread_create','_pthread_join','_read','_write'];
  assert.deepEqual(imports, allowed.sort());
  for (const mode of ['normal','sanitized']) {
    const binary = join(temp,mode);
    const instrumentation = mode === 'sanitized' ? ['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer'] : ['-O2'];
    run('/usr/bin/clang', [...flags, ...instrumentation, 'tests/transport_test.c', '-o', binary]);
    for (const id of cases) {
      try { run(binary, [String(id)], { timeout: 4000 }); }
      catch (error) { throw new Error(`${mode} case ${id}: ${error.stderr || error.message}`); }
    }
  }
  // Each mutation is built in a disposable copy and must fail its targeted test.
  const mutations = [
    ['registration binding', 'memcmp(q->registration_id, registration, 16) == 0', 'true', 30],
    ['plan binding', 'memcmp(q->plan_sha256, c5b11_plan_sha256, 32) == 0', 'true', 32],
    ['request cap', 'q->maximum_bytes == maximum', '(maximum == maximum)', 35],
    ['exact completion', 'memcmp(state.completion, completion_frame, sizeof(completion_frame)) != 0', 'false', 5],
    ['trailer last', 'state.retained != sizeof(completion_frame)', 'state.retained < sizeof(completion_frame)', 7],
    ['ready trailing bytes', 'read_one(state.pipes[READY][0], &extra) != 0', '(extra = 0)', 18],
  ];
  for (const [name, from, to, id] of mutations) {
    const copy = join(temp, name.replaceAll(' ', '-'));
    for (const dir of ['source','inputs','tests']) cpSync(join(root,dir),join(copy,dir),{recursive:true});
    const path = join(copy,'source/transport.c');
    const original = readFileSync(path,'utf8');
    assert.equal(original.split(from).length, 2, name);
    writeFileSync(path,original.replace(from,to));
    const binary = join(copy,'mutant');
    // Mutation syntax warnings are allowed; compile failure is never a kill.
    run('/usr/bin/clang', ['-std=c17','-O2','-pthread',join(copy,'tests/transport_test.c'),'-o',binary]);
    let killed = false;
    try { run(binary,[String(id)],{timeout:4000}); }
    catch (error) { assert.equal(error.signal,'SIGABRT', `${name} must fail an assertion, not hang/crash`); killed = true; }
    assert(killed,`surviving mutation: ${name}`);
  }
  const result = { status:'PASSED', scope:'seven native transport providers; local pipes only',
    materials, objectSha256:hash(object), exports, imports, cases:cases.length, sanitizedCases:cases.length,
    mutations:mutations.length, guestEffects:'NONE',
    compiler:run('/usr/bin/clang',['--version']).trim(), os:run('/usr/bin/sw_vers',[]).trim(),
    sdk:run('/usr/bin/xcrun',['--show-sdk-version']).trim(), node:process.version };
  if (process.argv.includes('--record')) writeFileSync(join(root,'evidence/verification.json'),JSON.stringify(result,null,2)+'\n');
  else {
    const retained = JSON.parse(readFileSync(join(root,'evidence/verification.json'),'utf8'));
    assert.deepEqual(result.materials,retained.materials,'retained source/test evidence drift');
    assert.equal(result.objectSha256,retained.objectSha256,'retained object drift');
  }
  console.log(JSON.stringify(result,null,2));
} finally { rmSync(temp,{recursive:true,force:true}); }
