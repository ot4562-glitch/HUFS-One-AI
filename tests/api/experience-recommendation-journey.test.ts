import {afterEach,describe,expect,it,vi} from 'vitest';
import {OwnerFeedResponseSchema,OwnerWorkspaceRecordSchema,SelfConsentSchema,SafeLlmPacketSchema} from '@hufs-one/contracts';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {buildExperienceSkillPacket} from '../../apps/api/src/modules/ai/experience-skill-packet.js';
import {computeOwnerRecommendations} from '../../apps/api/src/modules/opportunities/owner-recommendations.js';
import {ownerOpportunity} from './owner-recommendations-fixture.js';

const NOW='2026-11-05T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const actor={actorId:'SYN-E2E-OWNER',role:'BETA' as const,betaAllowed:true,
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-12-01T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z'};
const headers={origin:ORIGIN,'x-csrf-token':actor.csrfToken};
const record=OwnerWorkspaceRecordSchema.parse({itemId:'SYN-EXP-01',version:3,updatedAt:NOW,
  value:{kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',state:'SELF_REPORTED',
    title:'Synthetic research project',summary:'Prepared an analysis of overseas trade data'}});
const consent=SelfConsentSchema.parse({version:2,updatedAt:NOW,
  choices:{personalStorage:true,teamReview:true,externalAi:true,ncpStorage:true,presentation:false}});
// Synthetic-only provider fixture; the consented owner record is NOT sent to the mock model.
const pack=SafeLlmPacketSchema.parse(buildExperienceSkillPacket({
  packetId:'SYNTHETIC_E2E_OPAQUE_PACKET_001',experience:{...record,value:{...record.value,dataMode:'SYNTHETIC'}}}));
const opportunities=[ownerOpportunity('SYN-COMPUTE',['AI_ML']),
  ownerOpportunity('SYN-TRADE',['TRADE_OVERSEAS'])];
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});

function setup(){
  let authenticated=true,stored=structuredClone(record),currentConsent=structuredClone(consent);
  let approvalVersion=0,approved=false,jobId:string|null=null;
  let modelCalls=0;
  const reads={prepare:vi.fn(),candidate:vi.fn(),approval:vi.fn(),feed:vi.fn()};
  const currentApproval=()=>approved?{
    state:'ACTIVE' as const,version:approvalVersion,
    contentVersion:3,consentVersion:2,topics:['TRADE_OVERSEAS'] as const,
    approvedAt:NOW,provenance:'LOCAL_USER_SELECTION' as const,
  }:{state:'INACTIVE' as const,version:approvalVersion,
    reason:approvalVersion===0?'NOT_APPROVED' as const:'REVOKED' as const};
  const portfolioWorkspace={
    list:async()=>({items:[structuredClone(stored)],nextCursor:null}),
    read:async()=>structuredClone(stored),
    create:vi.fn(),update:vi.fn(),delete:vi.fn(),
  };
  const approvals={
    read:async()=>{reads.approval();return currentApproval();},
    approve:async(input:{actorId:string;experienceId:string;expectedApprovalVersion:number;
      expectedContentVersion:number;expectedConsentVersion:number;topics:string[]})=>{
      if(input.actorId!==actor.actorId||input.experienceId!==record.itemId
        ||input.expectedApprovalVersion!==approvalVersion||input.expectedContentVersion!==stored.version
        ||input.expectedConsentVersion!==currentConsent.version
        ||JSON.stringify(input.topics)!==JSON.stringify(['TRADE_OVERSEAS']))
        throw Error('SYN-OWNER-CAS-DENIED');
      approvalVersion++;approved=true;return currentApproval();
    },
    revoke:async(input:{actorId:string;expectedApprovalVersion:number})=>{
      if(input.actorId!==actor.actorId||input.expectedApprovalVersion!==approvalVersion)
        throw Error('SYN-OWNER-CAS-DENIED');
      approvalVersion++;approved=false;return currentApproval();
    },
    readApprovedTopics:async()=>[],
  };
  const accounts={
    readConsents:async()=>structuredClone(currentConsent),
    readProfile:vi.fn(),patchProfile:vi.fn(),putConsents:vi.fn(),
  };
  const candidates={
    prepare:async()=>{reads.prepare();return {items:[{
      experienceId:record.itemId,inputRef:'SYN-E2E-INPUT',operation:'HCX_007' as const,
      asOf:NOW,expiresAt:'2026-11-20T00:00:00.000Z',
      contentVersion:3,consentVersion:2}],unavailable:[]};},
    read:async({jobId:requested}:{jobId:string})=>{
      reads.candidate();if(requested!==jobId)return null;
      return {experienceId:record.itemId,jobId:requested,contentVersion:3,
        consentVersion:2,state:'NEEDS_REVIEW' as const,
        candidate:{task:'experience_skills' as const,reviewRequired:true as const,
          reviewState:'NEEDS_REVIEW' as const,
          citations:[{sourceToken:'EXPERIENCE',paragraphId:'SUMMARY',
            quote:'analysis of overseas trade data'}],
          objectTokens:[],usage:{promptTokens:3,completionTokens:2,totalTokens:5}}};
    },
  };
  const feedSource={
    mayInspect:async()=>currentConsent.choices.personalStorage,
    inspect:async()=>{
      reads.feed();
      const topics=approved&&stored.version===3&&currentConsent.version===2
        ?['TRADE_OVERSEAS' as const]:[];
      const core=computeOwnerRecommendations({asOf:NOW,
        interestTopics:[],desiredJobTopics:[],approvedExperienceTopics:topics,
        opportunities,publishedAtBySnapshotId:{}});
      return {result:OwnerFeedResponseSchema.parse({
        version:'a'.repeat(64),rankConfigVersion:core.rankConfigVersion,feed:core.feed}),
        coreVersion:'owner-recommendation-v1',receipt:'SYN-RECEIPT-01'};
    },
    revalidate:async()=>currentConsent.choices.personalStorage,
  };
  const app=createIntegratedApi({
    allowedOrigin:ORIGIN,repository:new MemoryApiRepository({profiles:[],
      safePackets:[{actorId:actor.actorId,ref:'SYN-E2E-INPUT',packet:pack}]}),now:()=>NOW,
    auth:{verifySession:async()=>authenticated?actor:null,revokeSession:async()=>{authenticated=false;}},
    ownerWorkspace:portfolioWorkspace,selfAccount:accounts,experienceApproval:approvals,
    experienceCandidates:candidates,
    syntheticAiProvider:{analyze:async()=>{
      modelCalls++;
      return {task:'experience_skills',reviewRequired:true,citations:[{
        sourceToken:'EXPERIENCE',paragraphId:'SUMMARY',
        quote:'analysis of overseas trade data'}]};
    }},
    ownerFeed:{source:feedSource,approval:{isApproved:async()=>true}},
  } as any);
  apps.push(app);
  return {app,reads,headers,consentRevoked:()=>{currentConsent={
    ...currentConsent,version:3,choices:{...currentConsent.choices,personalStorage:false}};},
    edit:()=>{stored={...stored,version:4};},
    logout:()=>{authenticated=false;},
    modelCalls:()=>modelCalls,
    rememberJob:(id:string)=>{jobId=id;}};
}

