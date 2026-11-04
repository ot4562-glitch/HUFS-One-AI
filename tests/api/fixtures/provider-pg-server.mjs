// Synthetic-only child process fixture. Not part of any API build or deployment.
import {Pool} from 'pg';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {createPostgresGoogleAuth} from '../../../dist/apps/api/src/auth-postgres.js';
import {createIntegratedApi} from '../../../dist/apps/api/src/integration.js';
import {closedRepository} from '../../../dist/apps/api/src/repository.js';
import {createGoogleIdTokenVerifier} from '../../../dist/apps/api/src/modules/auth/google-oidc.js';
import {PostgresGoogleAuthStore} from '../../../dist/apps/api/src/modules/auth/google-auth-postgres.js';
import {PostgresBetaAdmissionStore} from '../../../dist/apps/api/src/modules/auth/beta-admission-postgres.js';
import {createBetaSessionRechecker} from '../../../dist/apps/api/src/modules/auth/beta-admission.js';
import {createPostgresProviderRuntime} from '../../../dist/apps/api/src/modules/ai/provider-postgres.js';

if(process.env.APP_ENV!=='test'||process.env.NODE_ENV!=='test'||!process.send)
  throw Error('Explicit synthetic child process required');
const config=JSON.parse(process.env.HUFS_SYNTHETIC_PROVIDER_CONFIG??'null');
const pools=[];
function sql(raw){
  const u=new URL(raw);
  if(u.hostname!=='127.0.0.1'||!['5432','55432'].includes(u.port)
    ||u.pathname!=='/hufs_one_provider_integration_test'||u.search||u.hash)
    throw Error('Isolated synthetic database required');
  const p=new Pool({connectionString:u.href,ssl:false,max:4,connectionTimeoutMillis:3000,statement_timeout:5000});
  pools.push(p);return {connect:async()=>{const c=await p.connect();return {
    query:async(text,args=[])=>({rows:(await c.query(text,[...args])).rows}),release:()=>c.release()};}};
}
const db=Object.fromEntries(Object.entries(config.urls).map(([k,v])=>[k,sql(v)]));
const origin='https://synthetic-provider.example.test',clientId='synthetic.apps.googleusercontent.com';
const keys=await generateKeyPair('RS256',{extractable:true});
const jwks=createLocalJWKSet({keys:[{...await exportJWK(keys.publicKey),kid:'synthetic-provider',alg:'RS256',use:'sig'}]});
const auth=createPostgresGoogleAuth({pools:{sessions:db.sessions,admission:db.admission,attempts:db.limiter},
  attemptDigestKey:Buffer.from(config.digestKey,'hex'),google:{clientId,allowedOrigin:origin,
    redirectUri:origin+'/api/auth/google/callback',verifyIdToken:createGoogleIdTokenVerifier({clientId,jwks}),
    exchangeCode:async({code})=>{
      if(!/^SYN-[A-Za-z0-9_-]{43}$/.test(code))throw Error('Synthetic authorization code required');
      const at=Math.floor(Date.now()/1000);
      return new SignJWT({sub:config.subject,email:config.subject.toLowerCase()+'@hufs.ac.kr',email_verified:true,
        hd:'hufs.ac.kr',nonce:code.slice(4)}).setProtectedHeader({alg:'RS256',kid:'synthetic-provider'})
        .setIssuer('https://accounts.google.com').setAudience(clientId).setIssuedAt(at-1).setExpirationTime(at+600).sign(keys.privateKey);
    }}});
const sessions=new PostgresGoogleAuthStore(db.sessions);
const betaCurrent=createBetaSessionRechecker(new PostgresBetaAdmissionStore(db.admission));
let releaseInference;
const transport={post:async input=>{
  await input.beforeSend();
  process.send({kind:'provider-call',stage:input.stage});
  const body=JSON.parse(input.body);
  if(input.stage==='TOKENIZE')return Response.json({status:{code:'20000'},result:{
    messages:body.messages.map(m=>({role:m.role,content:typeof m.content==='string'
      ?{type:'text',text:m.content,count:20}:m.content.map(v=>({...v,count:20}))})),
    ...(body.responseFormat?{responseFormat:{count:1}}:{})}});
  if(config.mode==='429'||config.mode==='503')return new Response('',{status:Number(config.mode)});
  if(config.mode==='timeout')await new Promise(resolve=>setTimeout(resolve,1800)); // deliberately ignores abort
  if(config.mode==='hold')await new Promise(resolve=>{releaseInference=resolve;});
  return Response.json({status:{code:'20000'},result:{message:{role:'assistant',content:JSON.stringify({
    task:'opportunity_terms',reviewRequired:true,objectTokens:[],citations:[{
      sourceToken:'DOC1',paragraphId:'p1',quote:'Synthetic approved notice'}]})},
    finishReason:'stop',usage:{promptTokens:41,completionTokens:20,totalTokens:61}}});
}};
const realAi=createPostgresProviderRuntime({pools:{authority:db.authority,budget:db.budget,results:db.results},
  phaseId:config.phase,operation:'HCX_007',inputPolicyVersion:'input-policy-1',policy:config.policy,
  enabled:()=>true,liveApproved:()=>true,timeoutMs:1200,transport,
  secret:async()=>{throw Error('Real provider credentials forbidden in synthetic fixture');},
  sessionIsCurrent:async({actor,now})=>{
    const saved=await sessions.readSession(actor.sessionIdHash,now);
    return saved?.actor.role==='BETA'&&saved.actor.actorId===actor.actorId&&await betaCurrent(saved.actor);
  }});
const app=createIntegratedApi({repository:closedRepository,allowedOrigin:origin,googleAuth:auth,realAi});
await app.listen({host:'127.0.0.1',port:0});
const address=app.server.address();
if(!address||typeof address==='string')throw Error('Loopback listener required');
process.send({kind:'ready',port:address.port});
let stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;releaseInference?.();await app.close();await Promise.all(pools.map(p=>p.end()));process.exit(0);};
process.on('message',m=>{if(m?.kind==='release')releaseInference?.();if(m?.kind==='stop')void stop();});
process.on('SIGTERM',()=>{void stop();});
