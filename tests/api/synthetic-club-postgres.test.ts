import {describe,expect,it} from 'vitest';
import {PostgresSyntheticClubStore} from '../../apps/api/src/modules/opportunities/synthetic-club-postgres.js';
import {SyntheticClubConflict,SyntheticClubDenied} from '../../apps/api/src/modules/opportunities/synthetic-club-publication.js';
import {SyntheticClubAdminRecordSchema,type SyntheticClubContent} from '@hufs-one/contracts';

const asOf='2026-11-20T00:00:00.000Z',now='2026-11-05T00:00:00.000Z';
const content:SyntheticClubContent={clubName:'가상동아리 AI 탐험대',summary:'합성 모집 시연',category:'IT_AI',campus:'SEOUL',
  topicCodes:['AI_ML'],activities:['PROJECT'],conditions:[],posterAssetId:'SYN-POSTER-CLUB-090',dataMode:'SYNTHETIC'};
const source='SYNTHETIC_CLUB_DEMO_V1';
function fixture(){
  const queries:{sql:string;params:readonly unknown[]}[]=[];
  let old:unknown,active=true,collision=false,returned:unknown;
  const c={release(){queries.push({sql:'RELEASE',params:[]});},async query(sql:string,params:readonly unknown[]=[]){
    queries.push({sql,params});
    if(sql.includes('FROM synthetic_club_grants'))return {rows:active?[{role:'ADMIN',profile_json:null}]:[]};
    if(sql.includes('FROM synthetic_club_catalog'))return {rows:[{revision:'0',as_of:asOf,recorded_at:now}]};
    if(sql.includes('count(*)'))return {rows:[{count:'0'}]};
    if(sql.includes('SELECT record_json'))return {rows:old?[{record_json:old}]:[]};
    if(sql.includes('INSERT INTO synthetic_club_posts')||sql.includes('UPDATE synthetic_club_posts')){
      if(collision)throw Object.assign(new Error('database collision'),{code:'23505'});
      const payload=params.find(v=>typeof v==='string'&&v.startsWith('{"post"'));
      returned=JSON.parse(String(payload));return {rows:[{record_json:returned}]};
    }
    return {rows:[]};
  }};
  return {queries,pool:{connect:async()=>c},old:(v:unknown)=>{old=v;},active:(v:boolean)=>{active=v;},
    collision:()=>{collision=true;},returned:()=>returned};
}
describe('#123 durable synthetic publication transaction',()=>{
  it('uses database catalog time and trusted actor/source, then revalidates authority before commit',async()=>{
    const f=fixture(),store=new PostgresSyntheticClubStore(f.pool,{sourceRef:source});let checks=0;
    const result=await store.publication.create({adminActorId:'admin',postId:'SYN-CLUB-090',content:{...content,topicCodes:[...content.topicCodes],activities:[...content.activities]},
      now:'2040-01-01T00:00:00.000Z',assertCurrentAdmin:async()=>{checks++;return true;}});
    const r=SyntheticClubAdminRecordSchema.parse((result as {record:unknown}).record);
    expect(r).toMatchObject({version:1,sourceRef:source,asOf,recordedAt:now,lastActor:{actorId:'admin',role:'ADMIN'},
      post:{state:'REVIEW_PENDING',createdAt:asOf,updatedAt:asOf}});
    expect(r.post.approvedAt).toBeUndefined();expect(checks).toBeGreaterThanOrEqual(2);
    expect(f.queries.some(q=>q.sql.includes('FOR SHARE'))).toBe(true);
    expect(f.queries.some(q=>q.sql.includes('FOR UPDATE'))).toBe(true);
    expect(f.queries.at(-2)?.sql).toBe('COMMIT');expect(f.queries.at(-1)?.sql).toBe('RELEASE');
  });
  it('rolls back a newly written row when independent authority disappears before COMMIT',async()=>{
    const f=fixture(),store=new PostgresSyntheticClubStore(f.pool,{sourceRef:source});let checks=0;
    await expect(store.publication.create({adminActorId:'admin',postId:'SYN-CLUB-090',
      content:{...content,topicCodes:[...content.topicCodes],activities:[...content.activities]},now,
      assertCurrentAdmin:async()=>++checks===1})).rejects.toBeInstanceOf(SyntheticClubDenied);
    expect(f.queries.some(q=>q.sql==='COMMIT')).toBe(false);
    expect(f.queries.at(-2)?.sql).toBe('ROLLBACK');
  });
  it('rejects stale revisions and duplicate create without overwriting existing data',async()=>{
    const f=fixture(),store=new PostgresSyntheticClubStore(f.pool,{sourceRef:source});
    const scope={adminActorId:'admin',postId:'SYN-CLUB-090',
      content:{...content,topicCodes:[...content.topicCodes],activities:[...content.activities]},now,assertCurrentAdmin:async()=>true};
    await store.publication.create(scope);f.old(f.returned());
    await expect(store.publication.edit({...scope,expectedVersion:0})).rejects.toBeInstanceOf(SyntheticClubConflict);
    const g=fixture();g.collision();
    await expect(new PostgresSyntheticClubStore(g.pool,{sourceRef:source}).publication.create(scope)).rejects.toBeInstanceOf(SyntheticClubConflict);
    expect(g.queries.at(-2)?.sql).toBe('ROLLBACK');
  });
  it('denies missing durable grants even when a route callback claims ADMIN authority',async()=>{
    const f=fixture();f.active(false);const store=new PostgresSyntheticClubStore(f.pool,{sourceRef:source});
    await expect(store.publication.list({adminActorId:'admin',now,assertCurrentAdmin:async()=>true})).rejects.toBeInstanceOf(SyntheticClubDenied);
    expect(f.queries.some(q=>q.sql.includes('INSERT INTO synthetic_club_posts'))).toBe(false);
    expect(()=>new PostgresSyntheticClubStore(f.pool,{sourceRef:'real-campus'})).toThrow();
  });
  it('invalidates a read receipt when the same actor synthetic profile or durable grant changes',async()=>{
    const profile={interestTopics:['AI_ML'],approvedExperienceTopics:[],desiredActivities:['PROJECT'],facts:{}};
    let currentProfile:unknown=profile,grantVersion=1,receipt:Record<string,unknown>|null=null;
    const c={release(){},async query(sql:string,params:readonly unknown[]=[]){
      if(sql.includes('FROM synthetic_club_grants'))return {rows:[{role:'BETA',profile_json:currentProfile,grant_version:grantVersion}]};
      if(sql.includes('FROM synthetic_club_catalog'))return {rows:[{revision:'0',as_of:asOf,recorded_at:now}]};
      if(sql.includes('INSERT INTO synthetic_club_read_receipts')){
        receipt={revision:params[3],as_of:params[4],profile_digest:params[5],grant_version:params[6],active:true};
      }
      if(sql.includes('DELETE FROM synthetic_club_read_receipts')&&sql.includes('RETURNING')){
        const old=receipt;receipt=null;return {rows:old?[old]:[]};
      }
      return {rows:[]};
    }};
    const store=new PostgresSyntheticClubStore({connect:async()=>c},{sourceRef:source});
    const first=await store.source.read({actorId:'student',now});expect(first).not.toBeNull();
    currentProfile={...profile,interestTopics:['CULTURE_TOURISM']};
    expect(await store.source.revalidate({actorId:'student',now,receipt:first!.receipt,revision:first!.revision})).toBe(false);
    currentProfile=profile;
    const second=await store.source.read({actorId:'student',now});grantVersion++;
    expect(await store.source.revalidate({actorId:'student',now,receipt:second!.receipt,revision:second!.revision})).toBe(false);
    const third=await store.source.read({actorId:'student',now});
    expect(await store.source.revalidate({actorId:'student',now,receipt:third!.receipt,revision:third!.revision})).toBe(true);
    expect(await store.source.revalidate({actorId:'student',now,receipt:third!.receipt,revision:third!.revision})).toBe(false);
  });

});
