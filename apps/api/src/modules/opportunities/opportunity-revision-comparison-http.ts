import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {OpportunityRevisionComparisonRequestSchema} from '@hufs-one/contracts';
import {ApiFailure} from '../auth/gates.js';
import {betaActor,betaRecheck} from '../profiles/self-account-http.js';
import type {BetaRouteVerifier} from '../profiles/self-account-http.js';
import {compareOpportunityRevisions} from './opportunity-revision-comparison.js';
import type {TrustedOpportunityRevisionComparisonSource,TrustedOpportunityRevisionComparisonRights}
  from './opportunity-revision-comparison.js';

const Path=z.strictObject({opportunityId:z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/)});
/** Read-only POST uses createApi's existing Origin/CSRF hooks. BETA owner only;
 * no raw body retrieval, history fallback, source fetching, or state mutation. */
export function registerOpportunityRevisionComparisonRoutes(options:{
  app:FastifyInstance;session:BetaRouteVerifier;
  source?:TrustedOpportunityRevisionComparisonSource;
  rights?:TrustedOpportunityRevisionComparisonRights;
}):void{
  const {app,session,source,rights}=options;
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
