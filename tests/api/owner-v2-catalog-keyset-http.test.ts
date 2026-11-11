import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {PostgresOwnerV2StableKeysetSource}
  from '../../apps/api/src/modules/owner-v2-catalog-keyset-source-postgres.js';
import {canonicalProjectionHash} from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import type {PostgresApprovedOwnerReader,ApprovedOwnerProjection}
  from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import type {ReviewerSqlConnection}
  from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import {createCatalogCursorSigner}
  from '../../packages/core/src/feature-additions/server-cursor.js';
import {searchApprovedCatalogV2}
  from '../../packages/core/src/feature-additions/catalog-v2.js';
import {opportunity,query,FIXED_NOW} from '../../packages/core/src/feature-additions/v2.fixtures.js';
import type {FeatureAdditions as C} from '@hufs-one/contracts';

const ACTOR='SYN-OWNER-1',URL='https://example.org/notices/list';
const ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:ACTOR,sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
const signer=createCatalogCursorSigner({activeKeyId:'synthetic-key',
  keys:new Map([['synthetic-key',new Uint8Array(32).fill(13)]]),
  ttlMs:60_000});
type ReadPage=NonNullable<Parameters<PostgresApprovedOwnerReader['readV2KeysetPage']>[2]>;
function fixture(count=1250){
  let version='SYN-HEAD-1',consentVersion='SYN-CONSENT-1';
  let revoked=false,canonicalUrl=URL,wrongScope=false,flipDuringRecheck=false;
  let reads=0;
  const items=Array.from({length:count},(_,i)=>opportunity(
    'SYN-OP-'+String(i).padStart(5,'0'),{
      title:(i%4===0?'경제 분석':i%4===1?'가상 지원':'Economics research')+' '+i,
      category:i%2===0?'INTERNSHIP':'SCHOLARSHIP',
      campus:i%3===0?'GLOBAL':'SEOUL',
      publishedAt:'2026-11-01T00:00:00+09:00',
      deadlineAt:i%9===0?'2026-11-06T23:59:00+09:00':'2026-12-01T23:59:00+09:00',
      sourceUrl:URL,
    }));
  const ref={sourceId:'fictional-source',revisionId:'source-r1',permissionRef:'SYN-PERM'};
  const rows=()=>items.map((item,i):ApprovedOwnerProjection=>({
    projection_id:'SYN-P-'+String(i).padStart(5,'0'),
    actor_id:ACTOR,kind:'V2_CATALOG',entity_id:item.id,
    version:'SYN-V1',payload_json:item,
    payload_sha256:canonicalProjectionHash(item),sources_json:[ref],
    reviewed_by:'SYN-INDEPENDENT',reviewed_at:'2026-11-01T00:00:00Z',
    as_of:'2026-11-01T00:00:00Z',starts_at:'2026-11-01T00:00:00Z',
    expires_at:'2026-12-01T00:00:00Z',
  }));
  const sql=vi.fn(async(text:string,_params?:readonly unknown[])=>{
    expect(text).toContain('source_rights_receipts');
    expect(text).toContain('source_rights_revocations');
    expect(text).toContain("'SEARCH'=ANY(r.purposes)");
    if(revoked)return {rows:[]};
    return {rows:[{source_id:ref.sourceId,permission_ref:ref.permissionRef,
      canonical_url:canonicalUrl}]};
  });
  const connection={query:sql,release:()=>{}} as unknown as ReviewerSqlConnection;
  const readV2KeysetPage=vi.fn(async(input:{
    actorId:string;asOf:string;pageSize:number;afterEntityId?:string;
  },now:string,extra?:ReadPage)=>{
    expect(input.actorId).toBe(ACTOR);expect(input.pageSize).toBe(50);
    expect(now).toBe(FIXED_NOW);
    if(revoked)return null;
    const sourceRows=rows(),start=input.afterEntityId?
      sourceRows.findIndex(row=>row.entity_id===input.afterEntityId)+1:0;
    if(start<0||input.afterEntityId&&start===0)
      throw new Error('INVALID_SQL_KEYSET_ANCHOR');
    const window=sourceRows.slice(start,start+50);
    const hasMore=start+window.length<sourceRows.length;
    const proof=extra?await extra(connection,window):undefined;
    reads++;
    if(flipDuringRecheck&&reads===Math.ceil(count/50)+1)version='SYN-HEAD-2';
    return {rows:wrongScope?window.map(row=>({...row,actor_id:'SYN-OTHER'})):window,
      fingerprint:canonicalProjectionHash({kind:'V2_PAGE',input,
        rows:window,proof,version,consentVersion}),
      consentVersion,validUntil:'2026-12-01T00:00:00Z',hasMore,
      nextAfterEntityId:hasMore?window.at(-1)!.entity_id:null,extra:proof};
  });
  const reader={readV2KeysetPage} as unknown as PostgresApprovedOwnerReader;
  const source=new PostgresOwnerV2StableKeysetSource(reader,()=>FIXED_NOW);
  return {items,source,readV2KeysetPage,sql,
    revoke:()=>{revoked=true;},
    changeHead:()=>{version='SYN-HEAD-2';},
    changeConsent:()=>{consentVersion='SYN-CONSENT-2';},
    changeCanonical:()=>{canonicalUrl='https://example.org/notices/other';},
    wrongActor:()=>{wrongScope=true;},
    changeDuringRecheck:()=>{flipDuringRecheck=true;},
    calls:()=>reads,
  };
}
function setup(count=1250){
  const f=fixture(count),quota={consume:vi.fn(async()=>true)};
  const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,
    now:()=>FIXED_NOW,auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
    ownerV2Catalog:{source:f.source,signer,quota}});
  apps.push(app);
  const get=(suffix:string)=>app.inject({url:'/api/owner/features/v2/catalog?'+suffix});
  return {...f,app,get,quota};
}
const params=(sort='TITLE',includeClosed=true)=>'sort='+sort+'&pageSize=25&asOf='
  +encodeURIComponent(FIXED_NOW)+'&includeClosed='+includeClosed;