describe('single synthetic HTTP journey: choose experience → mock AI → student approval → recommendation',()=>{
  it('requires explicit student approval before experience becomes recommendation input',async()=>{
    const h=setup();
    const before=await h.app.inject({url:'/api/owner/feed'});
    expect(before.statusCode).toBe(200);
    expect(before.json().feed.featured).toEqual([]);

    const prepared=await h.app.inject({method:'POST',url:'/api/experience/ai-skills/prepare',headers,
      payload:{experienceIds:['SYN-EXP-01']}});
    expect(prepared.statusCode).toBe(200);
    expect(prepared.json().items[0].inputRef).toBe('SYN-E2E-INPUT');
    expect(h.modelCalls()).toBe(0); // metadata is not a billable call

    const generated=await h.app.inject({method:'POST',url:'/api/ai/experience-skills',headers,
      payload:{packetRef:'SYN-E2E-INPUT',idempotencyKey:'SYN-E2E-MODEL-001'}});
    expect(generated.statusCode).toBe(202);
    h.rememberJob(generated.json().jobId);
    expect(h.modelCalls()).toBe(1);
    const job=await h.app.inject({url:'/api/ai/jobs/'+generated.json().jobId});
    expect(job.statusCode).toBe(200);
    expect(job.json().candidate.reviewState).toBe('NEEDS_REVIEW');

    const candidate=await h.app.inject({url:'/api/experience/cards/SYN-EXP-01/ai-skills/'+generated.json().jobId});
    expect(candidate.statusCode).toBe(200);
    expect(candidate.json().state).toBe('NEEDS_REVIEW');
    // The model may suggest, but it never decides which topic the student approves.
    const stillUnapproved=await h.app.inject({url:'/api/owner/feed'});
    expect(stillUnapproved.json().feed.featured).toEqual([]);

    const selected=await h.app.inject({method:'PUT',
      url:'/api/experience/cards/SYN-EXP-01/tag-approval',headers,
      payload:{expectedApprovalVersion:0,expectedContentVersion:3,expectedConsentVersion:2,
        topics:['TRADE_OVERSEAS']}});
    expect(selected.statusCode).toBe(200);
    expect(selected.json().approval.provenance).toBe('LOCAL_USER_SELECTION');
    const portfolio=await h.app.inject({url:'/api/experience/cards?view=portfolio'});
    expect(portfolio.statusCode).toBe(200);
    expect(portfolio.json().portfolio.topics).toEqual([
      {topicCode:'TRADE_OVERSEAS',experienceIds:['SYN-EXP-01']}]);
    const recommended=await h.app.inject({url:'/api/owner/feed'});
    expect(recommended.statusCode).toBe(200);
    expect(recommended.json().feed.featured.map((v:{opportunityId:string})=>v.opportunityId))
      .toEqual(['SYN-TRADE']);
    expect(h.reads.feed).toHaveBeenCalled();
  });
  it('withdrawal removes the recommendation signal and consent prevents new private views',async()=>{
    const h=setup();
    const approved=await h.app.inject({method:'PUT',
      url:'/api/experience/cards/SYN-EXP-01/tag-approval',headers,
      payload:{expectedApprovalVersion:0,expectedContentVersion:3,expectedConsentVersion:2,
        topics:['TRADE_OVERSEAS']}});
    expect(approved.statusCode).toBe(200);
    const revoked=await h.app.inject({method:'DELETE',
      url:'/api/experience/cards/SYN-EXP-01/tag-approval',headers,
      payload:{expectedApprovalVersion:1,expectedContentVersion:3,expectedConsentVersion:2}});
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().approval.state).toBe('INACTIVE');
    expect((await h.app.inject({url:'/api/owner/feed'})).json().feed.featured).toEqual([]);
    h.consentRevoked();
    expect((await h.app.inject({url:'/api/experience/cards?view=portfolio'})).statusCode).toBe(403);
    expect((await h.app.inject({url:'/api/owner/feed'})).statusCode).toBe(403);
    h.logout();
    expect((await h.app.inject({url:'/api/owner/feed'})).statusCode).toBe(401);
  });
});
