import type {FastifyInstance} from 'fastify';
import {OwnerExperienceCourseResponseSchema} from '@hufs-one/contracts';
import {describeCourseEvidence,resolveExperienceCourseLinks} from '../../../../packages/core/src/academics/experience-evidence.js';
import type {AcademicEvidenceAccess,ExperienceCourseLink} from '../../../../packages/core/src/academics/experience-evidence.js';
import {ApiFailure} from './auth/gates.js';
import {betaActor,betaRecheck,type BetaRouteVerifier} from './profiles/self-account-http.js';

type Receipt={actorId:string;grantVersion:string;transcriptVersion:string;expiresAt:string};
type OwnerSnapshot={
  access:AcademicEvidenceAccess;
  experiences:readonly {experienceId:string;contentVersion:number}[];
  links:readonly ExperienceCourseLink[];
  receipt:Receipt;
};
export interface TrustedExperienceCourseSource {
  /** Must read current owner identity, purpose-specific ACADEMIC_TO_EXPERIENCE grant,
   * transcript source/canonical mapping and owner-confirmed links under the same actor. */
  read(input:{actorId:string;asOf:string}):Promise<OwnerSnapshot|null>;
  /** Rechecks actor, exact grant + transcript versions, source rights/identity and revocation. */
  revalidate(input:{actorId:string;receipt:Receipt;now:string}):Promise<boolean>;
}

/** #375 read-only owner projection. No browser-provided course IDs, link confirmations,
 * fake canonical mapping or school-endorsed achievement assertions. */
export function registerOwnerExperienceCourseRoutes(input:{
  app:FastifyInstance;session:BetaRouteVerifier;source?:TrustedExperienceCourseSource;
}):void{
  const {app,session,source}=input;
  app.get('/api/owner/academics/experience-courses',async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    const actor=await betaActor(req,session);
    const asOf=session.now(),at=Date.parse(asOf);
    if(!Number.isFinite(at)||!/(?:Z|[+-]\d{2}:\d{2})$/i.test(asOf))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    if(!source){
      await betaRecheck(req,session,actor);
      return OwnerExperienceCourseResponseSchema.parse({state:'NOT_CONNECTED',asOf});
    }
    let snapshot:OwnerSnapshot|null;
    try{snapshot=await source.read({actorId:actor.actorId,asOf});}
    catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!snapshot)throw new ApiFailure('FORBIDDEN');
    const valid=():boolean=>{
      const now=Date.parse(session.now()),expires=Date.parse(snapshot!.receipt.expiresAt);
      return snapshot!.receipt.actorId===actor.actorId
        &&snapshot!.receipt.grantVersion.trim().length>0
        &&snapshot!.receipt.transcriptVersion.trim().length>0
        &&Number.isFinite(now)&&Number.isFinite(expires)&&expires>now
        &&(snapshot!.access.state!=='SHARED'||(
          snapshot!.receipt.grantVersion===snapshot!.access.grantVersion
          &&snapshot!.receipt.transcriptVersion===snapshot!.access.transcriptVersion));
    };
    if(!valid())throw new ApiFailure('PROVIDER_UNAVAILABLE');
    let result:ReturnType<typeof OwnerExperienceCourseResponseSchema.parse>;
    try{
      const access=snapshot.access;
      // Revoked/unknown grant must not leak cached course IDs or stale links.
      if(access.state!=='SHARED'){
        if(snapshot.experiences.length||snapshot.links.length)
          throw new Error('Non-shared academic snapshot contains owner link data');
        result=OwnerExperienceCourseResponseSchema.parse({state:access.state,asOf});
      }else{
        const courseEvidence=describeCourseEvidence({access,asOf});
        const linkEvidence=resolveExperienceCourseLinks({access,asOf,
          experiences:snapshot.experiences,links:snapshot.links});
        if(courseEvidence.state!=='SHARED'||linkEvidence.state!=='SHARED')
          throw new Error('Shared academic evidence output mismatch');
        result=OwnerExperienceCourseResponseSchema.parse({state:'SHARED',asOf,
          basis:'STUDENT_SUBMITTED_TRANSCRIPT',transcriptVersion:access.transcriptVersion,
          courses:courseEvidence.courses,links:linkEvidence.links});
      }
    }catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    await betaRecheck(req,session,actor);
    let approved=false;
    try{approved=await source.revalidate({actorId:actor.actorId,receipt:snapshot.receipt,now:session.now()})===true;}
    catch{/* current grant unavailable: deny */}
    if(!approved)throw new ApiFailure('FORBIDDEN');
    if(!valid())throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(req,session,actor);
    return result;
  });
}