const next=(page:{at:string;nextCursor:string|null},sort='TITLE',includeClosed=true)=>
  params(sort,includeClosed)+'&cursor='+encodeURIComponent(page.nextCursor!);

describe('#447 real PostgreSQL keyset-compatible HTTP bridge (synthetic input)',()=>{
  it('globally pins 1,250 rows across multiple signed pages and counts by core filters',async()=>{
    const f=setup();
    const first=await f.get(params());
    expect(first.statusCode).toBe(200);
    const payload=first.json();
    expect(payload.state).toBe('READY');
    expect(payload.page.totalInAuthorizedScope).toBe(1250);
    expect(payload.page.items).toHaveLength(25);
    expect(payload.page.hasMore).toBe(true);
    expect(payload.sourceVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(f.calls()).toBe(50); // 25 DB pages + 25 fresh proof pages
    const expected=searchApprovedCatalogV2({
      items:f.items,query:query({sort:'TITLE',pageSize:25,asOf:FIXED_NOW,includeClosed:true}),
      scopeKey:'SYN-SCOPE',catalogRevision:'SYN-REV',
    });
    expect(payload.page.items.map((x:{id:string})=>x.id))
      .toEqual(expected.items.map(x=>x.id));
    const second=await f.get(next(payload.page));
    expect(second.statusCode).toBe(200);
    expect(second.json().page.items.map((x:{id:string})=>x.id))
      .toEqual(searchApprovedCatalogV2({
        items:f.items,query:query({
          sort:'TITLE',pageSize:50,asOf:FIXED_NOW,includeClosed:true,
        }),scopeKey:'SYN-SCOPE',catalogRevision:'SYN-REV',
      }).items.slice(25,50).map(x=>x.id));
    expect(second.json().sourceVersion).toBe(payload.sourceVersion);
    expect(second.json().page.totalInAuthorizedScope).toBe(1250);
    expect(f.calls()).toBe(100);
    expect(f.quota.consume).toHaveBeenCalledTimes(2);
  });

  for(const sort of ['TITLE','DEADLINE_ASC','PUBLISHED_DESC'] as const){
    it('preserves exact Korean/UTC comparator and filtered count for '+sort,async()=>{
      const f=setup(377);
      const filters='&category=SCHOLARSHIP&campus=SEOUL&q='+encodeURIComponent('가상');
      const res=await f.get(params(sort,false)+filters);
      expect(res.statusCode).toBe(200);
      const current=query({sort,pageSize:25,asOf:FIXED_NOW,
        category:'SCHOLARSHIP',campus:'SEOUL',includeClosed:false,q:'가상'});
      const reference=searchApprovedCatalogV2({
        items:f.items,query:current,scopeKey:'SYN',catalogRevision:'SYN',
      });
      expect(res.json().page.totalInAuthorizedScope)
        .toBe(reference.totalInAuthorizedScope);
      expect(res.json().page.items.map((x:{id:string})=>x.id))
        .toEqual(reference.items.map(x=>x.id));
      expect(res.json().page.scope).toBe('PERMITTED_APPROVED_SNAPSHOT');
      if(res.json().page.nextCursor){
        const continuation=await f.get(next(res.json().page,sort,false)+filters);
        expect(continuation.statusCode).toBe(200);
      }
    });
  }

  it('rejects any filter/consent/head/canonical change instead of returning stale page',async()=>{
    const f=setup(150);
    const first=(await f.get(params())).json().page;
    f.changeHead();
    const stale=await f.get(next(first));
    expect(stale.statusCode).toBe(409);
    expect(stale.body).not.toContain('Economics research');
    f.changeConsent();
    expect((await f.get(next(first))).statusCode).toBe(409);
    f.changeCanonical();
    expect((await f.get(next(first))).statusCode).toBe(503);
    expect((await f.get(next(first)+'&category=INTERNSHIP')).statusCode)
      .not.toBe(200);
  });

  it('fails closed after source revocation during read-to-response recheck',async()=>{
    const f=fixture(125);
    const wrapped={read:async(input:{actorId:string;asOf:string})=>{
      const result=await f.source.read(input);f.revoke();return result;
    },revalidate:(x:Parameters<typeof f.source.revalidate>[0])=>f.source.revalidate(x)};
    const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,
      now:()=>FIXED_NOW,auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
      ownerV2Catalog:{source:wrapped,signer,quota:{consume:async()=>true}}});
    apps.push(app);
    const result=await app.inject({url:'/api/owner/features/v2/catalog?'+params()});
    expect(result.statusCode).toBe(403);
    expect(result.body).not.toContain('SYN-OP-00001');
  });

  it('denies >5,000 rows rather than leaking partial totals',async()=>{
    const f=setup(5001);
    const response=await f.get(params());
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('PROVIDER_UNAVAILABLE');
    expect(response.body).not.toContain('totalInAuthorizedScope');
  });

  it('denies a changing epoch during the second full authorization sweep',async()=>{
    const f=setup(125);
    f.changeDuringRecheck();
    const response=await f.get(params());
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain('SYN-OP-00001');
  });

  it('rejects cross-actor projection rows despite otherwise valid signatures',async()=>{
    const f=setup(125);f.wrongActor();
    const response=await f.get(params());
    expect(response.statusCode).toBe(503);
  });
});
