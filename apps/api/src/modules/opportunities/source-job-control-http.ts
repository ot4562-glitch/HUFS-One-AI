import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {SourceJobScopeSchema,SourceJobEnqueueSchema,SourceJobAcceptedSchema,SourceJobStatusSchema} from '@hufs-one/contracts';
import type {PostgresSourceIngestionQueue} from './source-ingestion-queue-postgres.js';
import {SourceQueueDenied,SourceQueueCapacity,SourceQueueConflict} from './source-ingestion-queue-postgres.js';
import {ApiFailure} from '../auth/gates.js';
import {betaActor,betaRecheck} from '../profiles/self-account-http.js';
import type {BetaRouteVerifier} from '../profiles/self-account-http.js';

export interface SourceJobOperatorAuthority {
  /** Separate operator policy, never ordinary BETA membership or source rights. */
  mayManage(input:{actorId:string;sourceId:string;permissionRef:string;now:string}):Promise<boolean>;
}
export type SourceJobControl={queue:Pick<PostgresSourceIngestionQueue,'enqueue'|'inspect'>;authority:SourceJobOperatorAuthority};
const Params=z.strictObject({jobId:z.uuid()}),Empty=z.strictObject({});
async function available<T>(fn:()=>Promise<T>){try{return await fn();}catch(error){
  if(error instanceof SourceQueueDenied)throw new ApiFailure('FORBIDDEN');
  if(error instanceof SourceQueueCapacity)throw new ApiFailure('RATE_LIMITED');
  if(error instanceof SourceQueueConflict)throw new ApiFailure('VERSION_CONFLICT');
  throw new ApiFailure('PROVIDER_UNAVAILABLE');
}}
const bound=<T>(schema:z.ZodType<T>,raw:unknown)=>{const p=schema.safeParse(raw);if(!p.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');return p.data;};

/** Control only. Dispatch/recovery stays in the explicitly invoked trusted
 * worker; no URL, input bytes, parser, network request or timer is accepted. */
export function registerSourceJobControlRoutes(options:{app:FastifyInstance;session:BetaRouteVerifier;control?:SourceJobControl}){
  const {app,session,control}=options;
  const mayManage=async(actorId:string,scope:{sourceId:string;permissionRef:string})=>{
    if(!control)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    if(await available(()=>control.authority.mayManage({actorId,...scope,now:session.now()}))!==true)throw new ApiFailure('FORBIDDEN');
  };
  app.post('/api/operator/source-jobs',async(request,reply)=>{
    const actor=await betaActor(request,session),input=SourceJobEnqueueSchema.parse(request.body);Empty.parse(request.query);
    const scope={sourceId:input.sourceId,permissionRef:input.permissionRef};
    await mayManage(actor.actorId,scope);await betaRecheck(request,session,actor);
    const result=bound(SourceJobAcceptedSchema,await available(()=>control!.queue.enqueue({...input,actorRef:actor.actorId})));
    await mayManage(actor.actorId,scope);await betaRecheck(request,session,actor);
    reply.code(result.created?202:200);return result;
  });
  app.get('/api/operator/source-jobs/:jobId',async request=>{
    const actor=await betaActor(request,session),{jobId}=Params.parse(request.params),scope=SourceJobScopeSchema.parse(request.query);
    const current=async()=>{
      await mayManage(actor.actorId,scope);await betaRecheck(request,session,actor);
      const raw=await available(()=>control!.queue.inspect({jobId,...scope,actorRef:actor.actorId}));
      if(raw===null)throw new ApiFailure('FORBIDDEN');
      const safe=bound(SourceJobStatusSchema,raw);
      if(safe.jobId!==jobId||safe.sourceId!==scope.sourceId)
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
      return safe;
    };
    await current();const result=await current();
    await mayManage(actor.actorId,scope);await betaRecheck(request,session,actor);return result;
  });
}
