import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {buildSourceBrowserEvidence,parseSourceBrowserEvidence} from '../../apps/api/src/modules/opportunities/source-browser-evidence.js';
const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const original=Buffer.from('<main><script>document.write("SYNTHETIC")</script></main>');
const dom=Buffer.from('<html><body><main><p>SYNTHETIC rendered notice</p></main></body></html>');
const paragraphs=[{id:'p1',text:'SYNTHETIC rendered notice'}];
const renderer={id:'crawlee-playwright-v1' as const,wrapperSha256:'a'.repeat(64),bwrapSha256:'b'.repeat(64),
  rootfsSha256:'c'.repeat(64),chromiumVersion:'130.0.1.2',policyVersion:'SYN-BROWSER-1'};
const binding={sourceId:'SYN-SOURCE',revisionId:'SYN-REV',permissionRef:'SYN-PERM',
  originalSha256:hash(original),originalByteLength:original.length,asOf:'2026-11-12T00:00:01Z'};
const make=()=>buildSourceBrowserEvidence({sourceId:binding.sourceId,sourceRevisionId:binding.revisionId,
  permissionRef:binding.permissionRef,canonicalUrl:'https://synthetic.example.edu/notice',originalBytes:original,
  domBytes:dom,paragraphs,renderer,rootSelector:'main',capturedAt:'2026-11-12T00:00:00Z',resources:[]});
describe('#445 separate original/browser DOM evidence',()=>{
  it('binds the immutable original, captured DOM, renderer and paragraphs separately',()=>{
    const evidence=make(),result=parseSourceBrowserEvidence(evidence,dom,paragraphs,binding);
    expect(result.evidence.originalSha256).toBe(hash(original));expect(result.evidence.domSha256).toBe(hash(dom));
    expect(result.evidence.originalSha256).not.toBe(result.evidence.domSha256);
    expect(result.domBytes).toEqual(dom);expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.evidence.reviewState).toBe('NEEDS_REVIEW');
  });
  it.each(['sourceId','sourceRevisionId','permissionRef','originalSha256','domSha256','paragraphsSha256','renderingSha256'])
    ('rejects changed %s',key=>{
      expect(()=>parseSourceBrowserEvidence({...make(),[key]:key.endsWith('Sha256')?'f'.repeat(64):'SYN-FOREIGN'},
        dom,paragraphs,binding)).toThrow('Source browser evidence requires review');
    });
  it('rejects changed DOM bytes, unknown selectors, invalid UTF-8 and future captures',()=>{
    expect(()=>parseSourceBrowserEvidence(make(),Buffer.from('changed'),paragraphs,binding)).toThrow();
    expect(()=>parseSourceBrowserEvidence({...make(),rootSelector:'body script'},dom,paragraphs,binding)).toThrow();
    expect(()=>parseSourceBrowserEvidence({...make(),capturedAt:'2026-12-01T00:00:00Z'},dom,paragraphs,binding)).toThrow();
    expect(()=>buildSourceBrowserEvidence({...make(),originalBytes:original,domBytes:Buffer.from([255]),paragraphs})).toThrow();
  });
  it('keeps rendering identity stable across capture times/revision IDs but not renderer changes',()=>{
    const first=make();
    const later=buildSourceBrowserEvidence({...first,sourceRevisionId:'SYN-REV-2',capturedAt:'2026-11-13T00:00:00Z',
      originalBytes:original,domBytes:dom,paragraphs});
    expect(later.renderingSha256).toBe(first.renderingSha256);
    const changed=buildSourceBrowserEvidence({...first,originalBytes:original,domBytes:dom,paragraphs,
      renderer:{...renderer,policyVersion:'SYN-BROWSER-2'}});
    expect(changed.renderingSha256).not.toBe(first.renderingSha256);
  });
  it('snapshots DOM bytes and rejects duplicate paragraph identities',()=>{
    const bytes=Buffer.from(dom),parsed=parseSourceBrowserEvidence(make(),bytes,paragraphs,binding);
    bytes.fill(0);expect(parsed.domBytes).toEqual(dom);
    expect(()=>buildSourceBrowserEvidence({...make(),originalBytes:original,domBytes:dom,
      paragraphs:[paragraphs[0]!,paragraphs[0]!]})).toThrow();
  });
  it('rejects conflicting resource URLs and renderer identities outside the pinned runtime',()=>{
    const resource={sourceId:'SYN-ASSET',revisionId:'SYN-ASSET-1',permissionRef:'SYN-ASSET-PERM',
      rightsReceiptId:'SYN-ASSET-RIGHT',canonicalUrl:'https://synthetic.example.edu/script.js',
      originalSha256:'d'.repeat(64),byteLength:100,kind:'SCRIPT' as const};
    expect(()=>buildSourceBrowserEvidence({...make(),originalBytes:original,domBytes:dom,paragraphs,
      resources:[resource,{...resource,revisionId:'SYN-ASSET-2'}]})).toThrow();
    expect(()=>parseSourceBrowserEvidence(make(),dom,paragraphs,{...binding,
      expectedRenderer:{...renderer,chromiumVersion:'131.0.1.2'}})).toThrow();
  });
});
