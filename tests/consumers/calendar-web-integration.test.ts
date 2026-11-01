import {describe,expect,it} from 'vitest';
import {makeApiError,validateCalendarWire} from '@hufs-one/contracts';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import type {ApiFetch} from '../../apps/web/src/integrations/api-client.js';

// Deliberately fictitious, with no student data or provider access.
const calendar={
  asOf:'2026-11-20T00:00:00.000Z',
  from:'2026-11-13T00:00:00.000Z',
  to:'2026-12-01T00:00:00.000Z',
  entries:[{
    id:'NOTICE:SYN-N1:STUDENT_DEADLINE:0',source:'NOTICE',refId:'SYN-N1',
    title:'합성 신청 마감',kind:'STUDENT_DEADLINE',importance:'REQUIRED',
    at:'2026-11-21T00:00:00.000Z',seoulDate:'2026-11-21',
    overdue:false,evidenceRefs:['EV-SYN-1'],
  }],
  undated:[],
  needsConfirmation:[{refId:'SYN-N2',title:'확인 필요',unknownScope:['academicStatus']}],
  ambiguousNoticeIds:[],
};
const respond=(payload:unknown,status=200):Response=>new Response(JSON.stringify(payload),{
  status,headers:{'content-type':'application/json'},
});

describe('browser calendar client #71 (synthetic, transport-only)',()=>{
  it('fetches the scoped context using same-origin GET, no-store and the caller AbortSignal',async()=>{
    const calls:Array<{url:string;init:RequestInit}>=[];
    const transport:ApiFetch=async(url,init)=>{
      calls.push({url,init});
      return respond(calendar);
    };
    const client=new HufsApiClient(transport);
    const abort=new AbortController();
    const result=await client.getCalendar('SYN_CTX-01',abort.signal);
    expect(result).toEqual(calendar);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/demo/contexts/SYN_CTX-01/calendar');
    expect(calls[0]!.init).toMatchObject({
      method:'GET',credentials:'same-origin',cache:'no-store',
      mode:'same-origin',redirect:'error',referrerPolicy:'no-referrer',
    });
    expect(calls[0]!.init.signal).toBe(abort.signal);
    expect(calls[0]!.init.body).toBeUndefined();
    expect((calls[0]!.init.headers as Record<string,string>))
      .toEqual({accept:'application/json'});
  });

  it('refuses invalid context IDs before any network request',async()=>{
    let calls=0;
    const client=new HufsApiClient(async()=>{
      calls++;
      throw new Error('No network expected');
    });
    for(const invalid of ['', '../other', 'CTX/other', 'CTX?scope=admin',
      'https://evil.invalid','a'.repeat(101)]){
      await expect(client.getCalendar(invalid)).rejects.toMatchObject({
        code:'INVALID_INPUT',status:422,
      });
    }
    expect(calls).toBe(0);
  });

  it.each([
    ['UNAUTHENTICATED',401],
    ['SHARING_REVOKED',403],
    ['VERSION_CONFLICT',409],
    ['PROVIDER_UNAVAILABLE',503],
  ] as const)('preserves authorized API error %s/%i without exposing response details',
    async(code,status)=>{
      const client=new HufsApiClient(async()=>respond(makeApiError(code,'SYN-REQ-01'),status));
      await expect(client.getCalendar('SYN-CTX')).rejects.toMatchObject({code,status});
    });

  it('fails closed on malformed wire, unknown-scope escalation or private fields',async()=>{
    for(const invalid of [
      {...calendar,asOf:'invalid'},
      {...calendar,studentEmail:'synthetic@hufs.ac.kr'},
      {...calendar,needsConfirmation:[{
        ...calendar.needsConfirmation[0],importance:'CRITICAL',
      }]},
      {...calendar,entries:[{...calendar.entries[0],overdue:true}]},
    ]){
      const client=new HufsApiClient(async()=>respond(invalid));
      await expect(client.getCalendar('SYN-CTX')).rejects.toMatchObject({
        code:'PROVIDER_UNAVAILABLE',status:503,
      });
    }
  });

  it('keeps snapshot-asOf verification mandatory at the UI boundary',async()=>{
    const client=new HufsApiClient(async()=>respond(calendar));
    const payload=await client.getCalendar('SYN-CTX');
    expect(validateCalendarWire(payload,calendar.asOf)).toEqual(calendar);
    expect(()=>validateCalendarWire(payload,'2026-11-21T00:00:00.000Z'))
      .toThrow(RangeError);
  });

  it('propagates aborts and masks raw transport failures',async()=>{
    const aborted=new HufsApiClient(async()=>{
      const error=new Error('signal-aborted');
      error.name='AbortError';
      throw error;
    });
    await expect(aborted.getCalendar('SYN-CTX')).rejects.toMatchObject({
      name:'AbortError',
    });
    const failed=new HufsApiClient(async()=>{
      throw new Error('sensitive SQL adapter details');
    });
    await expect(failed.getCalendar('SYN-CTX')).rejects.toMatchObject({
      code:'PROVIDER_UNAVAILABLE',status:503,
    });
  });
});
