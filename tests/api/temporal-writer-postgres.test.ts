import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {PostgresSourceRevisionWriter} from
  '../../apps/api/src/modules/opportunities/temporal-writer-postgres.js';
import {hashRevisionParagraphs} from
  '../../apps/api/src/modules/opportunities/revision-ledger.js';
import type {ReviewerSqlConnection,ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

const T=(day:number)=>`2026-10-${day}T00:00:00.000Z`;
const ps=[{id:'p1',text:'합성 공고 정정 모집 마감'}];
const bytes=Buffer.from('synthetic original bytes');
function record(options:{revisionId?:string;date?:number;supersedes?:string;
  changeKind?:string;status?:string}={}){
  const date=options.date??20;
  return {revision:{
    revisionId:options.revisionId??'rev-1',sourceId:'source-1',
    ...(options.supersedes?{supersedes:options.supersedes}:{}),
    originalSha256:createHash('sha256').update(bytes).digest('hex'),
    contentSha256:hashRevisionParagraphs(ps),
    mediaKind:'TEXT',sourceClass:'SYNTHETIC',permissionRef:'perm-1',
    provenance:'SYNTHETIC',status:options.status??'ACTIVE',
    changeKind:options.changeKind??'NEW',
    fetchedAt:T(date),lastCheckedAt:T(date),lastVerifiedAt:T(date),
    topicCodes:[],
  },paragraphs:ps,originalBytes:bytes,permissionReviewed:true};
}
function db(settings:{head?:string|null;headAt?:string;
  failAt?:string}={}){
  const calls:Array<{sql:string;params:readonly unknown[]}>=[],released:number[]=[];
  let head=settings.head??null;
  let fetched=settings.headAt??null;
  const connection:ReviewerSqlConnection={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(sql.includes(settings.failAt??'NO_MATCH_NEVER'))
        throw new Error('synthetic SQL connection failure');
      if(sql.includes('SELECT revision_id,fetched_at'))
        return {rows:[{revision_id:head,fetched_at:fetched}]};
      if(sql.includes('UPDATE source_ingest_heads'))
        return {rows:[{source_id:'source-1'}]};
      if(sql.includes('INSERT INTO source_revisions_vnext')){
        head=String(params[0]);
        fetched=String(params[12]);
      }
      return {rows:[]};
    },
    release:()=>released.push(1),
  };
  return {store:new PostgresSourceRevisionWriter({
    connect:async()=>connection,
  }),calls,released};
}
describe('TASK-19 SQL append-only revisions and atomic cross-instance invalidation',()=>{
  it('locks a source head before writing original revision and text paragraphs',async()=>{
    const x=db();
    const event=await x.store.append(record());
    expect(event).toBeNull();
    expect(x.calls[0]?.sql.trim()).toBe('BEGIN');
    expect(x.calls.some(q=>q.sql.includes('FOR UPDATE'))).toBe(true);
    expect(x.calls.some(q=>q.sql.includes('WITH ORDINALITY'))).toBe(true);
    expect(x.calls.some(q=>q.sql.includes('INSERT INTO source_revisions_vnext'))).toBe(true);
    expect(x.calls.at(-1)?.sql.trim()).toBe('COMMIT');
    expect(x.released).toHaveLength(1);
  });
  it('never drops source cohort/major-role/admission/term constraints in the immutable insert',async()=>{
    const x=db();
    const item=record();
    item.revision={...item.revision,
      applicableScope:{
        campuses:['SEOUL'],majorCodes:['ECONOMICS'],colleges:['SOCSCI'],
        majorRoles:['PRIMARY'],admissionTypes:['FOREIGN'],
        enrollmentStates:['ENROLLED'],graduationTermScope:['2026-2'],
        cohortMax:2014,
      },
    } as typeof item.revision;
    await x.store.append(item);
    const write=x.calls.find(q=>q.sql.includes('INSERT INTO source_revisions_vnext'))!;
    for(const field of ['scope_colleges','scope_major_roles','scope_admission_types',
      'scope_enrollment_states','scope_graduation_terms','cohort_min','cohort_max']){
      expect(write.sql).toContain(field);
    }
    expect(write.params.slice(17,26)).toEqual([
      ['SEOUL'],['ECONOMICS'],['SOCSCI'],['PRIMARY'],['FOREIGN'],
      ['ENROLLED'],['2026-2'],null,2014,
    ]);
  });
  it('atomically appends corrected version and full invalidation in same transaction',async()=>{
    const x=db({head:'rev-1',headAt:T(20)});
    const result=await x.store.append(record({
      revisionId:'rev-2',date:25,supersedes:'rev-1',changeKind:'CORRECTED',
    }));
    expect(result).toMatchObject({
      previousRevisionId:'rev-1',newRevisionId:'rev-2',reason:'CORRECTED',
    });
    expect(result?.invalidates).toContain('AI_CACHE');
    const event=x.calls.find(q=>q.sql.includes('INSERT INTO source_invalidation_events'));
    expect(event?.params[2]).toBe('rev-1');
    const deliveries=x.calls.find(q=>q.sql.includes('INSERT INTO source_invalidation_deliveries'));
    expect(deliveries?.params[0]).toBe('revision:rev-2');
    expect(deliveries?.params[1]).toEqual([
      'RETRIEVAL','CLAIMS','FEED','NOTICES','AI_CACHE',
    ]);
    expect(x.calls.at(-1)?.sql.trim()).toBe('COMMIT');
    expect(x.released).toHaveLength(1);
  });
  it('rolls back a revision when its outbox deliveries cannot be inserted',async()=>{
    const x=db({head:'rev-1',headAt:T(20),failAt:'source_invalidation_deliveries'});
    await expect(x.store.append(record({
      revisionId:'rev-2',date:25,supersedes:'rev-1',changeKind:'CORRECTED',
    }))).rejects.toThrow(/synthetic SQL/);
    expect(x.calls.some(q=>q.sql.trim()==='ROLLBACK')).toBe(true);
    expect(x.calls.every(q=>q.sql.trim()!=='COMMIT')).toBe(true);
    expect(x.released).toHaveLength(1);
  });
  it('refuses a concurrent stale supersedes link and rolls back',async()=>{
    const x=db({head:'rev-NEW',headAt:T(24)});
    await expect(x.store.append(record({
      revisionId:'rev-2',date:25,supersedes:'rev-1',changeKind:'CORRECTED',
    }))).rejects.toThrow(/head/);
    expect(x.calls.some(q=>q.sql.trim()==='ROLLBACK')).toBe(true);
    expect(x.calls.every(q=>!q.sql.includes('INSERT INTO source_revisions_vnext')))
      .toBe(true);
    expect(x.released).toHaveLength(1);
  });
  it('rolls back the revision/paragraph transaction on a SQL exception',async()=>{
    const x=db({failAt:'source_paragraphs_vnext'});
    await expect(x.store.append(record())).rejects.toThrow();
    expect(x.calls.some(q=>q.sql.trim()==='ROLLBACK')).toBe(true);
    expect(x.calls.every(q=>q.sql.trim()!=='COMMIT')).toBe(true);
    expect(x.released).toHaveLength(1);
  });
  it('cannot write unreviewed rights or tampered original bytes',async()=>{
    const x=db();
    await expect(x.store.append({...record(),permissionReviewed:false}))
      .rejects.toThrow(/rights/);
    await expect(x.store.append({...record(),originalBytes:Buffer.from('forged')}))
      .rejects.toThrow(/integrity/);
    expect(x.calls).toHaveLength(0);
  });
  it.each(['IMAGE','PDF'])('refuses %s revisions without retained image evidence and independent review',async mediaKind=>{
    const x=db(),item=record();
    await expect(x.store.append({...item,revision:{...item.revision,mediaKind,
      status:'NEEDS_REVIEW',lastVerifiedAt:undefined}})).rejects.toThrow();
    expect(x.calls).toHaveLength(0);
  });
  it('updates 304 observations independently without modifying verification timestamps',async()=>{
    const x=db({head:'rev-1',headAt:T(20)});
    await x.store.observeUnchanged({
      sourceId:'source-1',revisionId:'rev-1',
      checkedAt:T(21),responseStatus:304,
    });
    expect(x.calls.some(q=>q.sql.includes('source_check_observations'))).toBe(true);
    expect(x.calls.every(q=>!q.sql.includes('last_verified_at'))).toBe(true);
    expect(x.calls.at(-1)?.sql.trim()).toBe('COMMIT');
    expect(x.released).toHaveLength(1);
  });
  it('keeps an unchanged check in a short transaction and rolls it back on failure',async()=>{
    const x=db({head:'rev-1',failAt:'source_check_observations'});
    await expect(x.store.observeUnchanged({
      sourceId:'source-1',revisionId:'rev-1',
      checkedAt:T(21),responseStatus:200,
    })).rejects.toThrow();
    expect(x.calls.some(q=>q.sql.trim()==='ROLLBACK')).toBe(true);
    expect(x.calls.every(q=>q.sql.trim()!=='COMMIT')).toBe(true);
    expect(x.released).toHaveLength(1);
  });
});
