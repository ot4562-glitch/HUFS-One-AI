import {describe,expect,it} from 'vitest';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const NOW='2026-11-01T00:00:00.000Z';
const actor='SYN-TAG-OWNER',experienceId='SYN-EX1';
const input={actorId:actor,experienceId,expectedApprovalVersion:0,
  expectedContentVersion:1,expectedConsentVersion:1,topics:['DATA_ANALYTICS' as const]};
// SQL fake exercises binding/CAS/rollback behavior, not a real PG lock proof.
function fixture(){
  let approval:Record<string,unknown>|undefined,contentVersion=1,consentVersion=1;
  let storage=true,exists=true,allowed=true,failAudit=false,revokedDuringQuery=false;
  const log:Array<{sql:string;params:readonly unknown[]}>=[];
  const pool:ReviewerSqlPool={connect:async()=>{
    let before:typeof approval;
    return {release:()=>{},query:async(sql,params=[])=>{
      const q=sql.replace(/\s+/g,' ').trim();log.push({sql:q,params});
      if(q==='BEGIN')before=approval?structuredClone(approval):undefined;
      if(q==='ROLLBACK')approval=before;
      if(q.startsWith('SELECT version,choices_json'))return {rows:consentVersion?[{
        version:consentVersion,choices_json:{personalStorage:storage,teamReview:false,
          externalAi:false,ncpStorage:false,presentation:false},
      }]:[]};
      if(q.includes('FROM api_self_workspace_records'))return {rows:exists?[{
        version:contentVersion,value_json:{kind:'EXPERIENCE',state:'DRAFT',
          dataMode:'SYNTHETIC',title:'가상 경험',summary:''},
      }]:[]};
      if(q.startsWith('SELECT version,content_version'))return {rows:approval?[approval]:[]};
      if(q.startsWith('INSERT INTO api_experience_tag_approvals')
        ||q.startsWith('UPDATE api_experience_tag_approvals')){
        if(params[0]!==actor||params[1]!==experienceId)throw Error('Unbound owner');
        approval={version:Number(approval?.version??0)+1,
          content_version:params[2],consent_version:params[3],
          topics:params[4],state:params[5],approved_at:params[6]};
        if(revokedDuringQuery)allowed=false;
        return {rows:[approval]};
      }
      if(q.startsWith('INSERT INTO api_experience_tag_events')&&failAudit)throw Error('Synthetic SQL failure');
      return {rows:[]};
    }};
  }};
  return {pool,log,authority:{mayOperate:async()=>allowed},
    set:(change:{contentVersion?:number;consentVersion?:number;storage?:boolean;
      exists?:boolean;allowed?:boolean;failAudit?:boolean;revokeDuringQuery?:boolean})=>{
      if(change.contentVersion!==undefined)contentVersion=change.contentVersion;
      if(change.consentVersion!==undefined)consentVersion=change.consentVersion;
      if(change.storage!==undefined)storage=change.storage;
      if(change.exists!==undefined)exists=change.exists;
      if(change.allowed!==undefined)allowed=change.allowed;
      if(change.failAudit!==undefined)failAudit=change.failAudit;
      if(change.revokeDuringQuery!==undefined)revokedDuringQuery=change.revokeDuringQuery;
    },raw:()=>approval};
}
async function subject(h:ReturnType<typeof fixture>){
  const module=await import('../../apps/api/src/modules/profiles/experience-approval-postgres.js');
  return new module.PostgresExperienceApprovalStore(h.pool,h.authority,()=>NOW);
}
describe('owner-local experience approval transaction',()=>{
  it('stores local topics bound to exact content and consent versions and projects only current approval',async()=>{
    const h=fixture(),store=await subject(h);
    expect(await store.read({actorId:actor,experienceId})).toEqual({state:'INACTIVE',version:0,reason:'NOT_APPROVED'});
    const saved=await store.approve(input);
    expect(saved).toEqual({state:'ACTIVE',version:1,contentVersion:1,consentVersion:1,
      topics:['DATA_ANALYTICS'],approvedAt:NOW,provenance:'LOCAL_USER_SELECTION'});
    expect((await store.readApprovedTopics({actorId:actor,experienceId,
      expectedContentVersion:1,expectedConsentVersion:1}))?.topics).toEqual(['DATA_ANALYTICS']);
    expect(await store.readApprovedTopics({actorId:actor,experienceId,
      expectedContentVersion:2,expectedConsentVersion:1})).toBeNull();
    expect(h.log.some(x=>x.sql.includes('api_self_consents')&&x.sql.includes('FOR SHARE'))).toBe(true);
    expect(h.log.some(x=>x.sql.includes('api_self_workspace_records')&&x.sql.includes('FOR UPDATE'))).toBe(true);
    expect(h.log.filter(x=>x.sql.startsWith('INSERT INTO api_experience_tag_events'))).toHaveLength(1);
  });
  it('rejects stale content, consent and approval versions before writing',async()=>{
    const h=fixture(),store=await subject(h);
    for(const fields of [{expectedContentVersion:2},{expectedConsentVersion:2},{expectedApprovalVersion:1}])
      await expect(store.approve({...input,...fields})).rejects.toThrow('version conflict');
    expect(h.raw()).toBeUndefined();
    await store.approve(input);
    await expect(store.approve(input)).rejects.toThrow('version conflict');
  });
  it('returns no stale topics after content/consent mutation, deletion or personal-storage withdrawal',async()=>{
    const h=fixture(),store=await subject(h);await store.approve(input);
    for(const update of [{contentVersion:2},{contentVersion:1,consentVersion:2},
      {consentVersion:1,exists:false},{exists:true,storage:false}]){
      h.set(update);
      const read=await store.read({actorId:actor,experienceId});
      expect(read.state).toBe('INACTIVE');expect(read).not.toHaveProperty('topics');
      expect(await store.readApprovedTopics({actorId:actor,experienceId,
        expectedContentVersion:1,expectedConsentVersion:1})).toBeNull();
    }
  });
  it('revokes explicit approval with CAS and permits a fresh explicit reapproval only',async()=>{
    const h=fixture(),store=await subject(h);await store.approve(input);
    const {topics:_,...versions}=input;
    expect(await store.revoke({...versions,expectedApprovalVersion:1})).toEqual({state:'INACTIVE',version:2,reason:'REVOKED'});
    expect(await store.read({actorId:actor,experienceId})).toEqual({state:'INACTIVE',version:2,reason:'REVOKED'});
    expect((await store.approve({...input,expectedApprovalVersion:2})).version).toBe(3);
  });
  it('requires independent owner authority and storage consent; cannot promote through browser fields',async()=>{
    const h=fixture(),store=await subject(h);h.set({allowed:false});
    await expect(store.approve(input)).rejects.toThrow('denied');
    expect(h.log).toHaveLength(0);h.set({allowed:true,storage:false});
    await expect(store.approve(input)).rejects.toThrow('denied');
    h.set({storage:true});
    expect(()=>store.approve({...input,provenance:'LIVE_NCP'} as any)).toThrow();
    expect(h.raw()).toBeUndefined();
  });
  it('rolls back on audit failure or independent authority revocation while awaiting SQL',async()=>{
    for(const change of [{failAudit:true},{revokeDuringQuery:true}]){
      const h=fixture(),store=await subject(h);h.set(change);
      await expect(store.approve(input)).rejects.toThrow();
      expect(h.raw()).toBeUndefined();
      expect(h.log.at(-1)?.sql).toBe('ROLLBACK');
    }
  });
});
