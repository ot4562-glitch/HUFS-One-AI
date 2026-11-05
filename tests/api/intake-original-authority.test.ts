import {describe,expect,it,vi} from 'vitest';
import {PostgresRestrictedIntakeImport} from '../../apps/api/src/modules/academics/intake-postgres.js';
import {makeSyntheticIntake} from './synthetic-intake-fixture.js';

const now='2026-10-31T00:00:00.000Z';
function permission(request:any){
  return {schemaVersion:'intake-original-permission-v1',actorRef:request.actorRef,subjectKey:request.subjectKey,
    purpose:'LOCAL_TRANSCRIPT_REVIEW',formsSha256:request.formsSha256,courseSha256:request.courseSha256,
    permissionRef:'SYN-ORIGINAL-'+request.subjectKey,permissionVersion:'1',consentRef:'SYN-CONSENT-1',retentionRef:'SYN-RETENTION-1',
    actions:['PREVIEW','APPLY'],collection:'ALLOWED',retention:'ALLOWED',reviewedAt:'2026-10-30T00:00:00.000Z',
    expiresAt:'2026-12-01T00:00:00.000Z',revoked:false};
}
function fixture(resolve:(request:any)=>Promise<unknown>=async request=>permission(request)){
  const commands:string[]=[],resolver=vi.fn(resolve);
  const connect=vi.fn(async()=>({release:()=>{},query:async(sql:string)=>{
    commands.push(sql);
    if(sql.includes('SELECT current_version'))return {rows:[{current_version:0,current_batch_sha256:null}]};
    if(sql.includes('INSERT INTO api_intake_revisions'))return {rows:[{import_version:1}]};
    if(sql.includes('UPDATE api_intake_heads'))return {rows:[{current_version:1}]};
    return {rows:[]};
  }}));
  const input=makeSyntheticIntake(),authority={mayProcess:async()=>true,resolveOriginalPermission:resolver};
  const service=new PostgresRestrictedIntakeImport({connect},authority,()=>now);
  return {service,input,authority,commands,connect,resolver,
    expectedVersions:Object.fromEntries(input.formsOptions.expectedSubjectKeys.map(s=>[s,0]))};
}

describe('#133 private original permission binding (synthetic protocol, no live PG)',()=>{
  it('requires an independent exact original receipt in addition to general purpose permission',async()=>{
    const f=fixture(async()=>null);
    await expect(f.service.preview(f.input)).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(f.connect).not.toHaveBeenCalled();
  });
  it.each([
    {formsSha256:'a'.repeat(64)},{courseSha256:'b'.repeat(64)},{subjectKey:'SYN-OTHER'},
    {actorRef:'SYN-OTHER'},{retention:'DENIED'},{consentRef:''},{revoked:true},
    {actions:['APPLY']},{expiresAt:now},{reviewedAt:'2027-01-01T00:00:00.000Z'},
  ])('refuses a missing or mismatched original authority field',async change=>{
    const f=fixture(async request=>({...permission(request),...change}));
    await expect(f.service.preview(f.input)).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(f.connect).not.toHaveBeenCalled();
  });
  it('binds receipt identity into the preview without exposing original hashes or private mappings',async()=>{
    let version='1';const f=fixture(async request=>({...permission(request),permissionVersion:version}));
    const first=await f.service.preview(f.input);version='2';const second=await f.service.preview(f.input);
    expect(first.ready).toBe(true);expect(first.previewHash).not.toBe(second.previewHash);
    await expect(f.service.apply(f.input,{previewHash:first.previewHash,expectedVersions:f.expectedVersions}))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(f.connect).not.toHaveBeenCalled();
    const request=f.resolver.mock.calls[0]![0];
    expect(request).toMatchObject({purpose:'LOCAL_TRANSCRIPT_REVIEW',action:'PREVIEW',actorRef:f.input.actorRef});
    expect(request.formsSha256).toMatch(/^[a-f0-9]{64}$/);expect(request.courseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(request)).not.toMatch(/가상작성자|가상 기초과목|\.csv/);
    expect(JSON.stringify(second)).not.toContain(request.formsSha256);
  });
  it('refuses a changed original grant after SQL writes and before the atomic commit',async()=>{
    const f=fixture(async request=>f.commands.some(s=>s.includes('INSERT INTO api_intake_revisions'))
      ?{...permission(request),permissionVersion:'2'}:permission(request));
    const preview=await f.service.preview(f.input);
    await expect(f.service.apply(f.input,{previewHash:preview.previewHash,expectedVersions:f.expectedVersions}))
      .rejects.toMatchObject({code:'FORBIDDEN'});
    expect(f.commands).toContain('ROLLBACK');expect(f.commands).not.toContain('COMMIT');
  });
  it('snapshots private input before awaiting the first purpose or receipt authority',async()=>{
    const f=fixture();
    const expected=await f.service.preview(f.input);
    f.authority.mayProcess=async()=>{f.input.courseFiles[0]!.content='SYNTHETIC mutation, not a CSV';return true;};
    const result=await f.service.preview(f.input);
    expect(result).toEqual(expected);
  });
  it('fails before parsing an unbound source and refuses revocation during preview',async()=>{
    const f=fixture();f.input.courseFiles[0]!.filename='UNBOUND-SYNTHETIC.csv';
    await expect(f.service.preview(f.input)).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(f.resolver).not.toHaveBeenCalled();
    let count=0;const revoked=fixture(async request=>++count<=4?permission(request):null);
    await expect(revoked.service.preview(revoked.input)).rejects.toMatchObject({code:'FORBIDDEN'});
  });
});
