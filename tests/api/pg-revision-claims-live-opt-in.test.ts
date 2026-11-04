/** Synthetic-only real PG proof. Explicit opt-in and exact disposable DB name;
 * refuses existing data/role, never resets, drops or overwrites any resource. */
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PostgresApprovedRevisionClaims} from '../../apps/api/src/modules/opportunities/approved-revision-claims-postgres.js';
import {canonicalProjectionHash} from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import {compareOpportunityRevisions} from '../../apps/api/src/modules/opportunities/opportunity-revision-comparison.js';
import {hashRevisionParagraphs} from '../../apps/api/src/modules/opportunities/revision-ledger.js';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const RUN=process.env.HUFS_PG_REVISION_CLAIMS_LIVE==='1',pools:Pool[]=[];
const role='hufs_test_revision_claims',password=randomBytes(24).toString('hex');
let admin:Pool,reader:Pool;
const pool=(url:URL)=>{const p=new Pool({connectionString:url.toString(),ssl:false,max:3,
  connectionTimeoutMillis:3000,statement_timeout:5000});pools.push(p);return p;};
const adapter=(p:Pool):ReviewerSqlPool=>({connect:async()=>{const c=await p.connect();return {
  query:async(sql,params=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release()};}});
const now=()=>new Date().toISOString();

describe.skipIf(!RUN)('REAL PostgreSQL: independently approved source revision claims',()=>{
  beforeAll(async()=>{
    const raw=process.env.HUFS_PG_REVISION_CLAIMS_URL;if(!raw)throw new Error('Explicit isolated PostgreSQL URL required');
    const url=new URL(raw);
    if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='15439'
      ||url.pathname!=='/hufs_one_revision_claims_test'||url.username!=='hufs_local_admin'||url.search||url.hash)
      throw new Error('Refusing non-owned/non-loopback/non-revision test database');
    const bootstrap=new URL(url);bootstrap.pathname='/postgres';const control=pool(bootstrap);
    const info=await control.query("SELECT current_user AS who,current_setting('server_version_num')::int AS version,host(inet_server_addr()) AS host,inet_server_port() AS port");
    if(info.rows[0]?.who!=='hufs_local_admin'||info.rows[0]?.version<180000||info.rows[0]?.host!=='127.0.0.1'||info.rows[0]?.port!==15439)
      throw new Error('Owned PostgreSQL 18 target not established');
    if(!(await control.query("SELECT 1 FROM pg_database WHERE datname='hufs_one_revision_claims_test'")).rows.length)
      await control.query('CREATE DATABASE hufs_one_revision_claims_test');
    admin=pool(url);
    const objects=await admin.query("SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace)+(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace) AS n");
    if(Number(objects.rows[0]?.n)!==0)throw new Error('Preserve nonempty revision test database; no reset authorized');
    if((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rows.length)throw new Error('Preserve existing revision test role');
    for(const name of ['20261031_temporal_evidence.sql','20261101_source_review.sql','20261105_source_image_evidence.sql','20261105_source_pdf_evidence.sql',
      '20261101_verified_source_rights.sql','20261101_self_account.sql','20261103_approved_revision_claims.sql'])
      await admin.query(readFileSync(new URL('../../infra/sql/'+name,import.meta.url),'utf8'));
    await admin.query(`CREATE ROLE hufs_test_revision_claims LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO hufs_test_revision_claims;
      GRANT SELECT ON api_self_consents,source_effective_revisions_vnext,source_revisions_vnext,source_ingest_heads,
        source_review_attestations_vnext,source_paragraphs_vnext,source_rights_receipts,source_rights_revocations,
        source_conflict_decisions_vnext,api_opportunity_revision_claim_approvals,api_opportunity_revision_claim_revocations,
        api_reviewed_revision_image_evidence,api_revision_image_evidence_revocations TO hufs_test_revision_claims;
      GRANT SELECT(revision_id,original_sha256) ON source_originals_vnext TO hufs_test_revision_claims;`);
    const limited=new URL(url);limited.username=role;limited.password=password;reader=pool(limited);
  },30000);
  afterAll(async()=>{await Promise.all(pools.map(p=>p.end()));},10000);

  async function seed(suffix:string){
    const actorId='SYN-REVISION-'+suffix,opportunityId=actorId+'-OPP',sourceId=actorId+'-SOURCE',permissionRef=actorId+'-PERM';
    const captured=[new Date(Date.now()-120000).toISOString(),new Date(Date.now()-60000).toISOString()];
    const expires=new Date(Date.now()+3600000).toISOString(),ids=[actorId+'-R1',actorId+'-R2'];
    await admin.query('INSERT INTO api_self_consents(actor_id,version,choices_json,updated_at) VALUES($1,1,$2,$3)',
      [actorId,{personalStorage:true},captured[0]]);
    await admin.query(`INSERT INTO source_rights_receipts(receipt_id,actor_id,source_id,permission_ref,canonical_url,purposes,
      reviewed_by,reviewed_at,starts_at,expires_at,policy_version) VALUES($1,$2,$3,$4,'https://synthetic.invalid/revision',
      ARRAY['SEARCH'],'SYN-INDEPENDENT-RIGHTS',$5,$5,$6,'SYN-POLICY')`,[actorId+'-RIGHTS',actorId,sourceId,permissionRef,captured[0],expires]);
    for(let i=0;i<2;i++){
      const id=ids[i]!,at=captured[i]!,text=i?'마감 11월25일':'마감 11월20일',bytes=Buffer.from(text),original=createHash('sha256').update(bytes).digest('hex');
      const content=hashRevisionParagraphs([{id:'SYN-P',text}]);
      await admin.query(`INSERT INTO source_revisions_vnext(revision_id,source_id,supersedes,original_sha256,content_sha256,
        media_kind,source_class,permission_ref,provenance,status,change_kind,fetched_at,last_checked_at)
        VALUES($1,$2,$3,$4,$5,'TEXT','SYNTHETIC',$6,'SYNTHETIC','NEEDS_REVIEW',$7,$8,$8)`,
      [id,sourceId,i?ids[0]:null,original,content,permissionRef,i?'EXTENDED':'NEW',at]);
      await admin.query('INSERT INTO source_originals_vnext VALUES($1,$2,$3,$4)',[id,original,bytes,at]);
      await admin.query('INSERT INTO source_paragraphs_vnext(revision_id,paragraph_id,paragraph_text,paragraph_ordinal) VALUES($1,\'SYN-P\',$2,1)',[id,text]);
      await admin.query(`INSERT INTO source_review_attestations_vnext VALUES($1,$2,'SYN-INDEPENDENT-SOURCE','APPROVED',$3,$4,$5,'SYN-SOURCE-POLICY')`,[id+'-REVIEW',id,at,original,content]);
      const payload={claims:[{field:'DEADLINE',value:{kind:'FIXED',at:i?'2026-11-25T00:00:00Z':'2026-11-20T00:00:00Z'},evidenceRefs:['SYN-E']}],
        evidence:[{evidenceRef:'SYN-E',span:{kind:'TEXT',sourceRevisionId:id,paragraphId:'SYN-P',startCodePoint:0,endCodePoint:Array.from(text).length,quote:text}}]};
      await admin.query(`INSERT INTO api_opportunity_revision_claim_approvals(approval_id,actor_id,opportunity_id,source_id,revision_id,
        permission_ref,content_sha256,payload_json,payload_sha256,consent_version,reviewed_by,reviewed_at,starts_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'1','SYN-INDEPENDENT-CLAIMS',$10,$10,$11)`,
      [id+'-APPROVAL',actorId,opportunityId,sourceId,id,permissionRef,content,payload,canonicalProjectionHash(payload),at,expires]);
    }
    await admin.query('INSERT INTO source_ingest_heads(source_id,revision_id,fetched_at,last_checked_at) VALUES($1,$2,$3,$3)',[sourceId,ids[1],captured[1]]);
    const services=new PostgresApprovedRevisionClaims(adapter(reader),{resolve:async input=>input.actorId===actorId?
      {permissionRefs:new Set([permissionRef]),sourceIds:new Set([sourceId]),policyVersion:'SYN-INDEPENDENT-AUTHORITY'}:null});
    const input={actorId,opportunityId,beforeRevisionId:ids[0]!,afterRevisionId:ids[1]!,asOf:now(),now:now()};
    const compare=()=>compareOpportunityRevisions({actorId,opportunityId,request:{beforeRevisionId:ids[0]!,afterRevisionId:ids[1]!,asOf:input.asOf},source:services.source,rights:services.rights,now});
    return {input,services,compare,ids,actorId};
  }
  it('reads reviewed exact values through least-privilege RLS and refuses raw/write access',async()=>{
    const f=await seed('READY');expect(await f.compare()).toMatchObject({state:'READY',changes:[{field:'DEADLINE',kind:'EXTENDED'}]});
    expect((await reader.query('SELECT approval_id FROM api_opportunity_revision_claim_approvals')).rows).toHaveLength(0);
    await expect(reader.query('SELECT original_bytes FROM source_originals_vnext')).rejects.toMatchObject({code:'42501'});
    await expect(reader.query('UPDATE api_opportunity_revision_claim_approvals SET reviewed_by=reviewed_by')).rejects.toMatchObject({code:'42501'});
    await expect(admin.query('UPDATE api_opportunity_revision_claim_approvals SET reviewed_by=reviewed_by')).rejects.toThrow('immutable evidence history');
  });
  it('freshly invalidates an existing read after current consent withdrawal',async()=>{
    const f=await seed('CONSENT'),pair=await f.services.source.inspect(f.input) as {receipt:string};
    await admin.query('UPDATE api_self_consents SET version=version+1,choices_json=$2,updated_at=clock_timestamp() WHERE actor_id=$1',[f.actorId,{personalStorage:false}]);
    expect(await f.services.source.revalidate({...f.input,receipt:pair.receipt,now:now()})).toBe(false);
  });
  it('freshly invalidates exact field approval revocation',async()=>{
    const f=await seed('REVOKED'),pair=await f.services.source.inspect(f.input) as {receipt:string};
    await admin.query("INSERT INTO api_opportunity_revision_claim_revocations VALUES($1,clock_timestamp(),'SYN-OPERATOR','SYN-REVOKE')",[f.ids[1]+'-APPROVAL']);
    expect(await f.services.source.revalidate({...f.input,receipt:pair.receipt,now:now()})).toBe(false);
  });
  it('discovers the only current independently reviewed direct predecessor, without source bytes',async()=>{
    const f=await seed('DISCOVERY');
    const input={actorId:f.actorId,opportunityId:f.input.opportunityId,asOf:f.input.asOf,now:now()};
    expect(await f.services.context.find(input)).toEqual({
      opportunityId:input.opportunityId,asOf:input.asOf,available:true,
      beforeRevisionId:f.ids[0],afterRevisionId:f.ids[1],
    });
    expect(await f.services.context.find({...input,actorId:'SYN-ANOTHER'})).toBeNull();
  });
  it('removes discoverability when consent or exact second-field approval is revoked',async()=>{
    const a=await seed('DISCOVERY-CONSENT');
    const query={actorId:a.actorId,opportunityId:a.input.opportunityId,asOf:a.input.asOf,now:now()};
    expect((await a.services.context.find(query))?.available).toBe(true);
    await admin.query('UPDATE api_self_consents SET version=version+1,choices_json=$2,updated_at=clock_timestamp() WHERE actor_id=$1',
      [a.actorId,{personalStorage:false}]);
    expect(await a.services.context.find({...query,now:now()})).toBeNull();
    const b=await seed('DISCOVERY-CLAIM'),request={
      actorId:b.actorId,opportunityId:b.input.opportunityId,asOf:b.input.asOf,now:now(),
    };
    expect((await b.services.context.find(request))?.available).toBe(true);
    await admin.query("INSERT INTO api_opportunity_revision_claim_revocations VALUES($1,clock_timestamp(),'SYN-OPERATOR','SYN-REVOKE')",
      [b.ids[1]+'-APPROVAL']);
    expect(await b.services.context.find({...request,now:now()})).toEqual({
      opportunityId:request.opportunityId,asOf:request.asOf,available:false,
    });
  });

  it('runs browser GET discovery → approved POST comparison → real PG18, and denies mid-flow consent revocation',async()=>{
    const f=await seed('DISCOVERY-HTTP');
    const origin='https://synthetic.invalid',expires=new Date(Date.now()+3600000).toISOString();
    const actor={role:'BETA' as const,actorId:f.actorId,sessionIdHash:'S'.repeat(32),
      csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:expires,schoolMailProofExpiresAt:expires};
    let current:typeof actor|null=actor;
    const app=createIntegratedApi({allowedOrigin:origin,
      repository:new MemoryApiRepository({profiles:[]}),
      auth:{verifySession:async()=>current,revokeSession:async()=>{current=null;}},
      revisionComparison:{source:f.services.source,rights:f.services.rights,context:f.services.context},
      now});
    try{
      const browser=new HufsApiClient(async(url,init)=>{
        const headers:Record<string,string>={};
        new Headers(init.headers).forEach((value,key)=>{headers[key]=value;});
        const response=await app.inject({method:init.method??'GET',url,
          headers:{...headers,origin,cookie:'SYN-OWNER-E2E'},
          ...(init.body===undefined?{}:{payload:JSON.parse(String(init.body))})});
        return new Response(response.body,{status:response.statusCode,
          headers:{'content-type':'application/json'}});
      });
      const pair=await browser.owner.getRevisionComparisonContext(f.input.opportunityId,f.input.asOf);
      expect(pair).toEqual({opportunityId:f.input.opportunityId,asOf:f.input.asOf,available:true,
        beforeRevisionId:f.ids[0],afterRevisionId:f.ids[1]});
      if(!pair.available)throw Error('Only an approved pair may be compared');
      const comparison=await browser.owner.compareOpportunityRevisions(f.input.opportunityId,{
        asOf:pair.asOf,beforeRevisionId:pair.beforeRevisionId,afterRevisionId:pair.afterRevisionId,
      });
      expect(comparison).toMatchObject({state:'READY',changes:[{field:'DEADLINE',kind:'EXTENDED'}]});
      await admin.query('UPDATE api_self_consents SET version=version+1,choices_json=$2,updated_at=clock_timestamp() WHERE actor_id=$1',
        [f.actorId,{personalStorage:false}]);
      await expect(browser.owner.getRevisionComparisonContext(f.input.opportunityId,f.input.asOf))
        .rejects.toMatchObject({code:'FORBIDDEN'});
      await expect(browser.owner.compareOpportunityRevisions(f.input.opportunityId,{
        asOf:pair.asOf,beforeRevisionId:pair.beforeRevisionId,afterRevisionId:pair.afterRevisionId,
      })).rejects.toMatchObject({code:'FORBIDDEN'});
      current=null;
      await expect(browser.owner.getRevisionComparisonContext(f.input.opportunityId,f.input.asOf))
        .rejects.toMatchObject({code:'UNAUTHENTICATED'});
    }finally{await app.close();}
  });

});
