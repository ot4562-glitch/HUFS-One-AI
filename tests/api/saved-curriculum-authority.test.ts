import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {importSavedCurriculum,courseCsvHeaders} from '../../apps/api/src/modules/curriculum/permitted-curriculum.js';

const now='2026-11-05T00:00:00.000Z',url='https://wis.hufs.ac.kr/src08/jsp/lecture/LECTURE2020L.jsp';
const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
function fixture(){
  const original=Buffer.from('SYNTHETIC saved timetable A, no real student data');
  const csv=[courseCsvHeaders.join(','),'SYN010101,Synthetic course,3,MAJOR,Synthetic department,2026-2,SEOUL,UNKNOWN'].join('\n');
  const capture={capturedAt:'2026-11-04T00:00:00.000Z',term:'2026-2',campus:'SEOUL',scope:'Synthetic department',
    converterVersion:'SYN-CONVERTER-1',permissionRef:'SYN-SAVED-PERMISSION',permissionVersion:'1'};
  const key={sourceUrl:url,savedArtifactSha256:hash(original),normalizedCsvSha256:hash(csv),...capture};
  const permission={...key,permissionEvidenceUrl:'https://wis.hufs.ac.kr/synthetic-terms',verifiedAt:now,
    expiresAt:'2026-12-01T00:00:00.000Z',edition:'SYN-2026-2',sourceKind:'OFFERINGS',collection:'ALLOWED',retention:'ALLOWED',
    terms:'ALLOWED',revoked:false,acquisitionMethod:'OPERATOR_SAVED',robots:'NOT_APPLICABLE',redistribution:'DENIED'};
  const resolveSaved=vi.fn(async()=>permission);
  return {options:{sourceUrl:url,originalBytes:original,csv,capture,authority:{resolveSaved},now:()=>now},key,permission,resolveSaved};
}

describe('#133 exact saved WIS artifact authority (invented fixtures only)',()=>{
  it('resolves both current grants by immutable bytes plus complete capture/permission identity',async()=>{
    const f=fixture(),result=await importSavedCurriculum(f.options);
    expect(f.resolveSaved).toHaveBeenCalledTimes(2);
    for(const [key,at] of f.resolveSaved.mock.calls as unknown as [Record<string,unknown>,string][]){
      expect(key).toEqual(f.key);expect(Object.isFrozen(key)).toBe(true);expect(at).toBe(now);
    }
    expect(result.manualCapture).toMatchObject({originalSha256:f.key.savedArtifactSha256,term:'2026-2',campus:'SEOUL',scope:'Synthetic department'});
    expect(result.courses[0]).toMatchObject({courseCode:'SYN010101',offeringStatus:'CONFIRMED',rulesStatus:'NEEDS_REVIEW'});
  });
  it('selects two separately authorized originals at the same WIS URL without URL-only fallback',async()=>{
    const f=fixture(),second=fixture();
    second.options.originalBytes=Buffer.from('SYNTHETIC separately saved timetable B');
    second.options.capture={...second.options.capture,capturedAt:'2026-11-04T01:00:00.000Z',permissionRef:'SYN-SAVED-PERMISSION-B'};
    const secondKey={...f.key,...second.options.capture,savedArtifactSha256:hash(second.options.originalBytes)};
    const registry=new Map([[JSON.stringify(f.key),f.permission],[JSON.stringify(secondKey),{...f.permission,...secondKey}]]);
    const resolve=vi.fn(async()=>{throw new Error('URL-only authority must not be used');});
    const authority={resolve,resolveSaved:async(key:unknown)=>registry.get(JSON.stringify(key))??null};
    const a=await importSavedCurriculum({...f.options,authority});
    const b=await importSavedCurriculum({...second.options,authority});
    expect(a.sourceSha256).not.toBe(b.sourceSha256);expect(b.permissionRef).toBe('SYN-SAVED-PERMISSION-B');
    expect(resolve).not.toHaveBeenCalled();
  });
  it.each(['capturedAt','term','campus','scope','converterVersion','permissionRef','permissionVersion'] as const)(
    'refuses a receipt reused across a changed %s',async field=>{
      const f=fixture(),changed=field==='capturedAt'?'2026-11-03T00:00:00.000Z':field==='term'?'2026-1':'SYN-OTHER';
      await expect(importSavedCurriculum({...f.options,capture:{...f.options.capture,[field]:changed}}))
        .rejects.toThrow('SOURCE_NOT_PERMITTED');
    });
  it('rejects URL-only legacy authorization even if it returns matching byte hashes',async()=>{
    const f=fixture(),resolve=vi.fn(async()=>f.permission);
    await expect(importSavedCurriculum({...f.options,authority:{resolve} as any})).rejects.toThrow('SOURCE_NOT_PERMITTED');
    expect(resolve).not.toHaveBeenCalled();
  });
  it.each(['term','campus','scope'] as const)('checks actual CSV rows against the authorized %s',async field=>{
    const f=fixture(),value=field==='term'?'2026-1':field==='campus'?'GLOBAL':'Synthetic other department';
    const permission={...f.permission,[field]:value},capture={...f.options.capture,[field]:value};
    await expect(importSavedCurriculum({...f.options,capture,authority:{resolveSaved:async()=>permission}}))
      .rejects.toThrow('SOURCE_NOT_PERMITTED');
  });
  it('snapshots caller-owned bytes and capture fields before awaiting authority',async()=>{
    const f=fixture();
    const result=await importSavedCurriculum({...f.options,authority:{resolveSaved:async()=>{
      f.options.originalBytes.fill(0);f.options.capture.scope='Synthetic mutated department';return f.permission;
    }}});
    expect(result.sourceSha256).toBe(f.key.savedArtifactSha256);
    expect(result.manualCapture?.scope).toBe('Synthetic department');
  });
  it('refuses a receipt version changed during parsing and an unrelated previous capture lineage',async()=>{
    const f=fixture();let calls=0;
    await expect(importSavedCurriculum({...f.options,authority:{resolveSaved:async()=>++calls===1?f.permission:{...f.permission,permissionVersion:'2'}}}))
      .rejects.toThrow('SOURCE_NOT_PERMITTED');
    const first=await importSavedCurriculum(f.options);
    await expect(importSavedCurriculum({...f.options,previous:{...first,manualCapture:{...first.manualCapture!,scope:'Synthetic other department'}}}))
      .rejects.toThrow('CATALOG_INVALID');
  });
});
