import {describe,expect,it,vi} from 'vitest';
import {PostgresExperienceSkillCandidateReader} from '../../apps/api/src/modules/ai/experience-skill-candidates-postgres.js';
import {ExperienceSkillCandidateResponseSchema} from '@hufs-one/contracts';

const now='2026-11-05T00:00:00.000Z',jobId='b8a652af-f8b2-49d4-80f0-427cb6cf1b48';
const actor={role:'BETA' as const,actorId:'SYN-A',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),sessionExpiresAt:'2026-11-30T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-30T00:00:00.000Z',betaAllowed:true};
const candidate={task:'experience_skills' as const,reviewRequired:true as const,
  reviewState:'NEEDS_REVIEW' as const,citations:[
    {sourceToken:'EXPERIENCE',paragraphId:'TITLE',quote:'Synthetic title'}],
  objectTokens:[],usage:{promptTokens:10,completionTokens:5,totalTokens:15}};
const stored={jobId,actorId:actor.actorId,sessionIdHash:actor.sessionIdHash,
  inputRef:'SYN-INPUT',operation:'HCX_007' as const,asOf:now,
  phaseId:'SYN-PHASE',idempotencyKey:'SYN-KEY-1234',
  requestSha256:'a'.repeat(64),inputEpoch:'input-'+'b'.repeat(64),
  expiresAt:'2026-11-06T00:00:00.000Z',candidate};

function setup(){
  let version=2,consent=true,owner=actor.actorId,erased=false,reads=0;
  let callAfter:()=>void=()=>{};
  const row=()=>({
    projection_id:'SYN-PROJECTION',experience_id:'SYN-EXPERIENCE',
    content_version:'2',consent_version:'3',source_id:'SYN-SOURCE',
    source_revision_id:'SYN-REV',input_ref:'SYN-INPUT',operation:'HCX_007',
    approved_at:'2026-11-04T00:00:00.000Z',as_of:now,erased_at:erased?now:null,
    safe_packet:{task:'experience_skills',providerInputClass:'PERSONAL_CONSENTED_CLEARED'},
    record_version:String(version),deleted_at:null,current_consent_version:'3',
    choices_json:{personalStorage:consent,externalAi:true},
  });
  const query=vi.fn(async(sql:string,params?:unknown[])=>{
    if(sql.includes('SELECT b.projection_id')){
      reads++;return {rows:owner===params?.[0]?[row()]:[]};
    }
    return {rows:[]};
  });
  const pool={connect:vi.fn(async()=>({query,release:vi.fn()}))};
  const results={get:vi.fn(async()=>stored)};
  const executor={readJob:vi.fn(async()=>{callAfter();return {state:'NEEDS_REVIEW' as const,
    billing:'SETTLED' as const,jobId,candidate};})};
  const service=new PostgresExperienceSkillCandidateReader(pool as any,results as any,executor as any,()=>now);
  const read=()=>service.read({actor,experienceId:'SYN-EXPERIENCE',jobId});
  return {read,pool,query,results,executor,reads:()=>reads,
    edit(){version=3;},revokeConsent(){consent=false;},erase(){erased=true;},
    changeOwner(){owner='OTHER';},after(fn:()=>void){callAfter=fn;}};
}
describe('current experience skill candidate private read',()=>{
  it('returns only a valid, settled, current-owner candidate for explicit student review',async()=>{
    const f=setup(),res=await f.read();
    expect(ExperienceSkillCandidateResponseSchema.parse(res)).toEqual(res);
    expect(res).toMatchObject({experienceId:'SYN-EXPERIENCE',jobId,
      contentVersion:2,consentVersion:3,state:'NEEDS_REVIEW'});
    expect(res?.candidate.task).toBe('experience_skills');
    expect(f.results.get).toHaveBeenCalledWith(actor.actorId,actor.sessionIdHash,jobId);
    expect(f.executor.readJob).toHaveBeenCalledTimes(1);
    expect(f.reads()).toBe(2);
  });
  it('discards stale results if experience changes while awaiting the provider',async()=>{
    const f=setup();f.after(()=>f.edit());
    expect(await f.read()).toBeNull();
  });
  it('refuses withdrawn individual AI consent and erased provider inputs',async()=>{
    const f=setup();f.revokeConsent();expect(await f.read()).toBeNull();
    const g=setup();g.erase();expect(await g.read()).toBeNull();
  });
  it('rejects missing or cross-owner bindings without attempting a provider read',async()=>{
    const f=setup();f.changeOwner();expect(await f.read()).toBeNull();
    expect(f.executor.readJob).not.toHaveBeenCalled();
  });
  it('rejects non-BETA roles and invalid job IDs before database access',async()=>{
    const f=setup(),service=new PostgresExperienceSkillCandidateReader(f.pool as any,f.results as any,
      f.executor as any,()=>now);
    expect(await service.read({actor:{...actor,role:'REVIEWER'} as any,
      experienceId:'SYN-EXPERIENCE',jobId})).toBeNull();
    expect(await service.read({actor,experienceId:'SYN-EXPERIENCE',jobId:'INVALID'})).toBeNull();
    expect(f.results.get).not.toHaveBeenCalled();
  });
  it('will not mislabel another task as an experience skills candidate',async()=>{
    const f=setup();f.executor.readJob.mockImplementation(async()=>({state:'NEEDS_REVIEW',billing:'SETTLED',
      jobId,candidate:{...candidate,task:'opportunity_terms'}} as any));
    expect(await f.read()).toBeNull();
  });
});
