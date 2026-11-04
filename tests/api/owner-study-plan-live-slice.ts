import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {expect} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {createPostgresPlatformServices} from '../../apps/api/src/platform-postgres.js';
import {PostgresEvidenceRightsResolver} from '../../apps/api/src/modules/opportunities/rights-postgres.js';
import type {OwnerCatalogAuthority} from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

type Fixture={actorId:string;sourceId:string;revisionId:string;permissionRef:string;before:string;expires:string;
  authority:OwnerCatalogAuthority;insert:(kind:string,entity:string,value:unknown,id:string)=>Promise<void>};
/** Called only by the opt-in suite AFTER fresh-empty DB/loopback/migrations checks. */
export async function proveOwnerStudyPlanPg(options:{admin:Pool;reader:Pool;databaseUrl:URL;password:string;
  adapter:(pool:Pool)=>ReviewerSqlPool;fixture:Fixture}){
  const {admin,reader,fixture:f,adapter}=options;
  if(!/^[a-f0-9]{48}$/.test(options.password))throw new Error('Synthetic role password required');
  await admin.query(`CREATE ROLE hufs_test_owner_plan_writer LOGIN PASSWORD '${options.password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO hufs_test_owner_plan_writer;
    GRANT SELECT,INSERT,UPDATE ON api_self_consents TO hufs_test_owner_plan_writer;
    GRANT SELECT,INSERT,UPDATE,DELETE ON api_self_profiles,api_self_workspace_records,api_experience_tag_approvals TO hufs_test_owner_plan_writer;
    GRANT INSERT ON api_self_consent_events,api_self_workspace_events,api_experience_tag_events TO hufs_test_owner_plan_writer;`);
  const target=new URL(options.databaseUrl);target.username='hufs_test_owner_plan_writer';target.password=options.password;
  const writer=new Pool({connectionString:target.toString(),ssl:false,max:3,connectionTimeoutMillis:3000,statement_timeout:5000});
  let app:ReturnType<typeof createIntegratedApi>|undefined;
  try{
  const now=()=>new Date().toISOString(),term=`${new Date().getUTCFullYear()+1}-1`,origin='https://synthetic.invalid';
  const grants=await f.authority.resolve({actorId:f.actorId,now:now()});if(!grants)throw new Error('Synthetic source rights required');
  await f.insert('PLAN_INPUT',term,{term,transcript:{version:'SYN-T1',state:'APPROVED',attempts:[{
    attemptToken:'SYN-PRIVATE-ATTEMPT',canonicalCourseId:'SYN-PRIVATE-EARNED',creditUnits:6,ledger:'EARNED',areaIds:[],recognition:'RECOGNIZED',
    term:`${new Date().getUTCFullYear()-1}-1`}]},
    catalog:{version:'SYN-CATALOG',courseCreditUnits:{'SYN-A':6,'SYN-B':6},sections:['SYN-A','SYN-B'].map((canonicalCourseId,i)=>({
      canonicalCourseId,sectionId:canonicalCourseId+'-01',term,meetings:[{day:'MON',startMinute:540+i*60,endMinute:600+i*60}],
      evidenceRefs:['SYN-SECTIONS'],verifiedAt:f.before}))},
    rulePack:{version:'SYN-TERM-RULES',state:'APPROVED',termRules:{creditCapUnits:10,capEvidenceRefs:['SYN-CAP']}},
    approval:{rulePackState:'APPROVED',rulePackVersion:'SYN-TERM-RULES',officialEvidenceRefs:['SYN-CAP'],verifiedAt:f.before,
      sourceRightsVersion:grants.policyVersion,consentVersion:'1',coreVersion:'SYN-CORE-116'},
    evidenceLinks:['SYN-CAP','SYN-SECTIONS'].map(evidenceRef=>({evidenceRef,href:'https://synthetic.invalid/'+evidenceRef,verifiedAt:f.before})),
    visibility:{mode:'OWNER_VERIFIED',allowedCourseRefs:['SYN-A','SYN-B']}},f.actorId+'-TERM');
  const token=randomBytes(32).toString('hex'),actor={actorId:f.actorId,role:'BETA' as const,sessionIdHash:token,csrfToken:token,betaAllowed:true,
    sessionExpiresAt:f.expires,schoolMailProofExpiresAt:f.expires};
  let identity:typeof actor|null=actor,ownerAllowed=true,approved=true,duringApproval:(()=>Promise<void>)|undefined;
  const sql=adapter(reader),write=adapter(writer),mayOwn=async({actorId}:{actorId:string})=>actorId===f.actorId&&ownerAllowed;
  const open=()=>createIntegratedApi({allowedOrigin:origin,now,
    ...createPostgresPlatformServices({pools:{projections:sql,calendar:sql,evidence:sql,personal:write},evidenceRights:new PostgresEvidenceRightsResolver(sql),
      selfAccount:{pool:write,authority:{mayAccess:mayOwn}},ownerWorkspace:{pool:write,authority:{mayOperate:mayOwn}},
      ownerStudyPlan:{pool:sql,authority:f.authority,ownerAuthority:{mayRead:mayOwn},
        approval:{isApproved:async input=>{await duringApproval?.();return approved&&input.coreVersion==='SYN-CORE-116';}}},now}),
    auth:{verifySession:async()=>identity,revokeSession:async()=>{}}});
  const activeApp=open();app=activeApp;const headers={origin,'x-csrf-token':token};
  const value=(courseId:string)=>({kind:'STUDY_PLAN',dataMode:'OWNER_CONSENTED',state:'DRAFT',courseId,targetTerm:term,planned:true});
  const afterWrites=async()=>{
    const at=(await admin.query('SELECT clock_timestamp() AS at')).rows[0]!.at as Date,deadline=Date.now()+1000;
    while(Date.now()<=at.getTime()){if(Date.now()>deadline)throw new Error('Synthetic clocks disagree');await new Promise(resolve=>setTimeout(resolve,2));}
  };
  const check=async(expectedPlanVersion?:string)=>activeApp.inject({method:'POST',url:'/api/study-plans/check',headers,
    payload:{term,...(expectedPlanVersion?{expectedPlanVersion}:{})}});
    expect((await activeApp.inject({method:'POST',url:'/api/study-plans/check',payload:{term}})).statusCode).toBe(403);
    for(const courseId of ['SYN-A','SYN-B']){
      const response=await activeApp.inject({method:'POST',url:'/api/study-plans',headers,payload:{itemId:courseId,value:value(courseId)}});
      expect(response.statusCode,response.body).toBe(201);
    }
    await afterWrites();const first=await check();expect(first.statusCode,first.body).toBe(200);
    const initial=first.json();expect(initial).toMatchObject({state:'READY',termLoadCreditUnits:12,creditCapUnits:10,
      planIssues:[{code:'CREDIT_CAP_EXCEEDED',courseRefs:['SYN-A','SYN-B']}]});
    expect(first.body).not.toMatch(/SYN-PRIVATE|attemptToken|actorId|receipt/);
    const edited=await activeApp.inject({method:'PUT',url:'/api/study-plans/SYN-B',headers,payload:{expectedVersion:1,value:{...value('SYN-B'),planned:false}}});
    expect(edited.statusCode,edited.body).toBe(200);await afterWrites();
    const stale=await check(initial.versions.plan);expect(stale.statusCode,stale.body).toBe(409);
    const changed=await check();expect(changed.statusCode,changed.body).toBe(200);
    const current=changed.json();expect(current.termLoadCreditUnits).toBe(6);expect(current.planIssues).toEqual([]);
    const childUrl=new URL(options.databaseUrl);childUrl.hostname='127.0.0.1';childUrl.username='hufs_test_owner_academics';childUrl.password=options.password;
    const restart=async()=>{
      const child=spawn(process.execPath,[fileURLToPath(new URL('./fixtures/owner-study-plan-pg-server.mjs',import.meta.url))],{
        windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,
          HUFS_SYN_PLAN_FIXTURE:'1',HUFS_SYN_PLAN_URL:childUrl.toString(),HUFS_SYN_PLAN_ACTOR:f.actorId,HUFS_SYN_PLAN_TOKEN:token,HUFS_SYN_PLAN_EXPIRES:f.expires}});
      let exited=false;const exit=new Promise<void>(resolve=>child.once('close',()=>{exited=true;resolve();}));
      const ready=new Promise<number>((resolve,reject)=>{child.once('error',()=>reject(new Error('Synthetic study-plan launch failed')));
        child.once('close',()=>reject(new Error('Synthetic study-plan process exited')));
        child.once('message',(message:any)=>Number.isInteger(message?.port)?resolve(message.port):reject(new Error('Synthetic process unavailable')));});
      const deadline=setTimeout(()=>child.kill(),15000);
      try{
        const port=await ready,url=`http://127.0.0.1:${port}/api/study-plans/check`;
        const response=await fetch(url,{method:'POST',headers:{...headers,cookie:`synthetic_session=${token}`,'content-type':'application/json'},
          body:JSON.stringify({term,expectedPlanVersion:current.versions.plan}),signal:AbortSignal.timeout(5000)});
        expect(response.status).toBe(200);const result=await response.json();
        expect(result).toMatchObject({termLoadCreditUnits:6,creditCapUnits:10,versions:current.versions,planIssues:[],state:'READY'});
        expect(JSON.stringify(result)).not.toMatch(/SYN-PRIVATE|attemptToken|actorId|receipt/);
      }finally{if(!exited&&child.connected)child.send('STOP');await exit;clearTimeout(deadline);}
    };
    await restart();await restart();
    identity={...actor,actorId:'SYN-FOREIGN'};expect((await check()).statusCode).toBe(403);identity=actor;
    ownerAllowed=false;expect((await check()).statusCode).toBe(403);ownerAllowed=true;
    approved=false;expect((await check()).statusCode).toBe(503);approved=true;
    duringApproval=async()=>{duringApproval=undefined;await admin.query("UPDATE api_self_workspace_records SET version=version+1,updated_at=clock_timestamp() WHERE actor_id=$1 AND item_id='SYN-A'",[f.actorId]);};
    expect((await check()).statusCode).toBe(503); // gate wrapper detects the late plan mutation
    await afterWrites();expect((await check()).statusCode).toBe(200);
    const withdrawn=await activeApp.inject({method:'PUT',url:'/api/consents',headers,payload:{expectedVersion:1,
      choices:{personalStorage:false,teamReview:false,externalAi:false,ncpStorage:false,presentation:false}}});
    expect(withdrawn.statusCode,withdrawn.body).toBe(200);expect((await check()).statusCode).toBe(403);
  }finally{await app?.close();await writer.end();}
}
