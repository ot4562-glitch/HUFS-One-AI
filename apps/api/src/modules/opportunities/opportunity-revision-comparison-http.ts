import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {OpportunityRevisionComparisonRequestSchema,OpportunityRevisionComparisonContextResponseSchema} from '@hufs-one/contracts';
import {ApiFailure} from '../auth/gates.js';
import {betaActor,betaRecheck} from '../profiles/self-account-http.js';
import type {BetaRouteVerifier} from '../profiles/self-account-http.js';
import {compareOpportunityRevisions} from './opportunity-revision-comparison.js';
import type {TrustedOpportunityRevisionComparisonSource,TrustedOpportunityRevisionComparisonRights}
  from './opportunity-revision-comparison.js';

const Path=z.strictObject({opportunityId:z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/)});
const ContextQuery=z.strictObject({asOf:z.iso.datetime({offset:true})});
export interface TrustedOpportunityRevisionComparisonContextSource {
  /** Null means no current owner authority/consent; available:false means authorized but no approved pair. */
  find(input:{actorId:string;opportunityId:string;asOf:string;now:string}):Promise<unknown|null>;
}

/** Read-only POST uses createApi's existing Origin/CSRF hooks. BETA owner only;
 * no raw body retrieval, history fallback, source fetching, or state mutation. */
export function registerOpportunityRevisionComparisonRoutes(options:{
  app:FastifyInstance;session:BetaRouteVerifier;
  source?:TrustedOpportunityRevisionComparisonSource;
  rights?:TrustedOpportunityRevisionComparisonRights;
  context?:TrustedOpportunityRevisionComparisonContextSource;
}):void{
  const {app,session,source,rights,context}=options;
  app.get('/api/opportunities/:opportunityId/revisions/comparison-context',async request=>{
    const {opportunityId}=Path.parse(request.params);
    const {asOf}=ContextQuery.parse(request.query);
    const actor=await betaActor(request,session);
    if(!context)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    if(Date.parse(asOf)>Date.parse(session.now()))throw new ApiFailure('INVALID_INPUT');
    const inspect=async()=>{
      let raw:unknown;
      try{raw=await context.find({actorId:actor.actorId,opportunityId,asOf,now:session.now()});}
      catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
      if(raw===null)throw new ApiFailure('FORBIDDEN');
      const parsed=OpportunityRevisionComparisonContextResponseSchema.safeParse(raw);
      if(!parsed.success||parsed.data.opportunityId!==opportunityId||parsed.data.asOf!==asOf)
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
      return parsed.data;
    };
    const first=await inspect();
    await betaRecheck(request,session,actor);
    // Re-read current approvals, source head, rights and consent at response time.
    const second=await inspect();
    if(JSON.stringify(first)!==JSON.stringify(second))throw new ApiFailure('FORBIDDEN');
    await betaRecheck(request,session,actor);
    return first;
  });
  app.post('/api/opportunities/:opportunityId/revisions/compare',async request=>{
    z.strictObject({}).parse(request.query);
    const {opportunityId}=Path.parse(request.params);
    const input=OpportunityRevisionComparisonRequestSchema.parse(request.body);
    const actor=await betaActor(request,session);
    if(!source||!rights)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const result=await compareOpportunityRevisions({actorId:actor.actorId,
      opportunityId,request:input,source,rights,now:session.now,
      beforeInspect:()=>betaRecheck(request,session,actor)});
    await betaRecheck(request,session,actor);
    return result;
  });
}
