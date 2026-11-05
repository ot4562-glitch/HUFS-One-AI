import {describe,expect,it,vi} from 'vitest';
import {PostgresExperienceSkillInputRegistrar} from '../../apps/api/src/modules/ai/experience-skill-registration-postgres.js';
const now='2026-11-05T12:00:00.000Z';
const item={actorId:'SYN-OWNER',experienceId:'SYN-EXP',contentVersion:2,consentVersion:3,
  approvedBy:'SYN-REVIEWER',approvedAt:'2026-11-05T11:58:00.000Z',
  privacyReviewRef:'SYN-PRIVACY-REVIEW',policyVersion:'SYN-POLICY',
  expiresAt:'2026-11-05T12:20:00.000Z',
  source:{sourceId:'SYN-SOURCE',revisionId:'SYN-REVISION',permissionRef:'SYN-PERM',
    originalSha256:'a'.repeat(64)}};
const dbRecord={item_id:'SYN-EXP',version:'2',deleted_at:null,
  updated_at:'2026-11-05T11:55:00.000Z',
  value_json:{kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',state:'SELF_REPORTED',
    title:'Synthetic research assistant',summary:'Analyzed economic data'}};
const dbConsent={version:'3',updated_at:'2026-11-05T11:54:00.000Z',
  choices_json:{personalStorage:true,teamReview:true,externalAi:true,ncpStorage:false,presentation:false}};
const evidence={source_id:'SYN-SOURCE',revision_id:'SYN-REVISION',permission_ref:'SYN-PERM',
  original_sha256:'a'.repeat(64),stored_original_sha256:'a'.repeat(64),
  review_original_sha256:'a'.repeat(64),review_content_sha256:'b'.repeat(64),
  content_sha256:'b'.repeat(64),source_class:'PERSONAL_CONSENTED',provenance:'REAL_APPROVED',
  status:'ACTIVE',change_kind:'NEW',fetched_at:'2026-11-05T11:40:00.000Z',
  last_verified_at:'2026-11-05T11:50:00.000Z',valid_from:null,valid_until:null,
  review_decision:'APPROVED',reviewer_id:'SYN-INDEPENDENT',
  review_checked_at:'2026-11-05T11:53:00.000Z',receipt_id:'SYN-RIGHTS',
  rights_actor_id:'SYN-OWNER',rights_permission_ref:'SYN-PERM',
  rights_reviewed_by:'SYN-INDEPENDENT',rights_reviewed_at:'2026-11-05T11:53:00.000Z',
  rights_starts_at:'2026-11-05T11:54:00.000Z',rights_expires_at:'2026-11-05T12:30:00.000Z',
  rights_purposes:['STORE','EXTERNAL_TRANSFER'],rights_revoked_at:null};
function setup(allowed=true){
  const state={consent:structuredClone(dbConsent),record:structuredClone(dbRecord),
    evidence:structuredClone(evidence)};
  const sql:string[]=[],commits:string[]=[];
  const query=vi.fn(async(text:string,params?:readonly unknown[])=>{
    sql.push(text);
    if(text.includes('FROM api_self_consents'))return {rows:[state.consent]};
    if(text.includes('FROM api_self_workspace_records'))return {rows:[state.record]};
    if(text.includes('FROM source_ingest_heads'))return {rows:[state.evidence]};
    if(text.startsWith('INSERT'))return {rows:[{projection_id:
      text.includes('INSERT INTO api_ai_provider_input_heads')?params?.[2]:params?.[0]}]};
    if(text==='COMMIT'||text==='ROLLBACK')commits.push(text);
    return {rows:[],rowCount:1};
  });
  const release=vi.fn(),pool={connect:vi.fn(async()=>({query,release}))};
  const verify=vi.fn(async(_input:unknown)=>allowed);
  const service=new PostgresExperienceSkillInputRegistrar(pool as any,{verify},'SYN-POLICY',()=>now);
  return {service,query,release,verify,sql,commits,state};
}
describe('operator-only current experience AI input registration',()=>{
  it('writes current reviewed packet, immutable binding and head atomically without model call',async()=>{
    const f=setup();const res=await f.service.register(item);
    expect(res).toMatchObject({experienceId:'SYN-EXP',contentVersion:2,consentVersion:3,
      asOf:now,expiresAt:item.expiresAt});
    expect(res.inputRef).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.commits).toEqual(['COMMIT']);expect(f.release).toHaveBeenCalled();
    expect(f.verify).toHaveBeenCalledTimes(2);
    const first=f.verify.mock.calls[0]![0];
    expect(first).toMatchObject({actorId:item.actorId,source:item.source,now,packetSha256:expect.stringMatching(/^[a-f0-9]{64}$/)});
    const sent=f.query.mock.calls.find(([sql])=>String(sql).startsWith('INSERT INTO api_ai_provider_inputs'));
    expect(sent).toBeDefined();
    const params=sent![1] as unknown[];
    const packet=JSON.parse(params[12] as string);
    expect(packet).toMatchObject({task:'experience_skills',providerInputClass:'PERSONAL_CONSENTED_CLEARED'});
    expect(JSON.stringify(packet)).not.toContain(item.actorId);
    expect(f.sql.some(line=>line.startsWith('DELETE FROM api_ai_provider_input_heads'))).toBe(true);
  });
  it('rejects missing independently authenticated review and rolls back every write',async()=>{
    const f=setup(false);
    await expect(f.service.register(item)).rejects.toThrow(/unavailable/);
    expect(f.commits).toEqual(['ROLLBACK']);
    expect(f.sql.some(x=>x.startsWith('INSERT'))).toBe(false);
  });
  it('refuses changed experience version, withdrawn consent and expired source rights',async()=>{
    for(const mutate of [
      (f:ReturnType<typeof setup>)=>{f.state.record.version='3';},
      (f:ReturnType<typeof setup>)=>{f.state.consent.choices_json.externalAi=false;},
      (f:ReturnType<typeof setup>)=>{f.state.evidence.rights_revoked_at=now as any;},
      (f:ReturnType<typeof setup>)=>{f.state.evidence.revision_id='STALE';},
    ]){
      const f=setup();mutate(f);
      await expect(f.service.register(item)).rejects.toThrow(/unavailable/);
      expect(f.commits).toEqual(['ROLLBACK']);
      expect(f.sql.some(x=>x.startsWith('INSERT'))).toBe(false);
    }
  });
  it('rejects actor as approver, wrong policy version and wrong operation-independent evidence',async()=>{
    const f=setup();
    await expect(f.service.register({...item,approvedBy:item.actorId})).rejects.toThrow();
    await expect(f.service.register({...item,policyVersion:'OTHER'})).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
  });
});
