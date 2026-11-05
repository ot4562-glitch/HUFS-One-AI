import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {describe,expect,it} from 'vitest';
import {buildMediaFixturePack,validateMediaFixturePack} from '../../packages/core/src/evaluation/media-fixtures.js';
import {selectCurrentRevisions} from '../../packages/core/src/normalization/revisions.js';
import {DEMO_AS_OF} from '../../packages/core/src/opportunities/demo-corpus.js';
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');

describe('twenty authored PNG posters and twelve independent temporal references',()=>{
  it('has exact actual PNG/HTML hashes, original-pixel boxes and explicit synthetic rights',()=>{
    const pack=buildMediaFixturePack(),assets=new Map<string,Uint8Array>(pack.assets.map((a:any)=>[a.path,a.bytes]));
    expect(pack.manifest.posters).toHaveLength(20);expect(pack.manifest.temporalCases).toHaveLength(12);
    expect(pack.manifest.demoAsOf).toBe(DEMO_AS_OF);expect(pack.manifest.independentHumanReview).toBe('NOT_RUN');
    for(const poster of pack.manifest.posters){
      expect(poster.rights.externalAi).toBe('NOT_APPROVED');expect(poster.authoring).toBe('DETERMINISTIC_CODE');
      const bytes=assets.get(poster.image.path)!;expect(bytes.byteLength).toBeLessThanOrEqual(256*1024);
      expect(sha(bytes)).toBe(poster.image.originalSha256);expect(sha(assets.get(poster.html.path)!)).toBe(poster.html.originalSha256);
      const png=PNG.sync.read(Buffer.from(bytes));expect([png.width,png.height]).toEqual([640,360]);
      for(const field of poster.fields){
        const [x0,y0,x1,y1]=field.bboxPx;expect(field.bboxNorm).toEqual([x0/640,y0/360,x1/640,y1/360]);
        let left=640,top=360,right=0,bottom=0;
        for(let y=field.rowTop;y<field.rowTop+24;y++)for(let x=16;x<624;x++){
          const offset=(y*png.width+x)*4;
          if(png.data[offset]===16&&png.data[offset+1]===24&&png.data[offset+2]===40){
            left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
          }
        }
        expect([left,top,right,bottom]).toEqual(field.bboxPx);
        expect(field.imageSpan).toMatchObject({kind:'IMAGE',originalSha256:poster.image.originalSha256,
          sourceRevisionId:poster.image.revisionId,pageIndex:0,bboxNorm:field.bboxNorm,quote:field.text});
      }
    }
    expect(validateMediaFixturePack(pack.manifest,assets).posters).toHaveLength(20);
  });
  it('is byte-stable and disjoint from the shared 40 opportunity and legacy snapshot identities',()=>{
    const first=buildMediaFixturePack(),second=buildMediaFixturePack();
    expect(first.manifest).toEqual(second.manifest);
    expect(first.assets.map((a:any)=>[a.path,sha(a.bytes)])).toEqual(second.assets.map((a:any)=>[a.path,sha(a.bytes)]));
    expect(first.manifest.posters.every((p:any)=>p.id.startsWith('SYN-MEDIA-'))).toBe(true);
    expect(first.assets.some((a:any)=>a.path.includes('demo-snapshot'))).toBe(false);
  });
  it('binds each of twelve authored answers to exact revision text and checks them against the existing selector',()=>{
    const pack=buildMediaFixturePack(),assets=new Map<string,Uint8Array>(pack.assets.map((a:any)=>[a.path,a.bytes]));
    for(const c of pack.manifest.temporalCases){
      for(const r of c.revisions){
        expect(sha(assets.get(r.original.path)!)).toBe(r.original.sha256);
        expect(r.paragraphs.find((p:any)=>p.id===r.evidence.span.paragraphId)!.text.slice(r.evidence.span.start,r.evidence.span.end)).toBe(r.evidence.span.quote);
      }
      const actual=selectCurrentRevisions(c.revisions.map((r:any)=>r.revision),c.asOf);
      expect([...actual.current.values()].map(r=>r.revisionId).sort()).toEqual(c.expected.currentRevisionIds);
      expect(actual.quarantined.map(q=>[q.revisionId,q.reason]).sort()).toEqual(c.expected.quarantined);
    }
  });
  it.each(['PNG bytes','bbox','duplicate poster','truth revision'] as const)('rejects modified %s',kind=>{
    const pack=buildMediaFixturePack(),assets=new Map<string,Uint8Array>(pack.assets.map((a:any)=>[a.path,a.bytes]));
    if(kind==='PNG bytes'){const bytes=Buffer.from(assets.get(pack.manifest.posters[0]!.image.path)!);bytes[40]=bytes[40]!^1;assets.set(pack.manifest.posters[0]!.image.path,bytes);}
    if(kind==='bbox')pack.manifest.posters[0]!.fields[0]!.bboxNorm=[0,0,1,1];
    if(kind==='duplicate poster')pack.manifest.posters[1]=pack.manifest.posters[0]!;
    if(kind==='truth revision')pack.manifest.temporalCases[0]!.expected.currentRevisionIds=['invented'];
    expect(()=>validateMediaFixturePack(pack.manifest,assets)).toThrow();
  });
});
