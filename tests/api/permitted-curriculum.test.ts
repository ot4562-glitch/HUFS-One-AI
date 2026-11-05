import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {collectCurriculum,importSavedCurriculum,normalizeCurriculum,courseCsvHeaders} from '../../apps/api/src/modules/curriculum/permitted-curriculum.js';

const now='2026-11-02T00:00:00.000Z';
const policy={sourceUrl:'https://example.hufs.ac.kr/public/courses.csv',permissionRef:'synthetic-public-permission',
  permissionVersion:'1',permissionEvidenceUrl:'https://example.hufs.ac.kr/terms',
  verifiedAt:now,expiresAt:'2026-12-01T00:00:00.000Z',edition:'synthetic-2026',
  sourceKind:'CURRICULUM' as const,collection:'ALLOWED' as const,retention:'ALLOWED' as const,
  robots:'ALLOWED' as const,terms:'ALLOWED' as const,revoked:false as const};
const line='SYN101,Synthetic course,3,MAJOR,Synthetic major,2026-2,Synthetic campus,2024';
const csv=[courseCsvHeaders.join(','),line].join('\n');
describe('permitted official curriculum collection (synthetic transport)',()=>{
  const original=Buffer.from('<html>SYNTHETIC saved timetable, no student records</html>');
  const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
  const savedCsv=csv.replace(',2024',',UNKNOWN');
  const capture=()=>({capturedAt:now,term:'2026-2',campus:'Synthetic campus',scope:'Synthetic major',
    converterVersion:'SYN-CONVERTER-1',permissionRef:policy.permissionRef,permissionVersion:policy.permissionVersion});
  const manual=()=>({...policy,acquisitionMethod:'OPERATOR_SAVED' as const,robots:'NOT_APPLICABLE' as const,
    savedArtifactSha256:hash(original),normalizedCsvSha256:hash(savedCsv),...capture(),
    converterVersion:'SYN-CONVERTER-1',redistribution:'DENIED' as const});
  it('imports an explicitly approved operator snapshot without making an HTTP request',async()=>{
    const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('NETWORK_FORBIDDEN'));
    try{
      const result=await importSavedCurriculum({sourceUrl:policy.sourceUrl,originalBytes:original,csv:savedCsv,capture:capture(),
        authority:{resolveSaved:async()=>manual()},now:()=>now});
      expect(fetcher).not.toHaveBeenCalled();
      expect(result.courses[0]).toMatchObject({cohort:'UNKNOWN',creditUnits:6,rulesStatus:'NEEDS_REVIEW'});
      expect(result.manualCapture).toMatchObject({originalSha256:hash(original),normalizedCsvSha256:hash(savedCsv),
        capturedAt:now,converterVersion:'SYN-CONVERTER-1',redistribution:'DENIED'});
      expect(JSON.stringify(result)).not.toContain('<html>');
      const reused=await importSavedCurriculum({sourceUrl:policy.sourceUrl,originalBytes:original,csv:savedCsv,capture:capture(),
        authority:{resolveSaved:async()=>manual()},now:()=>now,previous:result});
      expect(reused.reused).toBe(true);expect(reused.version).toBe(result.version);
    }finally{fetcher.mockRestore();}
  });
  it('never uses manual robots exemption for automatic collection',async()=>{
    const fetcher=vi.fn();
    await expect(collectCurriculum({sourceUrl:policy.sourceUrl,authority:{resolve:async()=>manual()},fetcher,now:()=>now}))
      .rejects.toThrow('SOURCE_NOT_PERMITTED');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires exact raw and converted hashes, explicit reuse scope and an unexpired manual permission',async()=>{
    for(const change of [
      {savedArtifactSha256:'a'.repeat(64)},{normalizedCsvSha256:'b'.repeat(64)},
      {redistribution:undefined},{expiresAt:now},{capturedAt:'2027-01-01T00:00:00Z'},
      {robots:'ALLOWED'},
    ])await expect(importSavedCurriculum({sourceUrl:policy.sourceUrl,originalBytes:original,csv:savedCsv,capture:capture(),
      authority:{resolveSaved:async()=>({...manual(),...change})},now:()=>now})).rejects.toThrow();
  });
  it('rechecks withdrawal after parsing without promoting the original review timestamp',async()=>{
    let reads=0;
    await expect(importSavedCurriculum({sourceUrl:policy.sourceUrl,originalBytes:original,csv:savedCsv,capture:capture(),
      authority:{resolveSaved:async()=>++reads===1?manual():null},now:()=>now})).rejects.toThrow('SOURCE_NOT_PERMITTED');
    const later='2026-11-03T00:00:00Z';
    const result=await importSavedCurriculum({sourceUrl:policy.sourceUrl,originalBytes:original,csv:savedCsv,capture:capture(),
      authority:{resolveSaved:async()=>manual()},now:()=>later});
    expect(result.verifiedAt).toBe(now);expect(result.courses[0]?.verifiedAt).toBe(now);
  });
  it('does not fetch unverified, revoked, private login or disallowed sources',async()=>{
    const fetcher=vi.fn();
    for(const candidate of [null,{...policy,robots:'DENIED'}, {...policy,revoked:true},
      {...policy,sourceUrl:'https://example.hufs.ac.kr/login/courses.csv'},
      {...policy,sourceUrl:'http://example.hufs.ac.kr/public/courses.csv'}]){
      await expect(collectCurriculum({sourceUrl:policy.sourceUrl,authority:{resolve:async()=>candidate},fetcher,now:()=>now})).rejects.toThrow('SOURCE_NOT_PERMITTED');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('deduplicates exact course rows, preserves semesters, and leaves offering/rule checks unknown',()=>{
    const result=normalizeCurriculum([csv,line,line.replace('2026-2','2027-1')].join('\n'),policy,now);
    expect(result.courses).toHaveLength(2);
    expect(result.duplicateRows).toBe(1);
    expect(result.courses[0]).toMatchObject({creditUnits:6,offeringStatus:'UNKNOWN',rulesStatus:'NEEDS_REVIEW',sourceUrl:policy.sourceUrl,edition:policy.edition});
    const conflict=normalizeCurriculum(csv+'\n'+line.replace(',3,',',4,'),policy,now);
    expect(conflict.courses.every(c=>c.collectionStatus==='NEEDS_REVIEW')).toBe(true);
    expect(()=>normalizeCurriculum(csv.replace(',3,',',-1,'),policy,now)).toThrow('CATALOG_INVALID');
    expect(()=>normalizeCurriculum(csv.replace(courseCsvHeaders.join(','),courseCsvHeaders.join(',')+',studentName'),policy,now)).toThrow('CATALOG_INVALID');
  });
  it('bounds retries, makes repeat collection idempotent and versions corrections',async()=>{
    let calls=0;const sleeps:number[]=[];
    const options={sourceUrl:policy.sourceUrl,authority:{resolve:async()=>policy},
      fetcher:async()=>{calls++;return calls===1?new Response('',{status:429}):new Response(csv,{headers:{'content-type':'text/csv'}});},
      now:()=>now,sleep:async(ms:number)=>{sleeps.push(ms);}};
    const first=await collectCurriculum(options);
    expect(calls).toBe(2);expect(sleeps).toEqual([1000]);
    const second=await collectCurriculum({...options,previous:first});
    expect(second.version).toBe(1);expect(second.reused).toBe(true);
    const correction=await collectCurriculum({...options,previous:first,fetcher:async()=>new Response(csv.replace(',3,',',4,'),{headers:{'content-type':'text/csv'}})});
    expect(correction.version).toBe(2);expect(correction.previousSha256).toBe(first.sourceSha256);
  });
  it('rechecks permissions after transport and refuses redirects and unknown offering claims',async()=>{
    let reads=0;
    await expect(collectCurriculum({sourceUrl:policy.sourceUrl,authority:{resolve:async()=>++reads===1?policy:null},fetcher:async()=>new Response(csv),now:()=>now})).rejects.toThrow('SOURCE_NOT_PERMITTED');
    await expect(collectCurriculum({sourceUrl:policy.sourceUrl,authority:{resolve:async()=>policy},fetcher:async()=>new Response('',{status:302,headers:{location:'/sso'}}),now:()=>now})).rejects.toThrow('COLLECTION_FAILED');
    expect(normalizeCurriculum(csv,{...policy,sourceKind:'OFFERINGS'},now).courses[0]!.offeringStatus).toBe('CONFIRMED');
    expect(normalizeCurriculum(csv.replace('2026-2','UNKNOWN'),{...policy,sourceKind:'OFFERINGS'},now).courses[0]!.offeringStatus).toBe('UNKNOWN');
  });
});
