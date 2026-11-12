/** #366 — six BETA-only feature consumers, never a browser-controlled document source.
 * The operator supplies CURRENT purpose/actor/consent/source rights per requested kind;
 * the route cannot infer data rights from Zod or a model's results.
 */
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import {rankMentorsV2} from '../../../../packages/core/src/feature-additions/mentors-v2.js';
import {prepareRecognitionV2} from '../../../../packages/core/src/feature-additions/recognition-v2.js';
import {compareSkillsV2} from '../../../../packages/core/src/feature-additions/skills-v2.js';
import {recommendLearningV2} from '../../../../packages/core/src/feature-additions/learning-v2.js';
import {comparePublishedStats} from '../../../../packages/core/src/feature-additions/employment-v2.js';
import {resolveInternationalGuide} from '../../../../packages/core/src/feature-additions/international-v2.js';
import {ApiFailure} from './auth/gates.js';
import type {OwnerWorkspacePort} from './profiles/self-workspace-postgres.js';
import {registerInternationalChecklistRoutes} from './owner-international-checklist-http.js';
import {betaActor,betaRecheck,type BetaRouteVerifier} from './profiles/self-account-http.js';

const Iso=z.iso.datetime({offset:true});
const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Receipt=z.strictObject({
  actorId:Id,sourceVersion:Id,consentVersion:Id,rightsVersion:Id,expiresAt:Iso,
});
export type OwnerInsightsReceipt=z.infer<typeof Receipt>;
const Activity=z.strictObject({
  id:Id,kind:Id,endedAt:Iso.optional(),
});
const Selector=z.strictObject({
  locale:z.enum(['ko','en','zh']),topicCode:Id,
  campus:Id.optional(),term:Id.optional(),audienceCodes:z.array(Id).max(16),
});
const Cases=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('MENTORS'),receipt:Receipt,
    preference:V.MentorPreferenceSchema,mentors:z.array(V.MentorCardSchema).max(60)}),
  z.strictObject({kind:z.literal('RECOGNITION'),receipt:Receipt,
    cases:z.array(z.strictObject({
      rule:V.ActivityRecognitionRuleSchema,activity:Activity,
      proofs:z.array(V.ActivityProofSchema).max(100),
    })).max(25)}),
  z.strictObject({kind:z.literal('SKILLS'),receipt:Receipt,
    requirements:z.array(V.JobRequirementSchema).max(100),
    experiences:z.array(V.ExperienceEvidenceSchema).max(200),
    crosswalk:z.array(V.TopicCrosswalkSchema).max(200)}),
  z.strictObject({kind:z.literal('LEARNING'),receipt:Receipt,
    preference:V.LearningPreferenceSchema,
    programs:z.array(V.LearningProgramSchema).max(60),
    verifiedCompletedCourses:z.array(Id).max(200).optional()}),
  z.strictObject({kind:z.literal('EMPLOYMENT'),receipt:Receipt,
    aggregates:z.array(V.EmploymentAggregateSchema).max(50)}),
  z.strictObject({kind:z.literal('INTERNATIONAL'),receipt:Receipt,
    guides:z.array(z.strictObject({
      guide:V.InternationalGuideSchema,selection:Selector,
    })).max(25)}),
]);
export type OwnerInsightsSnapshot=z.infer<typeof Cases>;
export interface TrustedOwnerInsightsSource {
  read(input:{actorId:string;kind:V.OwnerInsightsKind;asOf:string}):Promise<unknown>;
  /** Independently recheck actor, consent, use purpose, current rights AND source head. */
  revalidate(input:{actorId:string;kind:V.OwnerInsightsKind;
    receipt:OwnerInsightsReceipt;now:string}):Promise<boolean>;
}
export interface TrustedOwnerInsightsQuota {
  /** Must atomically enforce bounded per-actor/feature usage across replicas. */
  consume(input:{actorId:string;kind:V.OwnerInsightsKind;now:string}):Promise<boolean>;
}
export interface OwnerInsightsServices {
  source:TrustedOwnerInsightsSource;
  quota:TrustedOwnerInsightsQuota;
  checklists?:Pick<OwnerWorkspacePort,'read'|'create'|'update'>;
}
export function validateOwnerInsightsServices(v:OwnerInsightsServices):void{
  if(!v||typeof v.source?.read!=='function'
    ||typeof v.source?.revalidate!=='function'
    ||typeof v.quota?.consume!=='function')
    throw new Error('Owner insights require current rights source and durable quota');
  if(v.checklists&&['read','create','update'].some(key=>typeof v.checklists?.[key as keyof typeof v.checklists]!=='function'))
    throw new Error('Owner guide checklist store required');
}
const empty=z.strictObject({});
const unique=<T extends {id:string}>(rows:readonly T[]):boolean=>
  new Set(rows.map(r=>r.id)).size===rows.length;

