import {createHash} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {createPostgresSourceBrowserResources} from '../../apps/api/src/modules/opportunities/source-browser-resources.js';
const now='2026-11-11T00:00:00Z',bytes=Buffer.from('window.synthetic=true;');
const sha=createHash('sha256').update(bytes).digest('hex');
const registration={sourceId:'SYN-SCRIPT',permissionRef:'SYN-PERM',canonicalUrl:'https://synthetic.example.edu/app.js',
  kind:'SCRIPT' as const,contentType:'text/javascript; charset=utf-8'};
function fixture(patch:Record<string,unknown>={}){
  const row={source_id:registration.sourceId,permission_ref:registration.permissionRef,revision_id:'SYN-REV',
    original_sha256:sha,original_bytes:bytes,fetched_at:'2026-11-10T00:00:00Z',status:'NEEDS_REVIEW',change_kind:'NEW',
    head_revision_id:'SYN-REV',receipt_id:'SYN-RIGHT',actor_id:'SYN-OPERATOR',reviewed_by:'SYN-INDEPENDENT',
    canonical_url:registration.canonicalUrl,purposes:['COLLECT','STORE','SEARCH'],policy_version:'SYN-v1',
    reviewed_at:'2026-11-09T00:00:00Z',starts_at:'2026-11-09T00:00:00Z',expires_at:'2026-11-12T00:00:00Z',
    revoked_at:null,database_now:now,...patch};
  const query=vi.fn(async(_sql:string,_params?:readonly unknown[])=>({rows:[row]})),release=vi.fn();
  const store=createPostgresSourceBrowserResources({pool:{connect:async()=>({query,release})},
    actorRef:'SYN-OPERATOR',registrations:[registration],now:()=>now});
  return {row,query,release,store};
}
describe('#445 immutable approved browser resource bytes',()=>{
  it('loads exact registered originals with the current actor receipt, snapshots and rechecks',async()=>{
    const x=fixture(),captured=await x.store.load({actorRef:'SYN-OPERATOR'});
    const {contentType,...binding}=registration;
    expect(captured.resources[0]).toMatchObject({bytes,contentType,manifest:binding});
    expect(captured.resources[0]!.manifest).toMatchObject({revisionId:'SYN-REV',rightsReceiptId:'SYN-RIGHT',originalSha256:sha});
    expect(x.query.mock.calls[0]![1]).toEqual(['SYN-OPERATOR',registration.sourceId,registration.permissionRef]);
    captured.resources[0]!.bytes.fill(0);
    await captured.revalidate();expect(x.query).toHaveBeenCalledTimes(2);expect(x.release).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['source',{source_id:'SYN-FOREIGN'}],['permission',{permission_ref:'SYN-FOREIGN'}],
    ['URL',{canonical_url:'https://synthetic.example.edu/other.js'}],['actor',{actor_id:'SYN-FOREIGN'}],
    ['self approval',{reviewed_by:'SYN-OPERATOR'}],['expired',{expires_at:now}],['DB clock expired',{database_now:'2026-11-13T00:00:00Z'}],
    ['future receipt',{reviewed_at:'2026-11-12T00:00:00Z'}],['revoked',{revoked_at:now}],
    ['missing SEARCH',{purposes:['COLLECT','STORE']}],['blocked',{status:'BLOCKED_RIGHTS'}],
    ['withdrawn',{change_kind:'WITHDRAWN'}],['old revision',{head_revision_id:'SYN-NEW'}],
    ['changed bytes',{original_bytes:Buffer.from('different')}],['future capture',{fetched_at:'2026-11-12T00:00:00Z'}],
  ])('refuses %s without disclosing captured bytes',async(_name,patch)=>{
    const x=fixture(patch);await expect(x.store.load({actorRef:'SYN-OPERATOR'})).rejects.toThrow('Approved browser resources unavailable');
    expect(x.release).toHaveBeenCalledOnce();
  });
  it('rejects an unrelated actor before SQL, and receipt/head changes during rendering',async()=>{
    const x=fixture();await expect(x.store.load({actorRef:'SYN-OTHER'})).rejects.toThrow();expect(x.query).not.toHaveBeenCalled();
    const captured=await x.store.load({actorRef:'SYN-OPERATOR'});x.row.receipt_id='SYN-NEW-RIGHT';
    await expect(captured.revalidate()).rejects.toThrow();
  });
  it('rejects duplicate URLs and media types outside the exact resource kind',()=>{
    const pool={connect:vi.fn()};
    for(const registrations of [[registration,registration],[{...registration,contentType:'text/html'}]])
      expect(()=>createPostgresSourceBrowserResources({pool,actorRef:'SYN-OPERATOR',registrations,now:()=>now})).toThrow();
  });
});
