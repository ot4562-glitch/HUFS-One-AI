import {describe,expect,it} from 'vitest';
import {PostgresOwnerWorkspaceStore} from '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import {PostgresSelfAccountStore} from '../../apps/api/src/modules/profiles/self-account-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
const NOW='2026-11-01T00:00:00.000Z',actor='SYN-TAG-OWNER';
const value={kind:'EXPERIENCE' as const,dataMode:'SYNTHETIC' as const,
  state:'DRAFT' as const,title:'가상 경험',summary:''};
const choices={personalStorage:true,teamReview:false,externalAi:false,ncpStorage:false,presentation:false};
function fixture(failInvalidation=false){
  const log:Array<{sql:string;params:readonly unknown[]}>=[];
  const pool:ReviewerSqlPool={connect:async()=>({release:()=>{},query:async(sql,params=[])=>{
    const q=sql.replace(/\s+/g,' ').trim();log.push({sql:q,params});
    if(q.startsWith('SELECT choices_json')||q.startsWith('SELECT version,choices_json'))
      return {rows:[{version:1,choices_json:choices,updated_at:NOW}]};
    if(q.startsWith('SELECT item_id,kind'))return {rows:[{
      item_id:'SYN-EX1',kind:'EXPERIENCE',version:1,value_json:value,updated_at:NOW}]};
    if(q.startsWith('UPDATE api_self_workspace_records'))return {rows:[{
      item_id:'SYN-EX1',kind:'EXPERIENCE',version:2,value_json:value,updated_at:NOW}]};
    if(q.startsWith('UPDATE api_self_consents'))return {rows:[{
      version:2,choices_json:JSON.parse(String(params[1])),updated_at:NOW}]};
    if(q.startsWith('WITH invalidated')&&failInvalidation)throw Error('Synthetic invalidation failure');
    return {rows:[]};
  }})};
  return {pool,log};
}
describe('experience approval same-transaction invalidation',()=>{
  it('invalidates after successful experience update/delete before commit, scoped to exactly the owner and record',async()=>{
    for(const operation of ['update','delete'] as const){
      const h=fixture(),store=new PostgresOwnerWorkspaceStore(h.pool,{mayOperate:async()=>true},()=>NOW);
      await store[operation]({actorId:actor,kind:'EXPERIENCE',itemId:'SYN-EX1',expectedVersion:1,value});
      const index=h.log.findIndex(x=>x.sql.startsWith('WITH invalidated'));
      expect(index,'content mutation invalidates derived approval in its transaction').toBeGreaterThan(0);
      expect(h.log[index]?.params).toEqual([actor,'SYN-EX1']);
      expect(h.log[index]?.sql).toContain('INSERT INTO api_experience_tag_events');
      expect(h.log.at(-1)?.sql).toBe('COMMIT');
    }
  });
  it('invalidates on any real consent version change and purges approvals before storage withdrawal',async()=>{
    for(const personalStorage of [true,false]){
      const h=fixture(),store=new PostgresSelfAccountStore(h.pool,{mayAccess:async()=>true},()=>NOW);
      await store.putConsents(actor,{expectedVersion:1,choices:{...choices,personalStorage,externalAi:true}});
      const index=h.log.findIndex(x=>x.sql.startsWith('WITH invalidated'));
      expect(index,'changed consent invalidates approval').toBeGreaterThan(0);
      expect(h.log[index]?.params).toEqual([actor]);
      if(!personalStorage){
        const purge=h.log.findIndex(x=>x.sql.startsWith('DELETE FROM api_experience_tag_approvals'));
        const records=h.log.findIndex(x=>x.sql.startsWith('DELETE FROM api_self_workspace_records'));
        expect(purge).toBeGreaterThan(index);expect(records).toBeGreaterThan(purge);
      }
    }
  });
  it('does not invalidate unchanged consent and rolls content mutation back when invalidation fails',async()=>{
    const unchanged=fixture(),account=new PostgresSelfAccountStore(unchanged.pool,{mayAccess:async()=>true},()=>NOW);
    await account.putConsents(actor,{expectedVersion:1,choices});
    expect(unchanged.log.some(x=>x.sql.startsWith('WITH invalidated'))).toBe(false);
    const h=fixture(true),workspace=new PostgresOwnerWorkspaceStore(h.pool,{mayOperate:async()=>true},()=>NOW);
    await expect(workspace.update({actorId:actor,kind:'EXPERIENCE',itemId:'SYN-EX1',
      expectedVersion:1,value})).rejects.toThrow('Synthetic invalidation failure');
    expect(h.log.at(-1)?.sql).toBe('ROLLBACK');
    expect(h.log.some(x=>x.sql==='COMMIT')).toBe(false);
  });
});
