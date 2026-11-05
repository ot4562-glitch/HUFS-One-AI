/** Explicit loopback-only demonstration of the production EMPTY_DEMO contracts.
 * Memory storage and invented authentication only. Never a real owner session. */
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {FastifyReply} from 'fastify';
import {z} from 'zod';
import {blankDemoProfileValue,blankDemoProfileWorkspace,DemoProfileRecordSchema,DemoProfileSaveSchema,
  DemoProfileWorkspaceSaveSchema,DemoProfileResetSchema,type DemoProfileRecord,type DemoProfileSave,
  type DemoProfileReset,type DemoProfileWorkspaceSave} from '@hufs-one/contracts';
import {createApi} from '../server.js';
import {registerDemoProfileRoutes} from '../modules/profiles/demo-profile-http.js';
import type {VerifySession} from '../types.js';
import {MemoryApiRepository} from '../repository.js';
import {DemoProfileConflict,DemoProfileService,type DemoProfileStore} from '../modules/profiles/demo-profile.js';
import type {VerifiedActor} from '../types.js';
import {MemorySyntheticClubDemoStore} from './synthetic-club-store.js';
import {FileSyntheticClubPosterStore} from '../modules/opportunities/synthetic-club-posters.js';
import {registerSyntheticClubRoutes,type TrustedSyntheticClubAdminAuthority} from '../modules/opportunities/synthetic-clubs-http.js';
const NAME='hufs_synthetic_empty_demo';
const Slot=z.enum(['A','B']);
const BETA_BOOTSTRAP='/api/dev/empty-demo/bootstrap';
const CLUB_BOOTSTRAP='/api/dev/synthetic-clubs/bootstrap';
const CLUB_ADMIN='SYN-EMPTY-DEMO-ADMIN';
function key(cookie:unknown):string|null{
 if(typeof cookie!=='string')return null;
 const values=cookie.split(';').map(x=>x.trim()).filter(x=>x.startsWith(NAME+'='));
 return values.length===1?values[0]!.slice(NAME.length+1):null;
}
export class MemorySyntheticDemoProfileStore implements DemoProfileStore{
 private readonly rows=new Map<string,{record:DemoProfileRecord;receipt:string}>();
 constructor(private readonly now:()=>string){}
 async read(actorId:string):Promise<DemoProfileRecord>{
   if(!/^SYN-EMPTY-DEMO-[AB]$/.test(actorId))throw Error('Only invented EMPTY_DEMO actors are supported');
   return structuredClone(this.rows.get(actorId)?.record??{version:0,value:blankDemoProfileValue(),
     workspace:blankDemoProfileWorkspace(),updatedAt:null});
 }
 private async change(actorId:string,kind:'SAVE'|'WORKSPACE'|'RESET',raw:DemoProfileSave|DemoProfileWorkspaceSave|DemoProfileReset){
   // No await separates the version check and commit.
   if(!/^SYN-EMPTY-DEMO-[AB]$/.test(actorId))throw Error('Only invented EMPTY_DEMO actors are supported');
   const old=this.rows.get(actorId),before=old?.record??{version:0,value:blankDemoProfileValue(),
     workspace:blankDemoProfileWorkspace(),updatedAt:null};
   const receipt=createHash('sha256').update(JSON.stringify({kind,raw})).digest('hex');
   if(before.version!==raw.expectedVersion){
     if(before.version===raw.expectedVersion+1&&old?.receipt===receipt)return structuredClone(before);
     throw new DemoProfileConflict();
   }
   const record=DemoProfileRecordSchema.parse({version:before.version+1,updatedAt:this.now(),
     value:kind==='SAVE'?(raw as DemoProfileSave).value:kind==='RESET'?blankDemoProfileValue():before.value,
     workspace:kind==='WORKSPACE'?(raw as DemoProfileWorkspaceSave).workspace:kind==='RESET'?blankDemoProfileWorkspace():before.workspace});
   this.rows.set(actorId,{record,receipt});return structuredClone(record);
 }
 async save(id:string,raw:DemoProfileSave){return this.change(id,'SAVE',DemoProfileSaveSchema.parse(raw));}
 async saveWorkspace(id:string,raw:DemoProfileWorkspaceSave){return this.change(id,'WORKSPACE',DemoProfileWorkspaceSaveSchema.parse(raw));}
 async reset(id:string,raw:DemoProfileReset){return this.change(id,'RESET',DemoProfileResetSchema.parse(raw));}
}
export function createSyntheticEmptyDemoApi(options:{mode:'SYNTHETIC';allowedOrigin:string;now?:()=>string}){
 if(options.mode!=='SYNTHETIC'||process.env.NODE_ENV==='production'||process.env.HUFS_DEPLOY_ENV==='production')
   throw Error('Explicit local SYNTHETIC mode only');
 const origin=new URL(options.allowedOrigin);
 if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||origin.origin!==options.allowedOrigin)
   throw Error('Exact HTTP loopback origin required');
 const now=options.now??(()=>new Date().toISOString());
 const sessions=new Map<string,Extract<VerifiedActor,{role:'BETA'|'ADMIN'}>>();
 const actor=(slot:'A'|'B'|'ADMIN',ref:string):Extract<VerifiedActor,{role:'BETA'|'ADMIN'}>=>({
   role:slot==='ADMIN'?'ADMIN':'BETA',actorId:'SYN-EMPTY-DEMO-'+slot,
   sessionIdHash:createHash('sha256').update(ref).digest('hex'),csrfToken:randomBytes(24).toString('hex'),betaAllowed:true as const,
   sessionExpiresAt:new Date(Date.parse(now())+3600000).toISOString(),
   schoolMailProofExpiresAt:new Date(Date.parse(now())+3600000).toISOString()});
 const verify:VerifySession=async request=>{
   const path=request.url.split('?')[0];
   if(path===BETA_BOOTSTRAP||path===CLUB_BOOTSTRAP){
     // Never fall back to an existing cookie for cross-site or auto-HEAD requests.
     if(request.method!=='GET'||![undefined,'same-origin','none'].includes(request.headers['sec-fetch-site'] as string|undefined)
       ||(request.headers.origin!==undefined&&request.headers.origin!==options.allowedOrigin))return null;
     // This short-lived internal proof only opens the explicit bootstrap routes;
     // it is not placed in the session map or returned to the browser.
     return actor('A','SYNTHETIC_BOOTSTRAP_ONLY');
   }
   return sessions.get(key(request.headers.cookie)??'')??null;
 };
 const adminAuthority:TrustedSyntheticClubAdminAuthority={isApproved:async({actor:current})=>{
   if(current.role!=='ADMIN'||current.actorId!==CLUB_ADMIN)return false;
   for(const issued of sessions.values())if(issued.role==='ADMIN'&&issued.actorId===CLUB_ADMIN
     &&issued.sessionIdHash===current.sessionIdHash)return true;
   return false;
 }};
 const clubs=new MemorySyntheticClubDemoStore({'SYN-EMPTY-DEMO-A':'S01','SYN-EMPTY-DEMO-B':'S02'},now);
 // The local launcher is run from the repository root; no browser path or URL
 // can select this committed synthetic manifest or its private poster files.
 const assetRoot=resolve('packages/fixtures/synthetic/clubs/generated');
 const posters=new FileSyntheticClubPosterStore(assetRoot,JSON.parse(readFileSync(join(assetRoot,'manifest.json'),'utf8')));
 // Use the same base middleware and production route/service on loopback; the
 // production integrated composition continues to require HTTPS without exceptions.
 const app=createApi({allowedOrigin:options.allowedOrigin,now,adminAuthority,
   repository:new MemoryApiRepository({profiles:[]}),verifySession:verify,
   revokeSession:async current=>{for(const [id,entry] of sessions)if(entry.sessionIdHash===current.sessionIdHash)sessions.delete(id);}});
 registerDemoProfileRoutes(app,new DemoProfileService(new MemorySyntheticDemoProfileStore(now)),{verify,now});
 registerSyntheticClubRoutes({app,session:{verify,now},source:clubs.source,
   publication:clubs.publication,moderation:clubs.moderation,posters,adminAuthority});
 const issueSession=(slot:'A'|'B'|'ADMIN',reply:FastifyReply)=>{
   for(const [id,entry] of sessions)if(Date.parse(entry.sessionExpiresAt)<=Date.parse(now()))sessions.delete(id);
   if(sessions.size>=32)throw Error('Synthetic session limit reached; restart the local demo');
   const id=randomBytes(24).toString('hex');sessions.set(id,actor(slot,id));
   return reply.header('Set-Cookie',NAME+'='+id+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600')
     .redirect(slot==='ADMIN'?'/clubs/admin':'/demo-profile');
 };
 app.get('/api/dev/empty-demo/bootstrap',async(request,reply)=>{
   const {slot}=z.strictObject({slot:Slot.default('A')}).parse(request.query);
   return issueSession(slot,reply);
 });
 app.get('/api/dev/synthetic-clubs/bootstrap',async(request,reply)=>{
   z.strictObject({}).parse(request.query);
   return issueSession('ADMIN',reply);
 });
 return app;
}
