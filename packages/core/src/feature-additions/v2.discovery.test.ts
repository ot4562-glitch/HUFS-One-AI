import {describe,expect,it} from 'vitest';
import {catalogFilterKey,searchApprovedCatalogV2} from './catalog-v2.js';
import {evaluatePublishedStat,comparePublishedStats,validateEmploymentStatements}
  from './employment-v2.js';
import {FIXED_NOW,source,opportunity,query,stat} from './v2.fixtures.js';

describe('#348 — permission-filtered full catalog search and cursor stability',()=>{

  it('hides expired opportunities by default and permits explicit archive browsing',()=>{
    const items=[opportunity('expired',{deadlineAt:'2026-11-01T12:00:00+09:00'}),
      opportunity('open',{deadlineAt:'2026-11-20T12:00:00+09:00'})];
    const normal=searchApprovedCatalogV2({items,query:query({sort:'DEADLINE_ASC'}),...opts});
    expect(normal.items.map(x=>x.id)).toEqual(['open']);
    const archive=searchApprovedCatalogV2({items,
      query:query({sort:'DEADLINE_ASC',includeClosed:true}),...opts});
    expect(archive.items.map(x=>x.id)).toEqual(['expired','open']);
    expect(catalogFilterKey(query({includeClosed:true})))
      .not.toEqual(catalogFilterKey(query()));
  });

  const opts={scopeKey:'owner-a-consent-v1',catalogRevision:'catalog-r1'};
  const snapshot=Array.from({length:121},(_,i)=>opportunity(String(i).padStart(4,'0'),
    {title:i===120?'Rare astronomy internship':'Common economics internship',
      publishedAt:'2026-11-01T00:00:00+09:00'}));
  it('finds a result outside the first page without fabricating entire-internet coverage',()=>{
    const result=searchApprovedCatalogV2({items:snapshot,query:query({q:'astronomy',pageSize:20}),...opts});
    expect(result.items.map(x=>x.id)).toEqual(['0120']);
    expect(result.scope).toBe('PERMITTED_APPROVED_SNAPSHOT');
    expect(result.totalInAuthorizedScope).toBe(1);
  });
  it('paginates every authorized result exactly once',()=>{
    const seen:string[]=[];
    let cursor:ReturnType<typeof searchApprovedCatalogV2>['nextCursor']=null;
    for(let i=0;i<10;i++) {
      const r=searchApprovedCatalogV2({items:snapshot,query:query({pageSize:17}),...opts,
        ...(cursor?{cursor}:{})});
      seen.push(...r.items.map(x=>x.id));
      cursor=r.nextCursor;
      if(!r.hasMore) break;
    }
    expect(seen).toHaveLength(121);
    expect(new Set(seen).size).toBe(121);
  });
  it('rejects mixing a cursor across scopes, filters or source heads',()=>{
    const r=searchApprovedCatalogV2({items:snapshot,query:query({pageSize:2}),...opts});
    const cursor=r.nextCursor!;
    expect(()=>searchApprovedCatalogV2({items:snapshot,query:query({pageSize:2}),
      ...opts,scopeKey:'another-student',cursor})).toThrow('STALE_CURSOR');
    expect(()=>searchApprovedCatalogV2({items:snapshot,query:query({pageSize:2}),
      ...opts,catalogRevision:'catalog-r2',cursor})).toThrow('STALE_CURSOR');
    expect(()=>searchApprovedCatalogV2({items:snapshot,query:query({pageSize:2,q:'new'}),
      ...opts,cursor})).toThrow('STALE_CURSOR');
  });
  it('rejects tampered last sort value or removed cursor record',()=>{
    const r=searchApprovedCatalogV2({items:snapshot,query:query({pageSize:3}),...opts});
    expect(()=>searchApprovedCatalogV2({items:snapshot,query:query({pageSize:3}),...opts,
      cursor:{...r.nextCursor!,lastSortValue:'tampered'}})).toThrow('STALE_CURSOR');
    expect(()=>searchApprovedCatalogV2({items:snapshot.slice(3),query:query({pageSize:3}),...opts,
      cursor:r.nextCursor!})).toThrow('STALE_CURSOR');
  });
  it('never includes other student records or unverified sources',()=>{
    const result=searchApprovedCatalogV2({items:[
      opportunity('ok'),
      opportunity('unauthorized',{permitted:false}),
      opportunity('revoked',{source:{...source(),status:'REVOKED'}}),
      opportunity('unlicensed',{source:{...source(),rights:'UNKNOWN'}}),
    ],query:query(),...opts});
    expect(result.items.map(x=>x.id)).toEqual(['ok']);
  });
  it('filters future publication dates against the query asOf',()=>{
    const result=searchApprovedCatalogV2({items:[
      opportunity('present',{publishedAt:'2026-11-01T00:00:00+09:00'}),
      opportunity('future',{publishedAt:'2026-12-01T00:00:00+09:00'}),
    ],query:query(),...opts});
    expect(result.items.map(x=>x.id)).toEqual(['present']);
  });
  it('filters campus, category, eligibility and due-before together',()=>{
    const records=[
      opportunity('eligible',{eligibility:'MET',deadlineAt:'2026-11-15T12:00:00+09:00'}),
      opportunity('review',{eligibility:'UNKNOWN',deadlineAt:'2026-11-15T12:00:00+09:00'}),
      opportunity('late',{eligibility:'MET',deadlineAt:'2026-12-15T12:00:00+09:00'}),
      opportunity('another-campus',{campus:'GLOBAL',eligibility:'MET',
        deadlineAt:'2026-11-15T12:00:00+09:00'}),
    ];
    const r=searchApprovedCatalogV2({items:records,query:query({
      campus:'SEOUL',category:'INTERNSHIP',eligibility:'MET',
      deadlineBefore:'2026-11-30T00:00:00+09:00'}),...opts});
    expect(r.items.map(x=>x.id)).toEqual(['eligible']);
  });
  it('does not search a phrase from one item as if it belonged to another',()=>{
    const r=searchApprovedCatalogV2({items:[
      opportunity('a',{title:'Physics conference',summary:'Robotics',topicCodes:[]}),
      opportunity('b',{title:'Computer internship',summary:'Data engineering',topicCodes:[]}),
    ],query:query({q:'physics data'}),...opts});
    expect(r.items).toEqual([]);
  });
  it('normalizes Korean/English query case and whitespace',()=>{
    const r=searchApprovedCatalogV2({items:[
      opportunity('a',{title:'경제 DATA 분석 프로젝트'}),
    ],query:query({q:'  경제   data  '}),...opts});
    expect(r.items.map(x=>x.id)).toEqual(['a']);
  });
  it('fails closed for duplicate IDs instead of choosing one silently',()=>{
    const r=searchApprovedCatalogV2({items:[
      opportunity('dup',{title:'first'}),
      opportunity('dup',{title:'second'}),
    ],query:query(),...opts});
    expect(r.items).toEqual([]);
  });
  it('sorts deadlines with unknown at the back',()=>{
    const r=searchApprovedCatalogV2({items:[
      opportunity('none'),opportunity('late',{deadlineAt:'2026-12-01T23:00:00+09:00'}),
      opportunity('soon',{deadlineAt:'2026-11-09T23:00:00+09:00'}),
    ],query:query({sort:'DEADLINE_ASC'}),...opts});
    expect(r.items.map(x=>x.id)).toEqual(['soon','late','none']);
  });
  it('sorts publication dates descending, including unknown at the back',()=>{
    const r=searchApprovedCatalogV2({items:[
      opportunity('unknown'),
      opportunity('old',{publishedAt:'2026-01-01T12:00:00+09:00'}),
      opportunity('new',{publishedAt:'2026-11-01T12:00:00+09:00'}),
    ],query:query({sort:'PUBLISHED_DESC'}),...opts});
    expect(r.items.map(x=>x.id)).toEqual(['new','old','unknown']);
  });
  it('caps page sizes and queries before enumeration',()=>{
    expect(()=>searchApprovedCatalogV2({items:snapshot,query:query({pageSize:500}),
      ...opts})).toThrow('INVALID_SEARCH_CONTEXT');
    expect(()=>searchApprovedCatalogV2({items:snapshot,query:query({
      q:'a b c d e f g h i'}),...opts})).toThrow('UNBOUNDED_QUERY');
  });
  it('computes a stable filter fingerprint independent of whitespace trimming',()=>{
    expect(catalogFilterKey(query({q:' DATA '}))).toBe(catalogFilterKey(query({q:'data'})));
    expect(catalogFilterKey(query({q:'data',sort:'TITLE'})))
      .not.toBe(catalogFilterKey(query({q:'data',sort:'PUBLISHED_DESC'})));
  });
});
describe('#351 — safe public employment statistics and grounded explanation',()=>{
  it('calculates only verified, cleared public aggregate rates',()=>{
    const r=evaluatePublishedStat(stat(),FIXED_NOW);
    expect(r).toMatchObject({status:'PERCENT',numerator:60,denominator:100,percent:60});
  });
  it('does not confuse missing samples with a genuine zero',()=>{
    expect(evaluatePublishedStat(stat('missing',{numerator:undefined}),FIXED_NOW).status).toBe('NO_DATA');
    expect(evaluatePublishedStat(stat('zero',{numerator:0}),FIXED_NOW).status).toBe('SUPPRESSED');
  });
  it('publishes zero only if a separately verified publication rule explicitly allows it',()=>{
    const p={minimumPositiveCell:5,allowPublishedZero:true,aggregationAllowed:false};
    expect(evaluatePublishedStat(stat('zero',{numerator:0,publicationPolicy:p}),FIXED_NOW))
      .toMatchObject({status:'OBSERVED_ZERO',percent:0});
    expect(evaluatePublishedStat(stat('tiny',{numerator:0,denominator:2,
      publicationPolicy:p}),FIXED_NOW).status).toBe('SUPPRESSED');
  });
  it('suppresses both small positive and complementary cells',()=>{
    expect(evaluatePublishedStat(stat('one',{numerator:1}),FIXED_NOW).status).toBe('SUPPRESSED');
    expect(evaluatePublishedStat(stat('ninety-nine',{numerator:99}),FIXED_NOW).status)
      .toBe('SUPPRESSED');
  });
  it('rejects denominator zero, negative-like, and numerators greater than respondents',()=>{
    expect(evaluatePublishedStat(stat('invalid',{denominator:0}),FIXED_NOW).status).toBe('INVALID');
    expect(evaluatePublishedStat(stat('invalid',{numerator:101}),FIXED_NOW).status).toBe('INVALID');
  });
  it('marks use rights revoked or unapproved as unverifiable',()=>{
    expect(evaluatePublishedStat(stat('blocked',{source:{...source(),rights:'BLOCKED'}}),
      FIXED_NOW).status).toBe('UNVERIFIED');
    expect(evaluatePublishedStat(stat('denied',{publicApproved:false}),FIXED_NOW).status).toBe('UNVERIFIED');
  });
  it('does not compare dissimilar metrics/populations/years',()=>{
    const r=comparePublishedStats([stat('a'),stat('b',{year:2025})],FIXED_NOW);
    expect(r).toMatchObject({comparable:false,reason:'DIFFERENT_DEFINITION'});
    const p=comparePublishedStats([stat('a'),stat('b',{populationId:'other'})],FIXED_NOW);
    expect(p.reason).toBe('DIFFERENT_DEFINITION');
  });
  it('does not conflate different sources into the same result',()=>{
    const r=comparePublishedStats([
      stat('a'),stat('b',{source:{...source(),sourceId:'different-source'}})],FIXED_NOW);
    expect(r.reason).toBe('DIFFERENT_SOURCE');
  });
  it('does not compare suppressed cells against publishable cells',()=>{
    const r=comparePublishedStats([stat('a'),stat('b',{numerator:1})],FIXED_NOW);
    expect(r.reason).toBe('UNPUBLISHABLE');
  });
  it('returns a guarded comparator for valid same-series aggregate groups',()=>{
    const r=comparePublishedStats([
      stat('group-1'),stat('group-2',{groupId:'department-2',numerator:70})],FIXED_NOW);
    expect(r.comparable).toBe(true);
    expect(r.reason).toBe('COMPATIBLE');
  });
  it('accepts a statement only if every number matches an approved published row',()=>{
    const r=validateEmploymentStatements([stat()],[{
      id:'statement-1',statId:'statistics-1',year:2026,
      numerator:60,denominator:100,percentage:60}],FIXED_NOW);
    expect(r[0]?.outcome).toBe('ACCEPTED');
    expect(r[0]?.safeText).toContain('60.00% (60/100)');
  });
  it('denies fabricated statistics and altered denominators or years',()=>{
    const original={id:'s',statId:'statistics-1',year:2026,
      numerator:60,denominator:100,percentage:60};
    const r=validateEmploymentStatements([stat()],[
      {...original,id:'unknown',statId:'fabricated'},
      {...original,id:'changed',denominator:200},
      {...original,id:'future',year:2027},
      {...original,id:'numeric',percentage:90},
    ],FIXED_NOW);
    expect(r.every(x=>x.outcome==='REJECTED')).toBe(true);
  });
  it('does not leak suppressed statistics via generated explanations',()=>{
    const r=validateEmploymentStatements([stat('hidden',{numerator:1})],[{
      id:'attempt',statId:'hidden',year:2026,numerator:1,denominator:100,percentage:1,
    }],FIXED_NOW);
    expect(r[0]).toEqual({statementId:'attempt',outcome:'REJECTED',reason:'SOURCE_NOT_PUBLISHABLE'});
  });
  it('rejects duplicate statement IDs rather than silently overwriting them',()=>{
    const claim={id:'duplicate',statId:'statistics-1',year:2026,
      numerator:60,denominator:100,percentage:60};
    const r=validateEmploymentStatements([stat()],[claim,claim],FIXED_NOW);
    expect(r[0]?.outcome).toBe('ACCEPTED');
    expect(r[1]?.reason).toBe('DUPLICATE_STATEMENT');
  });
});
