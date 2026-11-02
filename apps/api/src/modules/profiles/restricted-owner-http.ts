import {z} from 'zod';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {PrivateOwnerIntakeProfileSchema,PrivateOwnerIntakeTranscriptSchema,PrivateOwnerIntakeResponseSchema} from '@hufs-one/contracts';
import type {VerifiedTeamActor} from '../../types.js';
import type {createRestrictedOwnerDirectory} from '../private-intake/owner-registry.js';
import {ApiFailure} from '../auth/gates.js';
import {betaActor,betaRecheck,type BetaRouteVerifier} from './self-account-http.js';

export type RestrictedOwnerDirectoryPort=Pick<ReturnType<typeof createRestrictedOwnerDirectory>,'resolve'>;
const Empty=z.strictObject({});
const Ref=z.string().min(1).max(128);
const Snapshot=z.strictObject({
  actorId:Ref,subjectKey:Ref,storageNamespace:Ref,registryRevision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  profile:PrivateOwnerIntakeProfileSchema,
  transcript:PrivateOwnerIntakeTranscriptSchema.safeExtend({sourceSha256:z.string().regex(/^[a-f0-9]{64}$/)}),
  offeringStatus:z.literal('UNKNOWN'),rulesStatus:z.literal('NEEDS_REVIEW'),
});
type Snapshot=z.infer<typeof Snapshot>;

/** This optional dependency is an already restricted, permission-checking server adapter.
 * No registry/source loader or browser-selected owner is available at this HTTP boundary. */
export function registerRestrictedOwnerIntakeRoute(options:{app:FastifyInstance;session:BetaRouteVerifier;
  directory?:RestrictedOwnerDirectoryPort}):void{
  const {app,session,directory}=options;
  const receipts=new WeakMap<FastifyRequest,{actor:VerifiedTeamActor;snapshot:Snapshot}>();
  async function resolve(actor:VerifiedTeamActor,revalidation=false):Promise<Snapshot>{
    if(!directory)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    let raw:unknown;
    try{raw=await directory.resolve(actor.actorId);}
    catch{throw new ApiFailure(revalidation?'FORBIDDEN':'PROVIDER_UNAVAILABLE');}
    if(raw===null)throw new ApiFailure('FORBIDDEN');
    const parsed=Snapshot.safeParse(raw);
    if(!parsed.success||parsed.data.actorId!==actor.actorId)
      throw new ApiFailure(revalidation?'FORBIDDEN':'PROVIDER_UNAVAILABLE');
    return parsed.data;
  }
  app.get('/api/private-intake/self',{
    preSerialization:async(request,_reply,payload)=>{
      const receipt=receipts.get(request);receipts.delete(request);
      if(!receipt)return payload;
      // Re-read storage ACL, registry/consent/revocation and source bindings immediately before
      // serialization. Compare the entire canonical snapshot, including internal version/hash.
      const current=await resolve(receipt.actor,true);
      await betaRecheck(request,session,receipt.actor);
      if(JSON.stringify(current)!==JSON.stringify(receipt.snapshot))throw new ApiFailure('FORBIDDEN');
      return payload;
    },
  },async request=>{
    const actor=await betaActor(request,session);
    Empty.parse(request.query);
    const snapshot=await resolve(actor);
    await betaRecheck(request,session,actor);
    const {sourceSha256:_sourceSha256,...transcript}=snapshot.transcript;
    const response=PrivateOwnerIntakeResponseSchema.parse({state:'STUDENT_REVIEW_PENDING',profile:snapshot.profile,
      transcript,offeringStatus:snapshot.offeringStatus,rulesStatus:snapshot.rulesStatus});
    receipts.set(request,{actor,snapshot});return response;
  });
}
