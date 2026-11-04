import {describe,expect,it} from 'vitest';
import {blankDemoProfileValue,DemoProfileRecordSchema,DemoProfileResponseSchema,
  blankDemoProfileWorkspace,DemoProfileWorkspaceSaveSchema} from '@hufs-one/contracts';
import {recomputeDemoProfile} from '../../apps/api/src/modules/profiles/demo-profile.js';
import {PostgresDemoProfileStore} from '../../apps/api/src/modules/profiles/demo-profile-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const NOW='2026-11-05T00:00:00.000Z';
const value={primaryMajor:'가상 정보학',earnedCreditUnits:0,interestTopics:['AI_ML' as const],doubleMajor:{kind:'NONE' as const}};
function database(){
  const rows=new Map<string,Record<string,unknown>>();
  const pool:ReviewerSqlPool={connect:async()=>({release(){},query:async(sql,params=[])=>{
    const id=String(params[0]);
    if(sql.includes('INSERT INTO api_demo_profiles')||sql.includes('UPDATE api_demo_profiles')){
      const previous=rows.get(id);
      const row={version:Number(previous?.version??0)+1,value_json:JSON.parse(String(params[1])),
        last_operation:params[2],last_expected_version:params[3],updated_at:NOW,
        workspace_json:JSON.parse(String(params[4]))};
      rows.set(id,row);return {rows:[row]};
    }
    return {rows:sql.includes('FROM api_demo_profiles')&&rows.has(id)?[rows.get(id)!]:[]};
  }})};
  return {pool,rows};
}
describe('#132 one EMPTY_DEMO workspace and reset boundary',()=>{
  it('normalizes legacy settings to an empty workspace and validates every derived version/asOf',()=>{
    const legacy=DemoProfileRecordSchema.parse({version:1,value,updatedAt:NOW});
    expect(legacy.workspace).toEqual(blankDemoProfileWorkspace());
    const response=recomputeDemoProfile(legacy);
    expect(response.snapshot.calendar.asOf).toBe(response.snapshot.asOf);
    expect(response.snapshot.catalog.every(o=>o.dataMode==='SYNTHETIC'&&!o.applicationUrlRef)).toBe(true);
    expect(response.snapshot.catalog.some(o=>o.id==='SYN-OPP-038')).toBe(false);
    expect(response.snapshot.allCards.map(c=>c.opportunityId).sort()).toEqual(response.snapshot.catalog.map(o=>o.id).sort());
    expect(response.snapshot.allCards.some(c=>c.lifecycle==='CLOSED')).toBe(true);
    expect(response.snapshot.corpus).toMatchObject({opportunities:40,notices:10,profiles:5});
    expect(DemoProfileResponseSchema.safeParse({...response,snapshot:{...response.snapshot,version:2}}).success).toBe(false);
  });
  it('keeps experience drafts out of ranking until explicit synthetic overlay; never creates official facts',()=>{
    const workspace={...blankDemoProfileWorkspace(),experiences:[{id:'SYN-EXP-001',title:'가상 번역 활동',summary:'합성 경험',topicCodes:['LANGUAGE_TRANSLATION' as const]}]};
    const off=recomputeDemoProfile({version:1,value,workspace,updatedAt:NOW});
    const on=recomputeDemoProfile({version:2,value,workspace:{...workspace,experienceOverlay:'ON'},updatedAt:NOW});
    expect(on.snapshot.feed).not.toEqual(off.snapshot.feed);
    expect(on.snapshot.experienceSignals).toMatchObject({mode:'SYNTHETIC_OVERLAY',topics:['LANGUAGE_TRANSLATION']});
    expect(on.snapshot.academics.state).toBe('UNKNOWN');
    expect(on.snapshot.forecast.state).toBe('UNKNOWN');
    expect(on.snapshot.verification).toBe('UNVERIFIED_SELF_REPORT');
  });
  it('persists workspace with the same CAS version, preserves it on profile edit and clears all fields on reset',async()=>{
    const db=database(),first=new PostgresDemoProfileStore(db.pool);
    const workspace={...blankDemoProfileWorkspace(),bookmarks:['SYN-OPP-002'],search:'가상',notifications:true,
      experiences:[{id:'SYN-EXP-001',title:'가상 분석 활동',summary:'합성',topicCodes:['DATA_ANALYTICS' as const]}],
      planCourseIds:['SYN-COURSE-001'],experienceOverlay:'ON' as const};
    await first.save('SYN-OWNER-EMPTY',{expectedVersion:0,value});
    const saved=await first.saveWorkspace('SYN-OWNER-EMPTY',{expectedVersion:1,workspace});
    expect(saved.version).toBe(2);expect(saved.workspace).toEqual(workspace);
    expect(await first.saveWorkspace('SYN-OWNER-EMPTY',{expectedVersion:1,workspace})).toEqual(saved);
    const second=new PostgresDemoProfileStore(db.pool);
    const edited=await second.save('SYN-OWNER-EMPTY',{expectedVersion:2,value:{...value,earnedCreditUnits:1}});
    expect(edited.workspace).toEqual(workspace);
    expect((await second.read('SYN-OTHER')).workspace).toEqual(blankDemoProfileWorkspace());
    await expect(first.saveWorkspace('SYN-OWNER-EMPTY',{expectedVersion:1,workspace})).rejects.toThrow(/version conflict/);
    const reset=await second.reset('SYN-OWNER-EMPTY',{expectedVersion:3});
    expect(reset).toMatchObject({version:4,value:blankDemoProfileValue(),workspace:blankDemoProfileWorkspace()});
    await expect(first.saveWorkspace('SYN-OWNER-EMPTY',{expectedVersion:2,workspace})).rejects.toThrow(/version conflict/);
  });
  it('rejects forged identity, duplicate IDs and non-corpus bookmarks before SQL access',async()=>{
    const db=database(),store=new PostgresDemoProfileStore(db.pool);
    expect(DemoProfileWorkspaceSaveSchema.safeParse({expectedVersion:0,workspace:blankDemoProfileWorkspace(),actorId:'S01'}).success).toBe(false);
    await expect(store.saveWorkspace('SYN-OWNER-EMPTY',{expectedVersion:0,workspace:{...blankDemoProfileWorkspace(),bookmarks:['REAL-PRIVATE-001']}})).rejects.toThrow();
    expect(db.rows.size).toBe(0);
  });
});
