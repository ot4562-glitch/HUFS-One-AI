// Explicit synthetic test fixture; built API process with no executable worker.
import {Pool} from 'pg';
import {createIntegratedApi} from '../../../dist/apps/api/src/integration.js';
import {createPostgresPlatformServices} from '../../../dist/apps/api/src/platform-postgres.js';
import {PostgresApprovedSourceRightsResolver} from '../../../dist/apps/api/src/modules/opportunities/rights-postgres.js';
const url=new URL(process.env.HUFS_SYN_JOB_URL??'https://invalid.invalid');
const token=process.env.HUFS_SYN_JOB_TOKEN??'',expires=process.env.HUFS_SYN_JOB_EXPIRES??'',actorId='SYN-JOB-OPERATOR';
if(process.env.HUFS_SYN_JOB_FIXTURE!=='1'||!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'
  ||!['5432','55448'].includes(url.port||'5432')||url.pathname!=='/hufs_one_full_test'||url.search||url.hash
  ||url.username!=='hufs_test_source_control'||!/^[a-f0-9]{64}$/.test(token)||!Number.isFinite(Date.parse(expires))||Date.parse(expires)<=Date.now())
  throw new Error('Explicit synthetic source-control fixture required');
const pool=new Pool({connectionString:url.toString(),ssl:false,max:3,connectionTimeoutMillis:3000,statement_timeout:5000});
const sql={connect:async()=>{const c=await pool.connect();return {query:async(q,args=[])=>({rows:(await c.query(q,[...args])).rows}),release:()=>c.release()};}};
const rights=new PostgresApprovedSourceRightsResolver(sql,{actorId});
const authority={mayProcess:async input=>{
  if(input.actorRef!==actorId)return false;const grant=await rights.resolve(input);
  return grant?.status==='APPROVED'&&grant.allowedPurposes.has('COLLECT')&&grant.allowedPurposes.has('STORE');
}};
const actor={actorId,role:'BETA',sessionIdHash:token,csrfToken:token,betaAllowed:true,sessionExpiresAt:expires,schoolMailProofExpiresAt:expires};
const app=createIntegratedApi({allowedOrigin:'https://synthetic.invalid',
  ...createPostgresPlatformServices({pools:{projections:sql,calendar:sql,personal:sql,evidence:sql},evidenceRights:{resolveFor:async()=>null},
    sourceIngestion:{pool:sql,authority,executor:{execute:async()=>{throw new Error('HTTP must never dispatch');}}},
    sourceIngestionOperator:{mayManage:async input=>input.actorId===actorId}}),
  auth:{verifySession:async request=>request.headers.cookie===`synthetic_session=${token}`?actor:null,revokeSession:async()=>{}}});
let closing=false;async function close(){if(closing)return;closing=true;await app.close();await pool.end();process.disconnect?.();}
process.on('message',message=>{if(message==='STOP')void close();});process.on('disconnect',()=>{void close();});
try{await app.listen({host:'127.0.0.1',port:0});const address=app.server.address();
  if(!address||typeof address==='string')throw new Error('No fixture address');process.send?.({port:address.port});
}catch{process.send?.({error:'Synthetic source-control fixture unavailable'});await close();process.exitCode=1;}
