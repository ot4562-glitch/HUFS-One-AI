import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {ExperienceSkillCandidateResponseSchema,ExperienceSkillPrepareRequestSchema,ExperienceSkillPrepareResponseSchema} from '@hufs-one/contracts';
import {ApiFailure} from '../auth/gates.js';
import {betaActor,betaRecheck} from './self-account-http.js';
import type {BetaRouteVerifier} from './self-account-http.js';
import type {ExperienceSkillCandidatePort} from '../ai/experience-skill-candidates-postgres.js';

const Params=z.strictObject({id:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),jobId:z.uuid()});
const Empty=z.strictObject({});
/** BETA-only candidate review. No user skill approval is granted by this GET. */
export function registerExperienceSkillCandidateRoute(app:FastifyInstance,
  port:ExperienceSkillCandidatePort,session:BetaRouteVerifier):void{
  app.post('/api/experience/ai-skills/prepare',async req=>{
    const input=ExperienceSkillPrepareRequestSchema.parse(req.body);Empty.parse(req.query);
    const actor=await betaActor(req,session);
    let result;
    try{result=await port.prepare({actor,experienceIds:input.experienceIds});}
    catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    await betaRecheck(req,session,actor);
    return ExperienceSkillPrepareResponseSchema.parse(result);
  });
  app.get('/api/experience/cards/:id/ai-skills/:jobId',async req=>{
    const {id,jobId}=Params.parse(req.params);Empty.parse(req.query);
    const actor=await betaActor(req,session);
    let result:Awaited<ReturnType<ExperienceSkillCandidatePort['read']>>;
    try{result=await port.read({actor,experienceId:id,jobId});}
    catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    await betaRecheck(req,session,actor);
    if(!result)throw new ApiFailure('FORBIDDEN');
    return ExperienceSkillCandidateResponseSchema.parse(result);
  });
}
