import assert from 'node:assert/strict';
export const kinds=['','begin','applied','refused','setup-clock','executable-begin','executable-end',
  'root-begin','root-end','spawn-gate-begin','spawn-gate-end','spawn-call','spawn-return',
  'teardown-request','teardown-gate-end','cleanup-clock','signal-call','signal-return',
  'reaped','absence','publication-enter','publication-exit','drive-begin','drive-end','harness-reap'];
export const cases=[
  {name:'teardown-prepublish-refusal',mode:1,args:[13,16,1,0,1]},
  {name:'normal',mode:0,args:[0,2,1,0,0]},
  {name:'teardown-no-delay',mode:1,args:[13,16,1,0,0]},
  ...[1,2,3].flatMap(edge=>[800,1200,1600].map(ms=>({name:`teardown-edge${edge}-${ms}`,mode:1,args:[13,16,edge,ms,0]}))),
  ...[1,2,3].map(edge=>({name:`teardown-refusal-edge${edge}-1600`,mode:1,args:[13,16,edge,1600,1]})),
  ...[1,2,3].map(edge=>({name:`spawn-edge${edge}-1200`,mode:0,args:[0,2,edge,1200,0]})),
  {name:'spawn-edge1-800',mode:0,args:[0,2,1,800,0]},
];
const fields=['result','spawn','kill','phase','step','resume','unresolved','complete','nativeAbsent',
  'harnessReaped','harnessStatus','setupDeadlineNs','cleanupDeadlineNs','events'];
export function analyze(trace,spec) {
  assert.deepEqual(Object.keys(trace).sort(),fields.toSorted(),'trace fields');
  for(const key of fields.filter(k=>k!=='events'))assert(Number.isSafeInteger(trace[key]),key);
  const events=trace.events;
  assert(Array.isArray(events)&&events.length>0&&events.length<=512,'bounded trace');
  let prior=-1;
  for(const e of events) {
    assert(Array.isArray(e)&&e.length===5&&e.every(Number.isSafeInteger),'event tuple');
    assert(e[0]>=prior&&e[0]>=0&&e[0]<7e9,'monotonic bounded time');prior=e[0];
    assert(e[1]>0&&e[1]<kinds.length&&e[2]>=0&&e[2]<=24&&e[3]>=0&&e[3]<=24,'fixed event domain');
  }
  assert.equal(events[0][0],0);
  const all=(kind,effect)=>events.filter(e=>e[1]===kind&&(effect===undefined||e[2]===effect));
  const one=(kind,effect,required=true)=>{const a=all(kind,effect);assert(a.length<=1,'duplicate phase observation');if(required)assert.equal(a.length,1,`missing ${kinds[kind]}`);return a[0]??null;};
  const elapsed=(a,b)=>{if(!a||!b)return null;assert(b[0]>=a[0],'reversed interval');return (b[0]-a[0])/1e6;};
  const drive=one(22),end=one(23),setup=one(4),spawnGate=one(9),spawnEnd=one(10);
  assert.equal(end[4],trace.result,'drive outcome');
  for(const kind of [5,6,7,8])one(kind);
  assert.equal(one(6)[4],1);assert.equal(one(8)[4],1);
  assert(spawnGate[0]>=one(8)[0]);assert(spawnEnd[0]>=spawnGate[0]);
  assert(trace.setupDeadlineNs>setup[0]&&trace.setupDeadlineNs<=setup[0]+1e9,'setup clock unchanged');
  const [scenario,effect,edge,delay,fault]=spec.args;
  const entries=all(20,effect).filter(e=>e[4]===edge);
  const exits=all(21,effect).filter(e=>e[4]===edge);
  assert.equal(entries.length,1,'one publication delay edge');assert.equal(exits.length,1);
  const observedDelay=elapsed(entries[0],exits[0]);
  assert(observedDelay>=delay,'delay not observed');
  const request=one(13,16,false),gate=one(14,16,false),clock=one(15,16,false);
  const signal=one(16,16,false),signalReturn=one(17,16,false),absence=one(19,undefined,false);
  const reaped=one(18,undefined,false),harness=one(24,undefined,false);
  assert.equal(trace.kill,signal?1:0);assert.equal(trace.nativeAbsent,absence?1:0);
  assert.equal(trace.harnessReaped,harness?1:0);
  assert.equal(trace.spawn,all(11).length);assert.equal(trace.spawn,all(12).length);
  if(trace.spawn)assert(one(11)[0]>=spawnEnd[0]&&spawnEnd[4]===0,'intent before spawn');
  if(request)assert(gate&&gate[0]>=request[0]);
  if(signal) {
    assert(gate&&clock&&gate[4]===0,'durable gate before signal');
    assert(signal[0]>=clock[0]&&clock[0]>=gate[0]&&signal[4]===9);
    assert(signalReturn&&signalReturn[4]===0&&signalReturn[0]>=signal[0]);
  }
  if(clock) {
    assert.equal(clock[4],1000);
    assert(trace.cleanupDeadlineNs>clock[0]&&trace.cleanupDeadlineNs<=clock[0]+1e9,'cleanup clock unchanged');
  } else assert.equal(trace.cleanupDeadlineNs,-1);
  if(absence&&trace.spawn)assert(reaped&&absence[0]>=reaped[0],'reap before absence');
  if(scenario===13)assert(request&&gate,"missing teardown request/gate");
  if(fault) {
    assert.deepEqual([trace.result,trace.spawn,trace.kill,trace.phase,trace.step,trace.resume,trace.unresolved,trace.complete],[-2,1,0,2,17,17,1,0]);
    assert(gate[4]!==0&&!clock&&!signal&&!absence&&!reaped,'refusal must not invent custody');
    assert(harness&&trace.harnessStatus===14&&harness[0]>=end[0],'fixture SIGALRM only');
  } else if(effect===2&&delay>=1000) {
    assert.equal(trace.spawn,0);assert.equal(trace.kill,0);assert.equal(trace.result,-1);assert.equal(trace.complete,0);
    assert(spawnEnd[0]>=trace.setupDeadlineNs,'spawn refused after setup deadline');
  } else if(scenario===13) {
    assert.equal(trace.result,-1);assert.equal(trace.spawn,1);assert.equal(trace.kill,1);
    assert.equal(trace.step,20);assert.equal(trace.complete,0);assert.equal(trace.unresolved,0);
    assert(absence&&absence[0]<=trace.cleanupDeadlineNs,'observed cleanup deadline');
  } else {
    assert.equal(trace.result,0);assert.equal(trace.spawn,1);assert.equal(trace.kill,0);assert.equal(trace.complete,1);
    for(const effect of [3,4,5,6,7,8,9,10,11,12,13])one(2,effect);
  }
  const intervals={driveMs:elapsed(drive,end),executableMs:elapsed(one(5),one(6)),rootMs:elapsed(one(7),one(8)),
    spawnGateMs:elapsed(spawnGate,spawnEnd),injectedEdgeMs:observedDelay,
    teardownGateMs:elapsed(request,gate),postGateAbsenceMs:elapsed(gate,absence),
    cleanupClockAbsenceMs:elapsed(clock,absence),totalTeardownAbsenceMs:elapsed(request,absence),
    teardownSignalMs:elapsed(request,signal),harnessOnlyReapMs:elapsed(request,harness)};
  return {name:spec.name,intervals,totalWithin1200:intervals.totalTeardownAbsenceMs===null?null:intervals.totalTeardownAbsenceMs<=1200,
    supervisorAbsenceObserved:!!absence,fixtureAlarmOnly:!!fault,
    status:'PASSED',productTimingAdmission:'BLOCKED'};
}
