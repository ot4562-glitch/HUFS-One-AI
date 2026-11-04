/** Explicit loopback-only demonstration of the production EMPTY_DEMO contracts.
 * Memory storage and invented authentication only. Never a real owner session. */
import {createHash,randomBytes} from 'node:crypto';
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
const NAME='hufs_synthetic_empty_demo';
const Slot=z.enum(['A','B']);
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
 const actor=(slot:'A'|'B',ref:string)=>({role:'BETA' as const,actorId:'SYN-EMPTY-DEMO-'+slot,
   sessionIdHash:createHash('sha256').update(ref).digest('hex'),csrfToken:randomBytes(24).toString('hex'),betaAllowed:true as const,
   sessionExpiresAt:new Date(Date.parse(now())+3600000).toISOString(),
   schoolMailProofExpiresAt:new Date(Date.parse(now())+3600000).toISOString()});
 const bootstrap=actor('A','SYNTHETIC_BOOTSTRAP_ONLY');
 const isBootstrap=(request:{method:string;url:string;headers:Record<string,unknown>})=>
   request.method==='GET'&&request.url.split('?')[0]==='/api/dev/empty-demo/bootstrap'
   &&[undefined,'same-origin','none'].includes(request.headers['sec-fetch-site'] as string|undefined);
 const verify:VerifySession=async request=>isBootstrap(request)?bootstrap:sessions.get(key(request.headers.cookie)??'')??null;
 // Use the same base middleware and production route/service on loopback; the
 // production integrated composition continues to require HTTPS without exceptions.
 const app=createApi({allowedOrigin:options.allowedOrigin,now,
   repository:new MemoryApiRepository({profiles:[]}),verifySession:verify,
   revokeSession:async current=>{for(const [id,entry] of sessions)if(entry.sessionIdHash===current.sessionIdHash)sessions.delete(id);}});
 registerDemoProfileRoutes(app,new DemoProfileService(new MemorySyntheticDemoProfileStore(now)),{verify,now});
 app.get('/api/dev/empty-demo/bootstrap',async(request,reply)=>{
   const {slot}=z.strictObject({slot:Slot.default('A')}).parse(request.query);
   for(const [id,entry] of sessions)if(Date.parse(entry.sessionExpiresAt)<=Date.parse(now()))sessions.delete(id);
   if(sessions.size>=32)throw Error('Synthetic session limit reached; restart the local demo');
   const id=randomBytes(24).toString('hex');sessions.set(id,actor(slot,id));
   return reply.header('Set-Cookie',NAME+'='+id+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600')
     .redirect('/demo-profile');
 });
 return app;
}