export function registerOwnerInsightsRoutes(input:{
  app:FastifyInstance;session:BetaRouteVerifier;services?:OwnerInsightsServices;
}):void{
  const {app,session,services}=input;
  if(services)validateOwnerInsightsServices(services);
  registerInternationalChecklistRoutes({app,session,services,parse:raw=>Cases.parse(raw)});
  app.get('/api/owner/features/v2/insights/:kind',async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    empty.parse(req.query);
    const args=z.strictObject({kind:V.OwnerInsightsKindSchema}).parse(req.params);
    const {kind}=args,actor=await betaActor(req,session),asOf=Iso.parse(session.now());
    if(!services){
      await betaRecheck(req,session,actor);
      return V.OwnerInsightsResponseSchema.parse({state:'NOT_CONNECTED',kind,asOf});
    }
    let allowed=false;
    try{allowed=await services.quota.consume({actorId:actor.actorId,kind,now:asOf});}
    catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!allowed)throw new ApiFailure('RATE_LIMITED');
    await betaRecheck(req,session,actor);

    let snapshot:OwnerInsightsSnapshot;
    try{
      const raw=await services.source.read({actorId:actor.actorId,kind,asOf});
      if(raw===null)throw new ApiFailure('FORBIDDEN');
      snapshot=Cases.parse(raw);
    }catch(error){
      if(error instanceof ApiFailure)throw error;
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    }
    if(snapshot.kind!==kind||snapshot.receipt.actorId!==actor.actorId
      ||Date.parse(snapshot.receipt.expiresAt)<=Date.parse(session.now()))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    let result:V.OwnerInsightsResponse;
    try{
      let report:unknown;
      switch(snapshot.kind){
        case 'MENTORS':
          if(Date.parse(snapshot.preference.asOf)!==Date.parse(asOf))
            throw new Error('stale preferences');
          // Duplicate source identities are quarantined in the core ranking.
          report={kind,ranking:V.MentorRankingV2Schema.parse(
            rankMentorsV2({preference:snapshot.preference,catalog:snapshot.mentors,mode:'LIVE'}))};
          break;
        case 'RECOGNITION':
          if(!unique(snapshot.cases.map(c=>c.activity)))throw new Error('duplicate activity');
          report={kind,reports:snapshot.cases.map(c=>V.RecognitionReportV2Schema.parse(
            prepareRecognitionV2({rule:c.rule,
              activity:{id:c.activity.id,kind:c.activity.kind,
                ...(c.activity.endedAt?{endedAt:c.activity.endedAt}:{})},
              proofs:c.proofs,asOf,mode:'LIVE'})))};
          break;
        case 'SKILLS':
          if(!unique(snapshot.requirements)||!unique(snapshot.experiences)
            ||!unique(snapshot.crosswalk))throw new Error('duplicate official evidence id');
          report={kind,rows:V.SkillRowV2Schema.array().max(100).parse(
            compareSkillsV2({requirements:snapshot.requirements,
              experiences:snapshot.experiences,crosswalk:snapshot.crosswalk,asOf,mode:'LIVE'}))};
          break;
        case 'LEARNING':
          if(Date.parse(snapshot.preference.asOf)!==Date.parse(asOf))
            throw new Error('stale learning preferences');
          report={kind,ranking:V.LearningRankingV2Schema.parse(
            recommendLearningV2({preference:snapshot.preference,
              programs:snapshot.programs,mode:'LIVE',
              ...(snapshot.verifiedCompletedCourses
                ?{verifiedCompletedCourses:snapshot.verifiedCompletedCourses}:{})}))};
          break;
        case 'EMPLOYMENT':{
          const compared=comparePublishedStats(snapshot.aggregates,asOf,'LIVE');
          report={kind,comparable:compared.comparable,reason:compared.reason,
            rows:V.EmploymentValueV2Schema.array().max(50).parse(compared.rows)};
          break;
        }
        case 'INTERNATIONAL':
          if(!unique(snapshot.guides.map(c=>c.guide)))throw new Error('duplicate guide');
          report={kind,guides:snapshot.guides.map(c=>V.GuideResolutionV2Schema.parse(
            resolveInternationalGuide({guide:c.guide,asOf,mode:'LIVE',
              locale:c.selection.locale,topicCode:c.selection.topicCode,
              ...(c.selection.campus?{campus:c.selection.campus}:{}),
              ...(c.selection.term?{term:c.selection.term}:{}),
              audienceCodes:c.selection.audienceCodes})))};
          break;
      }
      result=V.OwnerInsightsResponseSchema.parse({
        state:'READY',asOf,sourceVersion:snapshot.receipt.sourceVersion,result:report,
      });
    }catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    await betaRecheck(req,session,actor);
    let current=false;
    try{current=await services.source.revalidate({
      actorId:actor.actorId,kind,receipt:snapshot.receipt,now:session.now()})===true;}
    catch{/* fail closed if current rights uncheckable */}
    if(!current)throw new ApiFailure('FORBIDDEN');
    if(Date.parse(snapshot.receipt.expiresAt)<=Date.parse(session.now()))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(req,session,actor);
    return result;
  });
}
