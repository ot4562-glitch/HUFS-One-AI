import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {ExperienceTagApprovalSchema,ExperienceTagApprovalPutSchema,
  ExperienceTagApprovalDeleteSchema} from '@hufs-one/contracts';
import type {ExperienceTagApproval} from '@hufs-one/contracts';
import {ApiFailure} from '../auth/gates.js';
import {betaActor,betaRecheck} from './self-account-http.js';
import type {BetaRouteVerifier} from './self-account-http.js';
import {ExperienceApprovalConflict,ExperienceApprovalDenied} from './experience-approval-postgres.js';
import type {ExperienceApprovalPort} from './experience-approval-postgres.js';

const Params=z.strictObject({id:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/)});
const Empty=z.strictObject({});
async function result(fn:()=>Promise<ExperienceTagApproval>):Promise<ExperienceTagApproval>{
  let raw:unknown;
  try{raw=await fn();}
  catch(error){
    if(error instanceof ExperienceApprovalDenied)throw new ApiFailure('FORBIDDEN');
    if(error instanceof ExperienceApprovalConflict)throw new ApiFailure('VERSION_CONFLICT');
    throw new ApiFailure('PROVIDER_UNAVAILABLE');
  }
  const parsed=ExperienceTagApprovalSchema.safeParse(raw);
  if(!parsed.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  return parsed.data;
}
/** Register inside createApi's authenticated no-store/Origin/CSRF hooks only.
 * Explicit local approval; no external model, actor impersonation or demo write.
 */
export function registerExperienceApprovalRoutes(app:FastifyInstance,
  store:ExperienceApprovalPort,session:BetaRouteVerifier):void{
  const path='/api/experience/cards/:id/tag-approval';
  app.get(path,async request=>{
    const {id}=Params.parse(request.params);Empty.parse(request.query);
    const actor=await betaActor(request,session);
    const approval=await result(()=>store.read({actorId:actor.actorId,experienceId:id}));
    await betaRecheck(request,session,actor);
    return {approval};
  });
  app.put(path,async request=>{
    const {id}=Params.parse(request.params);Empty.parse(request.query);
    const input=ExperienceTagApprovalPutSchema.parse(request.body);
    const actor=await betaActor(request,session);
    const approval=await result(()=>store.approve({actorId:actor.actorId,experienceId:id,...input}));
    if(approval.state!=='ACTIVE'||approval.version!==input.expectedApprovalVersion+1
      ||approval.contentVersion!==input.expectedContentVersion
      ||approval.consentVersion!==input.expectedConsentVersion
      ||JSON.stringify(approval.topics)!==JSON.stringify(input.topics))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(request,session,actor);
    return {approval};
  });
  app.delete(path,async request=>{
    const {id}=Params.parse(request.params);Empty.parse(request.query);
    const input=ExperienceTagApprovalDeleteSchema.parse(request.body);
    const actor=await betaActor(request,session);
    const approval=await result(()=>store.revoke({actorId:actor.actorId,experienceId:id,...input}));
    if(approval.state!=='INACTIVE'
      ||!(approval.version===input.expectedApprovalVersion+1&&approval.reason==='REVOKED'
        ||input.expectedApprovalVersion===0&&approval.version===0&&approval.reason==='NOT_APPROVED'))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(request,session,actor);
    return {approval};
  });
}
