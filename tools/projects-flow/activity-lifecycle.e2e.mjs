/**
 * The project Activity feed, and the record a task's lifecycle leaves behind.
 *
 *   node tools/activity-lifecycle.e2e.mjs      # expects the API on :4011, a SCRATCH database
 *
 * A project's activity is the whole matter's history in one list, so it is limited to the
 * project's own manager and to administrators. Two different filters return the same rows, and
 * gating only the obvious one would leave the other as a way straight past it — so both are
 * checked here, from an account that is neither.
 *
 * The lifecycle half exists because three of these four events used to leave no trace at all:
 * reopening in particular wrote the task row directly, so the count went up and nothing recorded
 * who had done it.
 */
const BASE='http://127.0.0.1:4011';
function sess(){let c='';return async(p,{method='GET',body}={})=>{const r=await fetch(BASE+'/api/v1'+p,{method,headers:{'content-type':'application/json',...(c?{cookie:c}:{})},body:body===undefined?undefined:JSON.stringify(body)});const sc=r.headers.getSetCookie?.()??[];if(sc.length)c=sc.map(x=>x.split(';')[0]).join('; ');const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch{d=t}return{status:r.status,data:d}};}
let pass=0;const fail=[];
const ok=(n,c,d='')=>{if(c){pass++;console.log('  ok  '+n)}else{fail.push(n+(d?'\n      '+d:''));console.log('  FAIL '+n+(d?'\n      '+d:''))}};
(async()=>{
  const admin=sess(), staff=sess();
  await admin('/auth/login',{method:'POST',body:{email:'mohit@squarkip.com',password:'sqip@1234'}});
  await staff('/auth/login',{method:'POST',body:{email:'divyanshu.saxena@squarkip.com',password:'sqip@1234'}});
  const meA=(await admin('/auth/me')).data; const AID=(meA.user??meA).id;

  console.log('\n— a project\'s activity is for its manager and admins —');
  const projects=(await staff('/projects')).data??[];
  const p=projects[0];
  ok('the employee can see the project itself', !!p, `${projects.length} projects visible`);
  if(p){
    const asStaff=await staff(`/activity?projectId=${p.id}`);
    const mgr=((await admin(`/projects/${p.id}`)).data?.members??[]).find(m=>m.projectRole==='MANAGER');
    const staffIsMgr = mgr && mgr.userId === ((await staff('/auth/me')).data.user??{}).id;
    if (staffIsMgr) {
      ok('(this employee happens to manage it, so they may read it)', asStaff.status===200, `status ${asStaff.status}`);
    } else {
      ok('an employee who does not manage it is refused', asStaff.status===403,
         `status ${asStaff.status} :: ${JSON.stringify(asStaff.data).slice(0,140)}`);
    }
    const asAdmin=await admin(`/activity?projectId=${p.id}`);
    ok('an administrator may read it', asAdmin.status===200, `status ${asAdmin.status}`);
    // the second door — same rows, different filter
    const backDoor=await staff(`/activity?entityType=PROJECT&entityId=${p.id}`);
    if (!staffIsMgr) ok('and the other route to the same rows is refused too', backDoor.status===403, `status ${backDoor.status}`);
  }

  console.log('\n— the task lifecycle leaves a record —');
  const mine=((await admin(`/tasks?userId=${AID}`)).data??[]).filter(t=>t.currentStatus?.type!=='CLOSED');
  const T=mine[0];
  if(T){
    const before=(await admin(`/activity?entityType=TASK&entityId=${T.id}&limit=100`)).data??[];
    await admin(`/tasks/${T.id}/start`,{method:'POST'});
    await admin(`/tasks/${T.id}/pause`,{method:'POST'});
    await admin(`/tasks/${T.id}/finish`,{method:'POST'});
    await admin(`/tasks/${T.id}/reopen`,{method:'POST'});
    const after=(await admin(`/activity?entityType=TASK&entityId=${T.id}&limit=100`)).data??[];
    const acts=new Set(after.map(a=>a.action));
    ok('starting a clock is recorded',  acts.has('task.started'),  [...acts].join(','));
    ok('pausing it is recorded',        acts.has('task.paused'),   [...acts].join(','));
    ok('finishing is recorded',         acts.has('task.finished'), [...acts].join(','));
    ok('reopening is recorded',         acts.has('task.reopened'), [...acts].join(','));
    // The feed returns a capped page newest-first, so counting rows says nothing once the cap is
    // reached. What matters is that the newest entry is now one of ours.
    ok('and the newest entry is one of the four just recorded',
       ['task.started','task.paused','task.finished','task.reopened'].includes(after[0]?.action),
       `newest=${after[0]?.action} (was ${before[0]?.action})`);
    const fin=after.find(a=>a.action==='task.finished');
    ok('each record names who did it', !!fin?.actor?.id, JSON.stringify(fin?.actor??null));
  }
  console.log(`\n${fail.length?'✗':'✓'} ${pass} passed, ${fail.length} failed\n`);
  fail.forEach(f=>console.error('  ✗ '+f+'\n'));
  process.exit(fail.length?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
