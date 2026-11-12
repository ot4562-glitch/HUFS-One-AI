import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {SourceRevisionVNextSchema} from '@hufs-one/contracts';
import {createApprovedDurableSourceExecutor} from '../../apps/api/src/modules/opportunities/source-ingestion-durable.js';

const url='https://synthetic.example.edu/approved/document';
const bytes=Buffer.from('synthetic document container');
const sha=createHash('sha256').update(bytes).digest('hex');
const input={sourceId:'SYN-DOCUMENT',permissionRef:'SYN-PERMISSION',actorRef:'SYN-OPERATOR'};
const at='2026-11-11T00:00:00.000Z';
const types=[['application/hwp+zip','HWPX'],['application/vnd.hancom.hwpx','HWPX'],
  ['application/x-hwp','HWP'],['application/vnd.hancom.hwp','HWP'],['application/haansofthwp','HWP']] as const;
function harness(media:string,change:(value:any)=>any=v=>v,missing=false){
  let revoked=false;
  const append=vi.fn(async(_input:unknown)=>null),plain=vi.fn(async()=>{throw new Error('Binary reached text parser');});
  const document=vi.fn(async(value:any)=>{
    expect(Buffer.from(value.content)).toEqual(bytes);
    const result={state:'NEEDS_REVIEW',sourceId:value.sourceId,revisionId:value.revisionId,
      mediaKind:media.includes('hwpx')||media==='application/hwp+zip'?'HWPX':'HWP',originalSha256:sha,
      completeness:'TEXT_ONLY_REQUIRES_ORIGINAL_REVIEW',paragraphs:[{id:'s0p1',text:'합성 한글 문서'}]};
    return change(result);
  });
  const service=createApprovedDurableSourceExecutor({
    policies:new Map([[input.sourceId,{...input,canonicalUrl:url,approvedOrigin:'https://synthetic.example.edu',
      sourceClass:'LICENSED_EXTERNAL',provenance:'REAL_APPROVED',rightsReviewed:true}]]),
    rights:{resolve:async()=>({sourceId:input.sourceId,canonicalUrl:url,permissionRef:input.permissionRef,
      policyVersion:'SYN-RIGHTS',reviewedBy:'SYN-REVIEWER',reviewedAt:at,
      status:revoked?'REVOKED':'APPROVED',allowedPurposes:new Set(['COLLECT','STORE'])})},
    egress:{resolveAddresses:async()=>['8.8.8.8'],requestPinned:async({init})=>{
      if(!missing&&types.some(t=>t[0]===media))expect(new Headers(init.headers).get('accept')?.split(',')).toContain(media);
      return new Response(bytes,{headers:{'content-type':media}});
    }},extractor:{extract:plain},
    ...(!missing?{documentExtractor:{extract:document}}:{}),
    readerPool:{connect:async()=>({query:async()=>({rows:[]}),release:()=>{}})},
    writer:{append,observeUnchanged:vi.fn(),storeHttpValidators:vi.fn()},now:()=>at,
  });
  return {service,append,document,plain,revoke:()=>{revoked=true;}};
}
describe('#445 durable Korean document source integration',()=>{
  it.each(types)('stores %s as %s review-only with exact original bytes',async(media,kind)=>{
    const x=harness(media);await expect(x.service.execute(input)).resolves.toMatchObject({kind:'NEW_DRAFT'});
    const stored=x.append.mock.calls[0]![0] as any;
    expect(SourceRevisionVNextSchema.parse(stored.revision)).toMatchObject({mediaKind:kind,status:'NEEDS_REVIEW',originalSha256:sha});
    expect(stored.revision.lastVerifiedAt).toBeUndefined();
    expect(Buffer.from(stored.originalBytes)).toEqual(bytes);
    expect(stored.paragraphs).toEqual([{id:'s0p1',text:'합성 한글 문서'}]);
    expect(x.plain).not.toHaveBeenCalled();expect(x.document).toHaveBeenCalledTimes(1);
  });
  it('requires an explicit document adapter, never the plain-text fallback',async()=>{
    const x=harness(types[0][0],v=>v,true);
    await expect(x.service.execute(input)).rejects.toThrow();
    expect(x.append).not.toHaveBeenCalled();expect(x.plain).not.toHaveBeenCalled();
  });
  it.each(['sha','source','revision','kind','state','completeness','duplicates','empty','script'])('refuses invalid %s extraction before SQL append',async(mode)=>{
    const x=harness(types[0][0],v=>({...v,
      ...(mode==='sha'?{originalSha256:'0'.repeat(64)}:{}),...(mode==='source'?{sourceId:'OTHER'}:{}),
      ...(mode==='revision'?{revisionId:'OTHER'}:{}),...(mode==='kind'?{mediaKind:'HWP'}:{}),
      ...(mode==='state'?{state:'ACTIVE'}:{}),...(mode==='completeness'?{completeness:'COMPLETE'}:{}),
      ...(mode==='duplicates'?{paragraphs:[{id:'p1',text:'a'},{id:'p1',text:'b'}]}:{}),
      ...(mode==='empty'?{paragraphs:[]}:{}),...(mode==='script'?{paragraphs:[{id:'p1',text:'<script>bad'}]}:{}),
    }));
    await expect(x.service.execute(input)).rejects.toThrow();expect(x.append).not.toHaveBeenCalled();
    expect(x.document).toHaveBeenCalledTimes(1);
  });
  it('rechecks current collection/storage rights after local extraction',async()=>{
    const x=harness(types[0][0],v=>{x.revoke();return v;});
    await expect(x.service.execute(input)).rejects.toThrow();expect(x.append).not.toHaveBeenCalled();
    expect(x.document).toHaveBeenCalledTimes(1);
  });
  it('does not accept a generic octet-stream as a Korean document',async()=>{
    const x=harness('application/octet-stream');await expect(x.service.execute(input)).rejects.toThrow();
    expect(x.document).not.toHaveBeenCalled();expect(x.append).not.toHaveBeenCalled();
  });
});
