import {describe,it,expect} from 'vitest';
import Papa from 'papaparse';
import {canReadSharedSection,SharingGrantSchema,SourceSnapshotSchema,OfferingOutlookSchema,
  COURSE_CSV_HEADERS,FORMS_HEADERS,validateCourseCsv,validateApprovedIntakeBundle,validateFormsCsv} from '@hufs-one/contracts';
import {fixture} from './helpers.js';

const d='2026-10-30T09:00:00.000Z';
const grant=SharingGrantSchema.parse({grantId:'SYN-G1',actorId:'SYN-ACTOR',demoSubjectId:'S01',
  allowedSections:['FEED'],displayNameAllowed:false,recordingAllowed:false,version:'G1',expiresAt:'2026-10-31T09:00:00.000Z'});

describe('adversarial consumer cross-review hardening',()=>{
  it('enforces grant actor, scope, subject, expiry and revocation on the server side',()=>{
    const req={actorId:'SYN-ACTOR',demoSubjectId:'S01' as const,section:'FEED' as const,asOf:d};
    expect(canReadSharedSection(grant,req)).toBe(true);
    expect(canReadSharedSection(grant,{...req,actorId:'DIFFERENT'})).toBe(false);
    expect(canReadSharedSection(grant,{...req,demoSubjectId:'S02'})).toBe(false);
    expect(canReadSharedSection(grant,{...req,section:'ACADEMICS'})).toBe(false);
    expect(canReadSharedSection(grant,{...req,asOf:'2026-11-01T00:00:00.000Z'})).toBe(false);
    expect(canReadSharedSection({...grant,revokedAt:d},req)).toBe(false);
  });
  it('enforces a source permission reference, not just an arbitrary source URL',()=>{
    const source={id:'SYN-SOURCE',class:'SYNTHETIC',fetchedAt:d,hash:'SYN-HASH',permissionRef:'SYN-PERMISSION',version:'1',paragraphs:[{id:'p1',text:'가상 공고'}]};
    expect(SourceSnapshotSchema.safeParse(source).success).toBe(true);
    expect(SourceSnapshotSchema.safeParse({...source,permissionRef:''}).success).toBe(false);
    expect(SourceSnapshotSchema.safeParse({...source,extraPersonalField:'FAKE'}).success).toBe(false);
  });
  it('compares asOf timestamps by instant (offsets), not ISO lexicography',()=>{
    const f=fixture<{items:Record<string,unknown>[]}>('synthetic/forecast-summary.json');
    const v=f.items[0]!;
    const withOffset={...v,asOf:'2026-10-30T11:00:00+09:00',sourcePublishedAt:'2026-10-30T03:00:00Z'};
    // 03:00Z is AFTER 02:00Z, despite '03...' looking smaller than '11...'.
    expect(OfferingOutlookSchema.safeParse(withOffset).success).toBe(false);
  });
  it('does not interpret hex or formula CSV cells as course credits or safe names',()=>{
    const sample=[Array.from(COURSE_CSV_HEADERS),['2026-1','','가상','0x10','교양','이수완료']];
    expect(validateCourseCsv(Papa.unparse(sample)).ok).toBe(false);
    sample[1]![3]='3';sample[1]![2]='=CMD()';
    expect(validateCourseCsv(Papa.unparse(sample)).issues.some(x=>x.code==='CSV_FORMULA_INJECTION')).toBe(true);
  });
  it('rejects conflicting normalized aliases instead of silently selecting one student',()=>{
    const four=['가상A','가상B','가상C','가상D'];
    const options={expectedSubjectKeys:['SYN1','SYN2','SYN3','SYN4'],
      subjectByDisplayName:{'가상A':'SYN1',' 가상A ':'SYN2','가상B':'SYN2','가상C':'SYN3','가상D':'SYN4'}};
    const raw=Papa.unparse([Array.from(FORMS_HEADERS),...four.map(name=>FORMS_HEADERS.map((_h,i)=>i===6?name:(i>=1&&i<=5?'예':'')))]);
    expect(validateFormsCsv(raw,options).issues.some(x=>x.code==='UNMAPPED_PERSON')).toBe(true);
  });
  it('binds files by explicit owner-reviewed filename mapping, not an inferred student name',()=>{
    const names=['가상A','가상B','가상C','가상D'];
    const keys=['SYN1','SYN2','SYN3','SYN4'];
    const formsOptions={expectedSubjectKeys:keys,subjectByDisplayName:Object.fromEntries(names.map((n,i)=>[n,keys[i]!]))};
    const formsCsv=Papa.unparse([Array.from(FORMS_HEADERS),...names.map(name=>FORMS_HEADERS.map((_h,i)=>i===6?name:(i>=1&&i<=5?'예':'')))]);
    const sample=Papa.unparse([Array.from(COURSE_CSV_HEADERS),['2026-1','','가상 과목','3','교양','이수완료']]);
    // One synthetic alias filename differs from its Forms display name; mapping is explicit.
    const filenames=['이수과목_가상별명.csv','이수과목_가상B.csv','이수과목_가상C.csv','이수과목_가상D.csv'];
    const bindings=filenames.map((filename,i)=>({filename,subjectKey:keys[i]!,verificationSource:'OWNER_STATEMENT' as const}));
    const courseFiles=filenames.map(filename=>({filename,content:sample}));
    const report=validateApprovedIntakeBundle({formsCsv,courseFiles,approvedFileBindings:bindings,formsOptions});
    expect(report.ready).toBe(true);
    const unapproved=validateApprovedIntakeBundle({formsCsv,courseFiles:[...courseFiles,{filename:'이수과목_미확인.csv',content:sample}],approvedFileBindings:bindings,formsOptions});
    expect(unapproved.ready).toBe(false);
    expect(unapproved.issues.some(x=>x.code==='UNAPPROVED_FILENAME')).toBe(true);
    const traversal=validateApprovedIntakeBundle({formsCsv,courseFiles:[{filename:'../이수과목_가상별명.csv',content:sample}],approvedFileBindings:bindings,formsOptions});
    expect(traversal.ready).toBe(false);
    expect(traversal.issues.some(x=>x.code==='UNAPPROVED_FILENAME')).toBe(true);
  });
});
