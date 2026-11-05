import {describe,it,expect} from 'vitest';
import Papa from 'papaparse';
import {COURSE_CSV_HEADERS,FORMS_HEADERS,EXPECTED_REAL_CONTRIBUTORS,validateCourseCsv,validateFormsCsv,validateIntakeBundle} from '@hufs-one/contracts';

// All names and course titles in this file are FAKE. No real Forms rows are used by CI.
const subjects=['SYNA','SYNB','SYNC','SYND'] as const;
const names=['가상학생가','가상학생나','가상학생다','가상학생라'];
const options={expectedSubjectKeys:subjects,subjectByDisplayName:Object.fromEntries(names.map((n,i)=>[n,subjects[i]!]))};
const row=(name:string,consent='예')=>FORMS_HEADERS.map((_v,i)=>i===6?name:(i>=1&&i<=5?consent:''));
const forms=(people=names)=>Papa.unparse([Array.from(FORMS_HEADERS),...people.map(n=>row(n))]);
const course=Papa.unparse([Array.from(COURSE_CSV_HEADERS),['2026-1','','가상 과목', '2.5','전공선택','이수완료'],['2026-2','','가상 실습','1','교양','수강중']]);

describe('A03 UTF-8 26/6 CSV and 4-person intake',()=>{
  it('freezes 26 exact Forms header strings and six course headers',()=>{
    expect(FORMS_HEADERS).toHaveLength(26);
    expect(COURSE_CSV_HEADERS).toEqual(['학기','학수번호','과목명','학점','이수구분','이수상태']);
    expect(EXPECTED_REAL_CONTRIBUTORS).toBe(4);
  });
  it('accepts synthetic 6-column CSV, preserving half-credit in integer units',()=>{
    const r=validateCourseCsv('\uFEFF'+course);
    expect(r.ok).toBe(true);
    expect(r.rowCount).toBe(2);
    expect(r.records[0]?.creditUnits).toBe(5);
    expect(r.records[1]?.ledger).toBe('IN_PROGRESS');
  });
  it('allows quoted commas and linebreaks inside cells',()=>{
    const x=Papa.unparse([Array.from(COURSE_CSV_HEADERS),['2026-1','','가상,\n실습','1.5','전공선택','수강중']]);
    const r=validateCourseCsv(x);
    expect(r.ok).toBe(true);
    expect(r.records[0]?.courseName).toBe('가상,\n실습');
  });
  it.each([
    ['wrong status','임의상태','COURSE_STATUS_INVALID',5],
    ['negative credits','-3','COURSE_CREDITS_INVALID',3],
  ])('rejects %s',(_name,value,code,index)=>{
    const cells=['2026-1','','가상 과목','3','교양','이수완료'];
    cells[index]=value;
    const r=validateCourseCsv(Papa.unparse([Array.from(COURSE_CSV_HEADERS),cells]));
    expect(r.ok).toBe(false);
    expect(r.issues.some(i=>i.code===code)).toBe(true);
  });
  it('rejects non-half credits, extra grade column and duplicate rows',()=>{
    expect(validateCourseCsv(course.replace('2.5','2.3')).ok).toBe(false);
    expect(validateCourseCsv(Papa.unparse([[...COURSE_CSV_HEADERS,'GPA'],['2026-1','','가상','3','전공선택','이수완료','4.5']])).ok).toBe(false);
    const record=['2026-1','','가상','3','교양','이수완료'];
    expect(validateCourseCsv(Papa.unparse([Array.from(COURSE_CSV_HEADERS),record,record])).issues.some(x=>x.code==='COURSE_DUPLICATE_REVIEW')).toBe(true);
  });
  it('rejects malformed fields without leaking CSV cell values to issues',()=>{
    const bad=Papa.unparse([['과목명',...COURSE_CSV_HEADERS.slice(1)],['RAW_PRIVATE_FAKE','','가상','3','교양','이수완료']]);
    const r=validateCourseCsv(bad);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.issues)).not.toContain('RAW_PRIVATE_FAKE');
  });
  it('accepts exactly four structurally valid synthetic Forms respondents',()=>{
    const r=validateFormsCsv('\uFEFF'+forms(),options);
    expect(r.ok).toBe(true);
    expect(r.rowCount).toBe(4);
    expect(r.participants.map(x=>x.subjectKey)).toEqual(subjects);
    expect(r.participants.every(x=>x.consent.teamReview==='GRANTED')).toBe(true);
  });
  it('blocks unknown/missing/duplicate synthetic respondent identities',()=>{
    expect(validateFormsCsv(forms(names.slice(0,3)),options).issues.some(x=>x.code==='MISSING_PERSON')).toBe(true);
    expect(validateFormsCsv(forms([names[0]!,names[0]!,names[2]!,names[3]!]),options).issues.some(x=>x.code==='DUPLICATE_PERSON')).toBe(true);
    expect(validateFormsCsv(forms([names[0]!,names[1]!,names[2]!,'가상학생미등록']),options).issues.some(x=>x.code==='UNMAPPED_PERSON')).toBe(true);
  });
  it('supports explicit owner-confirmed alias without hard-coding personal mapping',()=>{
    const aliasOptions={...options,subjectByDisplayName:{...options.subjectByDisplayName,'가상별명':'SYNA'}};
    const r=validateFormsCsv(forms(['가상별명',names[1]!,names[2]!,names[3]!]),aliasOptions);
    expect(r.ok).toBe(true);
    expect(r.participants[0]?.subjectKey).toBe('SYNA');
  });
  it('accepts exact YES/NO exported Forms choices without turning refusal into permission',()=>{
    const yes=validateFormsCsv(Papa.unparse([Array.from(FORMS_HEADERS),...names.map(n=>row(n,'YES'))]),options);
    expect(yes.ok).toBe(true);
    expect(yes.participants.every(x=>Object.values(x.consent).every(v=>v==='GRANTED'))).toBe(true);
    const denied=row(names[0]!,'YES');denied[3]='NO';
    const mixed=validateFormsCsv(Papa.unparse([Array.from(FORMS_HEADERS),denied,
      ...names.slice(1).map(n=>row(n,'YES'))]),options);
    expect(mixed.ok).toBe(true);expect(mixed.participants[0]?.consent.externalAi).toBe('DENIED');
    expect(mixed.participants[0]?.consent.ncpStorage).toBe('GRANTED');
    const unrecognized=row(names[0]!,'YES');unrecognized[3]='OWNER APPROVED';
    const blocked=validateFormsCsv(Papa.unparse([Array.from(FORMS_HEADERS),unrecognized,
      ...names.slice(1).map(n=>row(n,'YES'))]),options);
    expect(blocked.ok).toBe(false);
    expect(blocked.issues.some(x=>x.code==='CONSENT_UNKNOWN')).toBe(true);
    expect(JSON.stringify(blocked.issues)).not.toContain('OWNER APPROVED');
  });
  it('blocks ambiguous consent and preserves a refusal as non-authorization',()=>{
    const unknown=Papa.unparse([Array.from(FORMS_HEADERS),row(names[0]!,'미확인'),...names.slice(1).map(n=>row(n))]);
    expect(validateFormsCsv(unknown,options).issues.some(x=>x.code==='CONSENT_UNKNOWN')).toBe(true);
    const refused=Papa.unparse([Array.from(FORMS_HEADERS),row(names[0]!,'아니요'),...names.slice(1).map(n=>row(n))]);
    const out=validateFormsCsv(refused,options);
    expect(out.participants[0]?.consent.ncpStorage).toBe('DENIED');
    // A well-formed refusal is allowed. Sharing still requires separate SharingGrant.
  });
  it('makes a complete, synthetic-only four-person intake bundle available for human preview',()=>{
    const csvs=Object.fromEntries(subjects.map(k=>[k,course]));
    const r=validateIntakeBundle({formsCsv:forms(),courseCsvBySubject:csvs,formsOptions:options});
    expect(r.ready).toBe(true);
    expect(Object.keys(r.courses)).toHaveLength(4);
  });
  it('reports incomplete/missing fourth person rather than inventing a CSV',()=>{
    const csvs={SYNA:course,SYNB:course,SYNC:course};
    const r=validateIntakeBundle({formsCsv:forms(),courseCsvBySubject:csvs,formsOptions:options});
    expect(r.ready).toBe(false);
    expect(r.issues.some(x=>x.code==='MISSING_PERSON')).toBe(true);
  });
  it('rejects unregistered fifth student in submitted bundle',()=>{
    const csvs={SYNA:course,SYNB:course,SYNC:course,SYND:course,UNREGISTERED:course};
    const r=validateIntakeBundle({formsCsv:forms(),courseCsvBySubject:csvs,formsOptions:options});
    expect(r.ready).toBe(false);
    expect(r.issues.some(x=>x.code==='UNEXPECTED_PERSON')).toBe(true);
  });
});
