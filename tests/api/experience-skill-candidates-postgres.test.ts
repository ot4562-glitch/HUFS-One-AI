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
  const inputs={list:vi.fn(async()=>({items:[{inputRef:'SYN-INPUT',asOf:now,
    expiresAt:'2026-11-06T00:00:00.000Z',task:'experience_skills',operation:'HCX_007'}]}))};
  const service=new PostgresExperienceSkillCandidateReader(pool as any,results as any,executor as any,()=>now,inputs);
  const read=()=>service.read({actor,experienceId:'SYN-EXPERIENCE',jobId});
  return {read,service,inputs,pool,query,results,executor,reads:()=>reads,
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

describe('explicit multi-experience AI preparation',()=>{
  it('returns only current, trusted inputs without running a model',async()=>{
    const f=setup(),res=await f.service.prepare({actor,experienceIds:['SYN-EXPERIENCE','SYN-MISSING']});
    expect(res).toMatchObject({unavailable:['SYN-MISSING'],items:[{
      experienceId:'SYN-EXPERIENCE',inputRef:'SYN-INPUT',
      operation:'HCX_007',contentVersion:2,consentVersion:3}]});
    expect(f.inputs.list).toHaveBeenCalledTimes(1);
    expect(f.executor.readJob).not.toHaveBeenCalled();
    expect(f.results.get).not.toHaveBeenCalled();
  });
  it('rejects invalid, duplicate and excessively large owner selections',async()=>{
    const f=setup();
    for(const ids of [[],['X','X'],['BAD/ID'],Array.from({length:17},(_,i)=>'ID-'+i)]){
      await expect(f.service.prepare({actor,experienceIds:ids})).rejects.toThrow();
    }
    expect(f.inputs.list).not.toHaveBeenCalled();
  });
  it('never returns READY if a current owner experience changes during selection',async()=>{
    const f=setup();const original=f.query.getMockImplementation()!;
    let seen=0;
    f.query.mockImplementation(async(sql,params)=>{
      const result=await original(sql,params);
      if(String(sql).includes('SELECT b.projection_id')&&++seen===1)f.edit();
      return result;
    });
    await expect(f.service.prepare({actor,experienceIds:['SYN-EXPERIENCE']})).rejects.toThrow();
  });
  it('returns unavailable rather than disclosing withdrawn model inputs',async()=>{
    const f=setup();f.revokeConsent();
    const res=await f.service.prepare({actor,experienceIds:['SYN-EXPERIENCE']});
    expect(res).toEqual({items:[],unavailable:['SYN-EXPERIENCE']});
  });
});
