import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {MemorySourceRevisionLedger,hashRevisionParagraphs} from
  '../../apps/api/src/modules/opportunities/revision-ledger.js';

const T=(day:number)=>`2026-10-${String(day).padStart(2,'0')}T00:00:00.000Z`;
const sourceId='source-1',permissionRef='perm-1';
const para=(text:string)=>[{id:'p1',text}];
const orig=(text:string)=>Buffer.from('synthetic-raw:'+text,'utf8');
const h=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function item(options:{
  text?:string;date?:number;revisionId?:string;status?:string;
  changeKind?:string;supersedes?:string;permissionRef?:string;
  publishedAt?:string;lastVerifiedAt?:string;
  applicableScope?:unknown;validUntil?:string;sourceId?:string;
}={}){
  const text=options.text??'학생 데이터 분석 모집은 11월 2일 마감입니다.';
  const ps=para(text),originalBytes=orig(text);
  const date=options.date??20;
  return {revision:{
    revisionId:options.revisionId??'rev1',sourceId:options.sourceId??sourceId,
    mediaKind:'TEXT',originalSha256:h(originalBytes),
    contentSha256:hashRevisionParagraphs(ps),
    sourceClass:'SYNTHETIC',permissionRef:options.permissionRef??permissionRef,
    provenance:'SYNTHETIC',status:options.status??'ACTIVE',
    changeKind:options.changeKind??'NEW',supersedes:options.supersedes,
    fetchedAt:T(date),publishedAt:options.publishedAt??T(date),
    lastCheckedAt:T(date),
    lastVerifiedAt:options.lastVerifiedAt===undefined
      ?(options.status&&options.status!=='ACTIVE'?undefined:T(date))
      :options.lastVerifiedAt,
    applicableScope:options.applicableScope,validUntil:options.validUntil,
  },paragraphs:ps,originalBytes,permissionReviewed:true};
}
function add(ledger:MemorySourceRevisionLedger,overrides:Parameters<typeof item>[0]={}) {
  return ledger.add(item(overrides));
}
function query(day=22,settings:Record<string,unknown>={}){
  return {query:'데이터 모집',asOf:T(day),
    permissionRefs:new Set([permissionRef]),...settings};
}
describe('TASK-19/21 deterministic source ledger and permission-first temporal retrieval',()=>{
  it('returns approved source revisions and exact original quote spans',()=>{
    const ledger=new MemorySourceRevisionLedger();add(ledger);
    const value=ledger.retrieve(query());
    expect(value.envelope.retrievalState).toBe('READY');
    expect(value.envelope.evidence[0]).toMatchObject({
      kind:'TEXT',sourceRevisionId:'rev1',paragraphId:'p1',
      startCodePoint:0,
    });
    expect(value.hits[0]?.quote).toContain('11월 2일');
  });
  it('rejects unreconciled content vs original digests before persisting',()=>{
    const ledger=new MemorySourceRevisionLedger();
    const record=item();
    expect(()=>ledger.add({...record,originalBytes:Buffer.from('changed')}))
      .toThrow(/SHA-256/);
    expect(()=>ledger.add({...record,paragraphs:para('wrong')}))
      .toThrow(/SHA-256/);
    expect(ledger.size()).toBe(0);
  });
  it('denies sources that lack an explicit verified collection permission',()=>{
    const ledger=new MemorySourceRevisionLedger(),record=item();
    expect(()=>ledger.add({...record,permissionReviewed:false})).toThrow(/permission/);
    expect(ledger.size()).toBe(0);
  });
  it('blocks exact prior-to-fetched and prior-to-published historical replay',()=>{
    const ledger=new MemorySourceRevisionLedger();add(ledger);
    expect(ledger.retrieve(query(19)).envelope.retrievalState).toBe('NO_EVIDENCE');
    const later=new MemorySourceRevisionLedger();
    add(later,{publishedAt:T(25)});
    expect(later.retrieve(query(22)).hits).toHaveLength(0);
    expect(later.retrieve(query(26)).envelope.retrievalState).toBe('READY');
  });
  it('never upgrades unchanged HTTP-304 checks into independent human verification',()=>{
    const ledger=new MemorySourceRevisionLedger();
    add(ledger,{lastVerifiedAt:T(26)});
    expect(ledger.retrieve(query(22)).envelope.retrievalState).toBe('STALE');
    const before=ledger.latest(sourceId)?.revision.lastVerifiedAt;
    ledger.observeNotModified(sourceId,T(27));
    expect(ledger.lastChecked(sourceId)).toBe(T(27));
    expect(ledger.latest(sourceId)?.revision.lastVerifiedAt).toBe(before);
    expect(ledger.size()).toBe(1);
    expect(ledger.retrieve(query(22)).envelope.retrievalState).toBe('STALE');
  });
  it('blocks nonmonotonic checks and unknown 304 sources',()=>{
    const ledger=new MemorySourceRevisionLedger();
    expect(()=>ledger.observeNotModified('missing',T(21))).toThrow();
    add(ledger);
    expect(()=>ledger.observeNotModified(sourceId,T(19))).toThrow();
  });
  it('shadows corrected sources immediately, even before human review',()=>{
    const ledger=new MemorySourceRevisionLedger();add(ledger);
    const event=add(ledger,{date:25,revisionId:'rev2',supersedes:'rev1',
      changeKind:'CORRECTED',status:'NEEDS_REVIEW',
      text:'정정: 모집 마감은 11월 20일입니다.'});
    expect(event?.invalidates).toContain('CLAIMS');
    expect(event?.invalidates).toContain('FEED');
    expect(ledger.retrieve(query(24)).hits[0]?.revisionId).toBe('rev1');
    expect(ledger.retrieve(query(26)).envelope.retrievalState).toBe('STALE');
    expect(ledger.retrieve(query(26)).hits).toHaveLength(0);
  });
  it('never resurfaces an earlier active version after cancellation or revoked rights',()=>{
    for(const status of ['RETRACTED','BLOCKED_RIGHTS']){
      const ledger=new MemorySourceRevisionLedger();add(ledger);
      add(ledger,{date:25,revisionId:'rev2',supersedes:'rev1',
        changeKind:'CANCELLED',status,
        text:'모집 취소 및 증거 비활성'});
      expect(ledger.retrieve(query(26)).hits).toHaveLength(0);
      expect(ledger.retrieve(query(24)).hits[0]?.revisionId).toBe('rev1');
    }
  });
  it('rejects a broken supersedes link, duplicate ID and reverse timestamp',()=>{
    const ledger=new MemorySourceRevisionLedger();add(ledger);
    expect(()=>add(ledger)).toThrow(/Immutable/);
    expect(()=>add(ledger,{date:25,revisionId:'rev2',changeKind:'CORRECTED',
      supersedes:'wrong'})).toThrow(/supersedes/);
    expect(()=>add(ledger,{date:19,revisionId:'rev2',changeKind:'CORRECTED',
      supersedes:'rev1'})).toThrow(/Non-increasing/);
    expect(ledger.size()).toBe(1);
  });
  it('never leaks old evidence through a newly unapproved permission revision',()=>{
    const ledger=new MemorySourceRevisionLedger();add(ledger);
    add(ledger,{date:25,revisionId:'rev2',supersedes:'rev1',
      changeKind:'CORRECTED',permissionRef:'perm-revoked',
      text:'데이터 모집 마감 수정'});
    expect(ledger.retrieve(query(26)).envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(ledger.retrieve(query(26)).envelope.sourceRevisionIds).toEqual([]);
  });
  it('fails closed on campus, major and cohort applicability',()=>{
    const ledger=new MemorySourceRevisionLedger();
    add(ledger,{applicableScope:{
      campuses:['SEOUL'],majorCodes:['ECONOMICS'],cohortRange:[2022,2026],
    }});
    for(const settings of [
      {campus:'GLOBAL',majorCode:'ECONOMICS',cohort:2024},
      {campus:'SEOUL',majorCode:'OTHER',cohort:2024},
      {campus:'SEOUL',majorCode:'ECONOMICS',cohort:2021},
      {campus:'SEOUL',majorCode:'ECONOMICS'},
    ])expect(ledger.retrieve(query(22,settings)).hits).toHaveLength(0);
    expect(ledger.retrieve(query(22,{campus:'SEOUL',majorCode:'ECONOMICS',cohort:2024}))
      .hits).toHaveLength(1);
  });
  it('never returns a quote for the wrong verified graduation term, admission, major role or one-ended cohort',()=>{
    const ledger=new MemorySourceRevisionLedger();
    add(ledger,{applicableScope:{
      campuses:['SEOUL'],majorCodes:['ECONOMICS'],majorRoles:['PRIMARY'],
      admissionTypes:['FOREIGN'],graduationTermScope:['2026-2'],cohortMax:2014,
    }});
    const valid={
      campus:'SEOUL',majorCode:'ECONOMICS',cohort:2014,
      majors:[{code:'ECONOMICS',role:'PRIMARY'}],
      admissionType:'FOREIGN',graduationTerm:'2026-2',
      graduationTermVerified:true,
    };
    expect(ledger.retrieve(query(22,valid)).hits).toHaveLength(1);
    for(const invalid of [
      {admissionType:'DOMESTIC'},
      {graduationTerm:'2027-1'},
      {graduationTermVerified:false},
      {graduationTermVerified:undefined},
      {cohort:2015},
      {cohort:undefined},
      {majors:[{code:'ECONOMICS',role:'DOUBLE'}]},
      {majors:[{code:'OTHER',role:'PRIMARY'},{code:'ECONOMICS',role:'DOUBLE'}]},
      {majors:undefined},
    ]){
      const x=ledger.retrieve(query(22,{...valid,...invalid}));
      expect(x.hits).toEqual([]);
      expect(x.envelope.evidence).toEqual([]);
    }
  });
  it('handles expired effective periods without returning old facts',()=>{
    const ledger=new MemorySourceRevisionLedger();add(ledger,{validUntil:T(22)});
    expect(ledger.retrieve(query(22)).envelope.retrievalState).toBe('STALE');
    expect(ledger.retrieve(query(21)).envelope.retrievalState).toBe('READY');
  });
  it('treats empty permission grants and empty/oversized queries as no evidence',()=>{
    const ledger=new MemorySourceRevisionLedger();add(ledger);
    expect(ledger.retrieve(query(22,{permissionRefs:new Set()})).hits).toHaveLength(0);
    expect(ledger.retrieve(query(22,{query:'  '})).envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(ledger.retrieve(query(22,{query:'ab'.repeat(130)})).hits).toHaveLength(0);
    expect(()=>ledger.retrieve(query(22,{topK:13}))).toThrow();
  });
  it('preserves immutable copies even when caller modifies original inputs',()=>{
    const ledger=new MemorySourceRevisionLedger(),value=item();
    ledger.add(value);
    value.paragraphs[0]!.text='tampered';
    const latest=ledger.latest(sourceId)!;
    expect(latest.paragraphs[0]!.text).toContain('11월 2일');
    latest.paragraphs[0]!.text='tampered twice';
    expect(ledger.latest(sourceId)!.paragraphs[0]!.text).toContain('11월 2일');
  });
  it('emits version-dependent invalidations across retrieval/claim/feed/notice/AI cache',()=>{
    const ledger=new MemorySourceRevisionLedger();add(ledger);
    add(ledger,{date:25,revisionId:'rev2',supersedes:'rev1',
      changeKind:'CANCELLED',status:'RETRACTED',
      text:'기존 지원 공고 취소'});
    const history=ledger.invalidations();
    expect(history).toHaveLength(1);
    expect(history[0]?.reason).toBe('CANCELLED');
    expect(history[0]?.invalidates).toEqual([
      'RETRIEVAL','CLAIMS','FEED','NOTICES','AI_CACHE',
    ]);
  });
});
