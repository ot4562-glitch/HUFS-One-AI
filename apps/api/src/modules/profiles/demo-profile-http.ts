import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {DemoProfileSaveSchema,DemoProfileResetSchema,DemoProfileResponseSchema} from '@hufs-one/contracts';
import {ApiFailure} from '../auth/gates.js';
import {betaActor,betaRecheck,type BetaRouteVerifier} from './self-account-http.js';
import {DemoProfileConflict,type DemoProfilePort} from './demo-profile.js';
const Empty=z.strictObject({});
/** Fail closed if the shared database is unavailable, and never take an actor
 * identity or an operation class from browser-controlled request fields. */
export interface DemoProfileQuotaPort {
  consume(actorId:string,operation:'READ'|'WRITE'):Promise<boolean>;
}
/** Register on createApi/createIntegratedApi so current-session, CSRF, exact-origin,
 * and no-store middleware apply before these handlers. */
export function registerDemoProfileRoutes(app:FastifyInstance,port:DemoProfilePort|undefined,
  verifier:BetaRouteVerifier,quota?:DemoProfileQuotaPort):void{
  // Synthetic local runs can use bounded process-local admission. In an
  // approved multi-replica runtime an explicitly injected database quota
  // must be used instead, with server-generated actor identity.
  const windows=new Map<string,{minute:number;reads:number;writes:number}>();
  const admit=async(actorId:string,write:boolean)=>{
    if(quota){
      let allowed:boolean;
      try{allowed=await quota.consume(actorId,write?'WRITE':'READ');}
      catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
      if(allowed!==true)throw new ApiFailure('RATE_LIMITED');
      return;
    }
    const at=Date.parse(verifier.now());
    if(!Number.isFinite(at))throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const minute=Math.floor(at/60_000);
    for(const [id,entry] of windows)if(entry.minute!==minute)windows.delete(id);
    let window=windows.get(actorId);
    if(!window){
      if(windows.size>=4096)throw new ApiFailure('RATE_LIMITED');
      window={minute,reads:0,writes:0};windows.set(actorId,window);
    }
    const key=write?'writes':'reads',limit=write?20:60;
    if(window[key]>=limit)throw new ApiFailure('RATE_LIMITED');
    window[key]++;
  };
  const run=async(fn:()=>Promise<unknown>)=>{
    try{
      const response=DemoProfileResponseSchema.safeParse(await fn());
      if(!response.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
      return response.data;
    }catch(error){
      if(error instanceof DemoProfileConflict)throw new ApiFailure('VERSION_CONFLICT');
      if(error instanceof ApiFailure)throw error;
      // A provider must not turn corrupt stored values into a client validation error.
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    }
  };
  for(const url of ['/api/demo-profile','/api/demo-profile/snapshot'])app.get(url,async request=>{
    Empty.parse(request.query);const actor=await betaActor(request,verifier);
    if(!port)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await admit(actor.actorId,false);
    const response=await run(()=>port.read(actor.actorId));
    await betaRecheck(request,verifier,actor);return response;
  });
  app.patch('/api/demo-profile',async request=>{
    Empty.parse(request.query);const actor=await betaActor(request,verifier);
    const input=DemoProfileSaveSchema.parse(request.body);
    if(!port)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await admit(actor.actorId,true);
    const response=await run(()=>port.save(actor.actorId,input));
    if(response.profile.version!==input.expectedVersion+1
      ||JSON.stringify(response.profile.value)!==JSON.stringify(input.value))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(request,verifier,actor);return response;
  });
  app.post('/api/demo-profile/reset',async request=>{
    Empty.parse(request.query);const actor=await betaActor(request,verifier);
    const input=DemoProfileResetSchema.parse(request.body);
    if(!port)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await admit(actor.actorId,true);
    const response=await run(()=>port.reset(actor.actorId,input));
    if(response.profile.version!==input.expectedVersion+1
      ||response.profile.value.primaryMajor!==null||response.profile.value.earnedCreditUnits!==null
      ||response.profile.value.interestTopics.length!==0||response.profile.value.doubleMajor!==null)
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(request,verifier,actor);return response;
  });
}
