import type {Pool} from 'pg';
import {expect} from 'vitest';
import {PostgresOwnerWorkspaceStore} from '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import {PostgresSelfAccountStore} from '../../apps/api/src/modules/profiles/self-account-postgres.js';
export async function proveGuideWorkspace(admin:Pool,owner:Pool){
  const actorId='SYN-GUIDE-SQL-OWNER';
  const pool={connect:async()=>{const c=await owner.connect();return {
    query:async(sql:string,params:readonly unknown[]=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release(),
  };}};
  const accounts=new PostgresSelfAccountStore(pool,{mayAccess:async i=>i.actorId===actorId});
  const store=new PostgresOwnerWorkspaceStore(pool,{mayOperate:async i=>i.actorId===actorId});
  const choices={personalStorage:true,teamReview:false,externalAi:false,ncpStorage:false,presentation:false};
  await accounts.putConsents(actorId,{expectedVersion:0,choices});
  const value={kind:'GUIDE_CHECKLIST' as const,dataMode:'OWNER_CONSENTED' as const,state:'SELF_REPORTED' as const,
    guideId:'SYN-GUIDE',guideRevisionId:'SYN-REV',locale:'zh' as const,translationVersion:'SYN-ZH-1',
    contextVersion:'a'.repeat(64),ownerCheckedStepIds:['SYN-STEP']};
  const first=await store.create({actorId,itemId:'SYN-GUIDE-CHECKLIST',value});
  expect(first.value).toEqual(value);
  const second=await store.update({actorId,kind:'GUIDE_CHECKLIST',itemId:first.itemId,expectedVersion:1,
    value:{...value,ownerCheckedStepIds:[]}});
  expect(second.version).toBe(2);
  await expect(store.update({actorId,kind:'GUIDE_CHECKLIST',itemId:first.itemId,expectedVersion:1,value})).rejects.toThrow('version conflict');
  const c=await owner.connect();
  try{
    await c.query('BEGIN');await c.query("SELECT set_config('hufs.self_actor',$1,true)",['SYN-OTHER']);
    expect((await c.query('SELECT value_json FROM api_self_workspace_records WHERE item_id=$1',[first.itemId])).rows).toEqual([]);
    await c.query('ROLLBACK');
  }finally{c.release();}
  await accounts.putConsents(actorId,{expectedVersion:1,choices:{...choices,personalStorage:false}});
  expect((await admin.query('SELECT count(*)::integer AS n FROM api_self_workspace_records WHERE actor_id=$1',[actorId])).rows[0].n).toBe(0);
  await expect(store.read({actorId,kind:'GUIDE_CHECKLIST',itemId:first.itemId})).rejects.toThrow('access denied');
}
