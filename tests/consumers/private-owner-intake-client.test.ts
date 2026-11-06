import {describe,expect,it} from 'vitest';
import {makeApiError} from '@hufs-one/contracts';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';

const sample={
  state:'STUDENT_REVIEW_PENDING' as const,
  profile:{primaryMajor:'합성 전공',secondaryMajor:null,secondaryType:'NONE',campus:'가상 캠퍼스',cohort:'2025',
    earnedCreditsSelfReported:'3',inProgressCreditsSelfReported:'0',interestsSelfReported:'합성 관심'},
  transcript:{state:'STUDENT_REVIEW_PENDING' as const,version:1,issueCodes:[],
    records:[{term:'2026-1',courseCode:'',courseName:'합성 과목',creditUnits:6,category:'전공',ledger:'EARNED' as const}]},
  offeringStatus:'UNKNOWN' as const,rulesStatus:'NEEDS_REVIEW' as const,
};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{'content-type':'application/json'},
});
describe('BETA owner CSV intake browser client',()=>{
  it('requests only the authenticated owner endpoint with no browser-selected user or cache',async()=>{
    const calls:Array<{url:string;init:RequestInit}>=[];
    const client=new HufsApiClient(async(url,init)=>{calls.push({url,init});return json(sample);});
    const signal=new AbortController().signal;
    expect(await client.owner.getPrivateIntake(signal)).toEqual(sample);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/private-intake/self');
    expect(calls[0]?.init).toMatchObject({method:'GET',signal,cache:'no-store',
      credentials:'same-origin',redirect:'error',mode:'same-origin'});
    expect(JSON.stringify(calls[0])).not.toMatch(/actorId|subjectKey|courseFilename|formsCsv/);
  });
  it('rejects extra private metadata, invented official readiness and malformed transcript',async()=>{
    for(const bad of [
      {...sample,actorId:'SYN-OTHER-USER'},
      {...sample,rulesStatus:'APPROVED'},
      {...sample,transcript:{...sample.transcript,state:'NEEDS_REVIEW',records:[]}},
    ]){
      const client=new HufsApiClient(async()=>json(bad));
      await expect(client.owner.getPrivateIntake()).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
    }
  });
  it('never uses synthetic fallback on absent permission, signed-out or disconnected server',async()=>{
    for(const [status,code] of [[401,'UNAUTHENTICATED'],[403,'FORBIDDEN'],[503,'PROVIDER_UNAVAILABLE']] as const){
      const client=new HufsApiClient(async()=>json(makeApiError(code,'SYN-REQUEST'),status));
      await expect(client.owner.getPrivateIntake()).rejects.toMatchObject({code,status});
    }
  });
});
