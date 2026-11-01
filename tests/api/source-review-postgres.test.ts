import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {PostgresSourceReviewService} from '../../apps/api/src/modules/opportunities/source-review-postgres.js';
import {hashRevisionParagraphs} from '../../apps/api/src/modules/opportunities/revision-ledger.js';
const now='2026-11-01T02:00:00.000Z',bytes=Buffer.from('synthetic original');
const paragraphs=[{id:'p1',text:'synthetic quote'}];
const originalSha256=createHash('sha256').update(bytes).digest('hex');
const contentSha256=hashRevisionParagraphs(paragraphs);
const request={reviewId:'review-1',actorRef:'reviewer-1',sourceId:'source-1',
  revisionId:'revision-1',permissionRef:'permission-1',originalSha256,contentSha256,
  decision:'APPROVED' as const};
function harness(options:{deny?:boolean;revoke?:boolean;stale?:boolean;tamper?:boolean;
  failOutbox?:boolean;existing?:boolean;tamperText?:boolean;missingOriginal?:boolean;
  dependent?:boolean;futureFetch?:boolean;policyChanges?:boolean;decisionConflict?:boolean;
  clock?:()=>string}={}){
  const calls:Array<{sql:string;params:readonly unknown[]}>=[];let authorityCalls=0;
  const authority={authorize:async()=>{
    authorityCalls++;
    return options.deny||(options.revoke&&authorityCalls>1)?null:{
      reviewerId:'reviewer-1',independentReview:!options.dependent as true,
      permissionPolicyVersion:options.policyChanges&&authorityCalls>1?'rights-v2':'rights-v1',
    };
  }};
  const pool={connect:async()=>({query:async(sql:string,params:readonly unknown[]=[])=>{
    calls.push({sql,params});
    if(sql.includes('FOR UPDATE'))return {rows:[{revision_id:options.stale?'newer':'revision-1'}]};
    if(sql.includes('FROM source_revisions_vnext'))return {rows:[{
      revision_id:'revision-1',source_id:'source-1',permission_ref:'permission-1',
      original_sha256:originalSha256,content_sha256:contentSha256,status:'NEEDS_REVIEW',
      change_kind:'NEW',provenance:'SYNTHETIC',source_class:'SYNTHETIC',
      fetched_at:options.futureFetch?'2026-11-02T00:00:00.000Z':'2026-11-01T00:00:00.000Z',
    }]};
    if(sql.includes('FROM source_originals_vnext'))return {rows:options.missingOriginal?[]:[{original_bytes:options.tamper?Buffer.from('tampered'):bytes}]};
    if(sql.includes('FROM source_paragraphs_vnext'))return {rows:paragraphs.map(p=>({paragraph_id:p.id,paragraph_text:options.tamperText?'altered':p.text}))};
    if(sql.includes('FROM source_review_attestations_vnext'))return {rows:options.existing?[{
      review_id:'review-1',reviewer_id:'reviewer-1',decision:options.decisionConflict?'REJECTED':'APPROVED',
      original_sha256:originalSha256,content_sha256:contentSha256,
      permission_policy_version:'rights-v1',
    }]:[]};
    if(sql.includes('INSERT INTO source_invalidation_deliveries')&&options.failOutbox)throw new Error('outbox failed');
    return {rows:[]};
  },release:()=>{}})};
  return {service:new PostgresSourceReviewService(pool,authority,options.clock??(()=>now)),calls};
}
describe('explicit operator source review',()=>{
  it('binds an independent human decision to stored originals and current head without mutating fetch history',async()=>{
    const x=harness();expect(await x.service.review(request)).toEqual({reviewId:'review-1',created:true});
    const insert=x.calls.find(q=>q.sql.includes('INSERT INTO source_review_attestations_vnext'))!;
    expect(insert.params).toContain(originalSha256);expect(insert.params).toContain(contentSha256);
    expect(insert.params).toContain(now);expect(insert.params).toContain('rights-v1');
    expect(x.calls.some(q=>q.sql.includes('INSERT INTO source_invalidation_deliveries'))).toBe(true);
    expect(x.calls.some(q=>/UPDATE source_revisions_vnext/.test(q.sql))).toBe(false);
    expect(x.calls.at(-1)!.sql).toBe('COMMIT');
  });
  it('denies absent current independent-review authority before any database access',async()=>{
    const x=harness({deny:true});await expect(x.service.review(request)).rejects.toThrow('authority');
    expect(x.calls).toHaveLength(0);
  });
  for(const [name,options,reason] of [
    ['stale head',{stale:true},'head'],['tampered original',{tamper:true},'integrity'],
    ['rights revoked during review',{revoke:true},'authority'],
    ['invalidation failure',{failOutbox:true},'outbox'],
    ['paragraph tampering',{tamperText:true},'integrity'],
    ['missing preserved original',{missingOriginal:true},'integrity'],
    ['future source acquisition',{futureFetch:true},'eligibility'],
    ['changed source policy',{policyChanges:true},'authority'],
    ['different immutable decision',{existing:true,decisionConflict:true},'conflict'],
  ] as const)it('rolls back '+name,async()=>{
    const x=harness(options);await expect(x.service.review(request)).rejects.toThrow(reason);
    expect(x.calls.at(-1)!.sql).toBe('ROLLBACK');
  });
  it('cannot treat an extractor or dependent reviewer as independent human approval',async()=>{
    const x=harness({dependent:true});await expect(x.service.review(request)).rejects.toThrow('authority');
    expect(x.calls).toHaveLength(0);
  });
  it('replays the same immutable decision idempotently without a second invalidation',async()=>{
    const x=harness({existing:true});expect(await x.service.review(request)).toEqual({reviewId:'review-1',created:false});
    expect(x.calls.some(q=>q.sql.includes('INSERT INTO source_invalidation_events'))).toBe(false);
  });
  it('records a rejection as an immutable decision without declaring the draft ACTIVE',async()=>{
    const x=harness();await x.service.review({...request,decision:'REJECTED'});
    const insert=x.calls.find(q=>q.sql.includes('INSERT INTO source_review_attestations_vnext'))!;
    expect(insert.params).toContain('REJECTED');
    expect(x.calls.some(q=>/UPDATE source_revisions_vnext/.test(q.sql))).toBe(false);
  });
  it('timestamps the completed checks rather than the start of an asynchronous review',async()=>{
    let tick=0;const x=harness({clock:()=>new Date(Date.parse(now)+1000*tick++).toISOString()});
    await x.service.review(request);
    const insert=x.calls.find(q=>q.sql.includes('INSERT INTO source_review_attestations_vnext'))!;
    expect(Date.parse(String(insert.params[4]))).toBeGreaterThan(Date.parse(now));
  });
});
