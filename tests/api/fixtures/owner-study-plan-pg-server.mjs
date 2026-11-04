// Built-API OS process restart proof; only explicit synthetic loopback fixtures.
import {Pool} from 'pg';
import {createIntegratedApi} from '../../../dist/apps/api/src/integration.js';
import {closedRepository} from '../../../dist/apps/api/src/repository.js';
import {createPostgresOwnerStudyPlanServices} from '../../../dist/apps/api/src/modules/academics/owner-study-plan-services-postgres.js';
import {PostgresEvidenceRightsResolver} from '../../../dist/apps/api/src/modules/opportunities/rights-postgres.js';

const url=new URL(process.env.HUFS_SYN_PLAN_URL??'https://invalid.invalid');
const actorId=process.env.HUFS_SYN_PLAN_ACTOR??'',token=process.env.HUFS_SYN_PLAN_TOKEN??'',expires=process.env.HUFS_SYN_PLAN_EXPIRES??'';
if(process.env.HUFS_SYN_PLAN_FIXTURE!=='1'||!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'
  ||url.port!=='15439'||url.pathname!=='/hufs_one_owner_academics_test'||url.search||url.hash
  ||url.username!=='hufs_test_owner_academics'||!/^SYN-ACADEMIC-[A-Z]+$/.test(actorId)||!/^[a-f0-9]{64}$/.test(token)
  ||!Number.isFinite(Date.parse(expires))||Date.parse(expires)<=Date.now())throw new Error('Isolated synthetic study-plan fixture required');
const pool=new Pool({connectionString:url.toString(),ssl:false,max:3,connectionTimeoutMillis:3000,statement_timeout:5000});
const sql={connect:async()=>{const c=await pool.connect();return {query:async(q,args=[])=>({rows:(await c.query(q,[...args])).rows}),release:()=>c.release()};}};
const actor={actorId,role:'BETA',sessionIdHash:token,csrfToken:token,betaAllowed:true,sessionExpiresAt:expires,schoolMailProofExpiresAt:expires};
const resolver=new PostgresEvidenceRightsResolver(sql);
const studyPlanCheck=createPostgresOwnerStudyPlanServices({pool:sql,
  authority:{resolve:({actorId:requested,now})=>requested===actorId?resolver.resolveFor({actor,now}):Promise.resolve(null)},
  ownerAuthority:{mayRead:async({actorId:requested})=>requested===actorId},
  approval:{isApproved:async input=>input.actorId===actorId&&input.coreVersion==='SYN-CORE-116'}});
const app=createIntegratedApi({allowedOrigin:'https://synthetic.invalid',repository:closedRepository,studyPlanCheck,
  auth:{verifySession:async request=>request.headers.cookie===`synthetic_session=${token}`?actor:null,revokeSession:async()=>{}}});
let closing=false;
async function close(){if(closing)return;closing=true;await app.close();await pool.end();process.disconnect?.();}
process.on('message',message=>{if(message==='STOP')void close();});process.on('disconnect',()=>{void close();});
try{
  await app.listen({host:'127.0.0.1',port:0});const address=app.server.address();
  if(!address||typeof address==='string')throw new Error('No loopback fixture address');
  process.send?.({port:address.port});
}catch{process.send?.({error:'Synthetic study-plan fixture unavailable'});await close();process.exitCode=1;}
