import {describe,it,expect} from 'vitest';
import {DemoContextSchema,DemoSnapshotSchema,SharingGrantSchema,ApiErrorSchema,makeApiError,httpStatusForError,SafeLlmPacketSchema,AI_TASK_PATHS,validateIntakeBundle,COURSE_CSV_HEADERS,FORMS_HEADERS} from '@hufs-one/contracts';
import Papa from 'papaparse';
import {fixture} from '../contracts/helpers.js';

describe('Consumer 4: API/CLOVA/NCP boundary (offline synthetic)',()=>{
  it('parses the shared actor/subject context and snapshot for HTTP serialization',()=>{
    const ctx=DemoContextSchema.parse(fixture('synthetic/demo-context.json'));
    const snap=DemoSnapshotSchema.parse(fixture('synthetic/demo-snapshot.json'));
    expect(ctx.actorId).not.toBe(ctx.demoSubjectId);
    expect(snap.contextId).toBe(ctx.contextId);
  });
  it('generates safe 401/403/409/422/429/503 envelopes, never raw errors',()=>{
    for(const code of ['UNAUTHENTICATED','SHARING_REVOKED','VERSION_CONFLICT','INVALID_INPUT','RATE_LIMITED','PROVIDER_UNAVAILABLE'] as const){
      const res=makeApiError(code,'SYN-REQ-API');
      expect(ApiErrorSchema.safeParse(res).success).toBe(true);
      expect([401,403,409,422,429,503]).toContain(httpStatusForError(res));
    }
  });
  it('makes SharingGrant required for demo projection but not raw access',()=>{
    const ctx=DemoContextSchema.parse(fixture('synthetic/demo-context.json'));
    const grant={grantId:'SYN-G',actorId:ctx.actorId,demoSubjectId:ctx.demoSubjectId,allowedSections:['FEED','NOTICES'],displayNameAllowed:false,recordingAllowed:false,version:'G1',expiresAt:ctx.expiresAt};
    expect(SharingGrantSchema.safeParse(grant).success).toBe(true);
    expect(SharingGrantSchema.safeParse({...grant,allowedSections:['COURSE_RAW']}).success).toBe(false);
  });
  it('never treats malformed AI job or fourth-party data as a valid safe packet',()=>{
    expect(Object.values(AI_TASK_PATHS)).toHaveLength(4);
    expect(SafeLlmPacketSchema.safeParse(fixture('synthetic/safe-llm-packet.json')).success).toBe(true);
    expect(SafeLlmPacketSchema.safeParse(fixture('negative/unsafe-llm-packet.json')).success).toBe(false);
  });
  it('does not accept real data from an unapproved fourth/fifth student on its own',()=>{
    const opts={expectedSubjectKeys:['SYNA','SYNB','SYNC','SYND'],subjectByDisplayName:{'가상학생가':'SYNA','가상학생나':'SYNB','가상학생다':'SYNC','가상학생라':'SYND'}};
    const form=Papa.unparse([Array.from(FORMS_HEADERS),...Object.keys(opts.subjectByDisplayName).map(n=>FORMS_HEADERS.map((_h,i)=>i===6?n:(i>=1&&i<=5?'예':'')))]);
    const sample=Papa.unparse([Array.from(COURSE_CSV_HEADERS),['2026-1','','가상','3','교양','이수완료']]);
    const report=validateIntakeBundle({formsCsv:form,formsOptions:opts,courseCsvBySubject:{SYNA:sample,SYNB:sample,SYNC:sample}});
    expect(report.ready).toBe(false);
    expect(report.issues.some(i=>i.code==='MISSING_PERSON')).toBe(true);
  });
});
