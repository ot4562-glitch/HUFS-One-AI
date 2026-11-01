import {afterEach,describe,expect,it} from 'vitest';
import {PostgresSourceRevisionHistory} from
  '../../apps/api/src/modules/opportunities/source-history-postgres.js';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const now='2026-10-31T00:00:00.000Z';
const actor={
  role:'BETA' as const,actorId:'SYNTHETIC-ACTOR',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-11-01T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-01T00:00:00.000Z',
};
const row=(id:string,changeKind='NEW',status='ACTIVE')=>({
  revision_id:id,source_id:'source-1',supersedes:id==='rev2'?'rev1':null,
  permission_ref:'P-1',status,change_kind:changeKind,media_kind:'HTML',
  source_class:'SYNTHETIC',provenance:'SYNTHETIC',content_sha256:'a'.repeat(64),
  fetched_at:new Date('2026-10-20T00:00:00Z'),
  last_checked_at:new Date('2026-10-20T00:00:00Z'),
  published_at:null,last_verified_at:null,
  scope_campuses:null as string[]|null,scope_majors:null,scope_colleges:null,scope_major_roles:null,
  scope_admission_types:null,scope_enrollment_states:null,scope_graduation_terms:null,
  cohort_min:null,cohort_max:null,
});
function fixture(){
  let active=true,head='rev2',revisionRows=[row('rev2','CORRECTED','NEEDS_REVIEW'),row('rev1')];
  let changingRights=false,policyChecks=0,dbReads=0;
  const pool:ReviewerSqlPool={connect:async()=>({
    query:async(sql)=>{dbReads++;
      if(sql.startsWith('SELECT revision_id FROM source_ingest_heads'))
        return {rows:[{revision_id:head}]};
      if(sql.includes('FROM source_revisions_vnext'))return {rows:revisionRows};
      return {rows:[]};
    },release:()=>{},
  })};
  const rights={resolveFor:async()=>{
    policyChecks++;
    return {
      policyVersion:'v1',sourceHeadVersion:head,sourceIds:new Set(['source-1']),
      permissionRefs:new Set(changingRights&&policyChecks>1?[]:['P-1']),
      campus:'SEOUL',
    };
  }};
  const service=new PostgresSourceRevisionHistory(pool,rights);
  return {service,pool,rights,
    setHead:(v:string)=>{head=v;},
    setRows:(rows:ReturnType<typeof row>[])=>{revisionRows=rows;},
    revokeDuringRead:()=>{changingRights=true;},
    setActive:(v:boolean)=>{active=v;},
    verify:async()=>active?actor:null,
    reads:()=>dbReads,
  };
}
describe('TASK-19 permission-scoped current SourceRevision metadata API (synthetic)',()=>{
  const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
  afterEach(async()=>{await Promise.all(apps.map(a=>a.close()));apps.length=0;});
  it('shows only authorized metadata, with the newest unapproved revision as head',async()=>{
    const h=fixture(),value=await h.service.read({actor,sourceId:'source-1',now});
    expect(value).toMatchObject({sourceId:'source-1',currentRevisionId:'rev2',
      permissionPolicyVersion:'v1',revisions:[
        {revisionId:'rev2',status:'NEEDS_REVIEW',changeKind:'CORRECTED'},
        {revisionId:'rev1',status:'ACTIVE'},
      ]});
    expect(JSON.stringify(value)).not.toContain('paragraph_text');
    expect(JSON.stringify(value)).not.toContain('permission_ref');
  });
  it('does not resurrect an older authorized head when latest head is out of scope',async()=>{
    const h=fixture(),restricted={...row('rev2','CORRECTED','NEEDS_REVIEW'),scope_campuses:['GLOBAL']};
    h.setRows([restricted,row('rev1')]);
    expect(await h.service.read({actor,sourceId:'source-1',now})).toBeNull();
  });
  it('removes old versions for which the actor has no permission',async()=>{
    const h=fixture();
    h.setRows([row('rev2','CORRECTED','NEEDS_REVIEW'),{...row('rev1'),permission_ref:'ANOTHER'}]);
    const value=await h.service.read({actor,sourceId:'source-1',now});
    expect(value?.revisions).toHaveLength(1);
    expect(value?.revisions[0]).not.toHaveProperty('supersedes');
  });
  it('denies stale or changed authorizations after the DB transaction',async()=>{
    const h=fixture();h.revokeDuringRead();
    expect(await h.service.read({actor,sourceId:'source-1',now})).toBeNull();
  });
  it('never accepts mismatched current head or oversized history',async()=>{
    const h=fixture();h.setHead('rev3');
    expect(await h.service.read({actor,sourceId:'source-1',now})).toBeNull();
    const j=fixture();j.setRows(Array.from({length:51},(_,i)=>row('rev'+(i+1))));
    await expect(j.service.read({actor,sourceId:'source-1',now})).rejects.toThrow('Source metadata unavailable');
  });
  it('denies a missing or other source before reading any DB row',async()=>{
    const h=fixture();
    expect(await h.service.read({actor,sourceId:'other',now})).toBeNull();
    expect(h.reads()).toBe(0);
  });
  it('registers an explicitly injected no-store authenticated route only in central integration',async()=>{
    const h=fixture();
    const app=createIntegratedApi({
      allowedOrigin:'https://synthetic.invalid',repository:new MemoryApiRepository({profiles:[]}),
      auth:{verifySession:h.verify,revokeSession:async()=>{}},now:()=>now,sourceHistory:h.service,
    });apps.push(app);
    const path='/api/evidence/sources/source-1/revisions';
    expect(app.hasRoute({method:'GET',url:'/api/evidence/sources/:sourceId/revisions'})).toBe(true);
    const response=await app.inject({url:path});
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().currentRevisionId).toBe('rev2');
    expect((await app.inject({url:path+'?permissionRef=P-1'})).statusCode).toBe(422);
    h.setActive(false);
    expect((await app.inject({url:path})).statusCode).toBe(401);
  });
});
