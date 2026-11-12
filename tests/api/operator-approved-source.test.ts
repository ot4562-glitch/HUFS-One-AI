import {describe,it,expect,vi} from 'vitest';
import {createOperatorApprovedSource} from '../../apps/api/src/operator-approved-source.js';
import type {SourceDocumentExtractor} from '../../apps/api/src/modules/opportunities/source-document-extractor.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const NOW='2026-11-04T00:00:00.000Z';
const policy={sourceId:'SRC_A',permissionRef:'RIGHT_A',
  canonicalUrl:'https://example.org/approved-page',
  approvedOrigin:'https://example.org/',
  sourceClass:'LICENSED_EXTERNAL' as const,provenance:'REAL_APPROVED' as const,
  rightsReviewed:true};
const receipt=()=>({receipt_id:'RECEIPT_A',actor_id:'operator-A',
  source_id:policy.sourceId,permission_ref:policy.permissionRef,
  canonical_url:policy.canonicalUrl,purposes:['COLLECT','STORE'],
  reviewed_by:'independent-reviewer',reviewed_at:'2026-11-02T00:00:00Z',
  starts_at:'2026-11-03T00:00:00Z',expires_at:'2026-11-05T00:00:00Z',
  policy_version:'p1',database_now:NOW,revoked_at:null});

function setup(current:Record<string,unknown>|null=receipt(),documentExtractor?:SourceDocumentExtractor){
  const query=vi.fn(async()=>({rows:current?[current]:[]}));
  const rights={connect:vi.fn(async()=>({query,release:()=>{}}))};
  const untouched=()=>({connect:vi.fn(async()=>{throw Error('unexpected SQL');})});
  const headReader={connect:vi.fn<ReviewerSqlPool['connect']>(async()=>{throw Error('unexpected SQL');})},writer=untouched(),queue=untouched();
  const resolveAddresses=vi.fn(async()=>['8.8.8.8']);
  const requestPinned=vi.fn(async()=>new Response('synthetic'));
  const mayProcess=vi.fn(async()=>true);
  const result=createOperatorApprovedSource({
    operatorActorId:'operator-A',policies:[policy],
    pools:{rights,headReader,writer,queue},
    egress:{resolveAddresses,requestPinned},
    extractor:{extract:async()=>[{id:'p1',text:'Synthetic approved test'}]},
    ...(documentExtractor?{documentExtractor}:{}),
    authority:{mayProcess},now:()=>NOW,
  });
  return {result,rights,headReader,writer,queue,resolveAddresses,requestPinned,mayProcess,query};
}

describe('operator SourceRevision composition',()=>{
  it('forwards the explicit local document parser after current rights and head lookup',async()=>{
    const extract=vi.fn(async()=>{throw new Error('synthetic document parser entered');});
    const f=setup(receipt(),{extract});
    f.headReader.connect.mockResolvedValue({query:async()=>({rows:[]}),release:()=>{}});
    f.requestPinned.mockImplementation(async()=>new Response('synthetic bytes',{headers:{'content-type':'application/x-hwp'}}));
    await expect(f.result.executor.execute({actorRef:'operator-A',sourceId:'SRC_A',permissionRef:'RIGHT_A'}))
      .rejects.toThrow('synthetic document parser entered');
    expect(extract).toHaveBeenCalledTimes(1);expect(f.writer.connect).not.toHaveBeenCalled();
  });
  it('stays inert on construction and rejects foreign actor/source without DB or HTTP',async()=>{
    const f=setup();
    expect(f.rights.connect).not.toHaveBeenCalled();
    expect(f.resolveAddresses).not.toHaveBeenCalled();
    expect(await f.result.authority.mayProcess({
      actorRef:'other',sourceId:'SRC_A',permissionRef:'RIGHT_A',now:NOW,
    })).toBe(false);
    expect(f.rights.connect).not.toHaveBeenCalled();
    expect(f.mayProcess).not.toHaveBeenCalled();
  });

  it('requires current approved rights and a second independent authority',async()=>{
    const f=setup();
    const permitted=await f.result.authority.mayProcess({
      actorRef:'operator-A',sourceId:'SRC_A',permissionRef:'RIGHT_A',now:NOW,
    });
    expect(permitted).toBe(true);
    expect(f.mayProcess).toHaveBeenCalledTimes(1);
    expect(f.rights.connect).toHaveBeenCalledTimes(2);
    expect(f.requestPinned).not.toHaveBeenCalled();
    expect(f.writer.connect).not.toHaveBeenCalled();
  });

  it('rejects a revoked receipt before an external fetch or database draft',async()=>{
    const f=setup({...receipt(),revoked_at:NOW});
    const permitted=await f.result.authority.mayProcess({
      actorRef:'operator-A',sourceId:'SRC_A',permissionRef:'RIGHT_A',now:NOW,
    });
    expect(permitted).toBe(false);
    await expect(f.result.executor.execute({
      actorRef:'operator-A',sourceId:'SRC_A',permissionRef:'RIGHT_A',
    })).rejects.toThrow();
    expect(f.resolveAddresses).not.toHaveBeenCalled();
    expect(f.headReader.connect).not.toHaveBeenCalled();
    expect(f.writer.connect).not.toHaveBeenCalled();
  });
});
