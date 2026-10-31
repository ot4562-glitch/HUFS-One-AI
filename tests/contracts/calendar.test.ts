import {describe,it,expect} from 'vitest';
import {CalendarResultSchema,validateCalendarWire} from '@hufs-one/contracts';

const ASOF='2026-11-20T00:00:00.000Z';
const record={
  asOf:ASOF,from:'2026-11-13T00:00:00.000Z',to:'2027-01-19T00:00:00.000Z',
  entries:[
    {
      id:'NOTICE:GRAD:STUDENT_DEADLINE:0',source:'NOTICE',refId:'GRAD',
      title:'합성 졸업 신청',kind:'STUDENT_DEADLINE',importance:'REQUIRED',
      at:'2026-11-19T00:00:00.000Z',seoulDate:'2026-11-19',
      overdue:true,evidenceRefs:['EV-SYN-1'],
    },
    {
      id:'NOTICE:EXAM:EVENT:0',source:'NOTICE',refId:'EXAM',title:'합성 졸업시험',
      kind:'EVENT',importance:'REQUIRED',at:'2026-11-21T00:00:00.000Z',
      end:'2026-11-21T02:00:00.000Z',seoulDate:'2026-11-21',
      overdue:false,evidenceRefs:['EV-SYN-2'],
    },
    {
      id:'OPPORTUNITY:OP1:APPLY_DEADLINE:0',source:'OPPORTUNITY',refId:'OP1',
      title:'합성 추천 공고',kind:'APPLY_DEADLINE',importance:'RECOMMENDED',
      at:'2026-11-25T00:00:00.000Z',seoulDate:'2026-11-25',
      overdue:false,evidenceRefs:['EV-SYN-3'],
    },
  ],
  undated:[{source:'OPPORTUNITY',refId:'OP2',title:'가상 상시모집',reason:'ROLLING',importance:'SAVED'}],
  needsConfirmation:[{refId:'GRAD-UNKNOWN',title:'확인 필요',unknownScope:['academicStatus']}],
  ambiguousNoticeIds:['DUPLICATE-INPUT'],
};
const changed=(entry:Record<string,unknown>)=>({...record,entries:[{...record.entries[0],...entry},...record.entries.slice(1)]});

describe('TASK-00 #52 calendar wire: strict scoped derived result',()=>{
  it('roundtrips a bounded synthetic calendar with confirmed deadlines, events and unknowns',()=>{
    const x=CalendarResultSchema.parse(record);
    expect(JSON.parse(JSON.stringify(x))).toEqual(x);
    expect(x.needsConfirmation[0]).not.toHaveProperty('at');
    expect(x.needsConfirmation[0]).not.toHaveProperty('importance');
    expect(validateCalendarWire(x,ASOF)).toEqual(x);
    expect(validateCalendarWire(x,'2026-11-20T09:00:00+09:00')).toEqual(x);
  });
  it('rejects pretending a past student deadline is not overdue',()=>{
    expect(CalendarResultSchema.safeParse(changed({overdue:false})).success).toBe(false);
    expect(CalendarResultSchema.safeParse(changed({kind:'EVENT',overdue:true})).success).toBe(false);
  });
  it('never accepts an ended event, backwards interval, or fabricated Seoul date',()=>{
    const past=changed({kind:'EVENT',at:'2026-11-18T00:00:00.000Z',seoulDate:'2026-11-18',overdue:false});
    expect(CalendarResultSchema.safeParse(past).success).toBe(false);
    expect(CalendarResultSchema.safeParse(changed({seoulDate:'2026-11-20'})).success).toBe(false);
    expect(CalendarResultSchema.safeParse(changed({kind:'EVENT',end:'2026-11-18T00:00:00.000Z',overdue:false})).success).toBe(false);
    const day=changed({at:'2026-11-19T15:00:00.000Z',seoulDate:'2026-11-19'});
    expect(CalendarResultSchema.safeParse(day).success).toBe(false); // 00:00 the next Seoul date
  });
  it('rejects mixed source/kind and a reference-to-id mismatch',()=>{
    expect(CalendarResultSchema.safeParse(changed({kind:'APPLY_DEADLINE'})).success).toBe(false);
    expect(CalendarResultSchema.safeParse(changed({refId:'SOMEONE-ELSE'})).success).toBe(false);
    expect(CalendarResultSchema.safeParse(changed({evidenceRefs:['X','X']})).success).toBe(false);
  });
  it('rejects duplicate entries and unknown-scope badge escalation',()=>{
    const dup={...record,entries:[record.entries[0],record.entries[0]]};
    expect(CalendarResultSchema.safeParse(dup).success).toBe(false);
    expect(CalendarResultSchema.safeParse({...record,needsConfirmation:[{refId:'X',title:'확인 필요',unknownScope:['academicStatus'],importance:'CRITICAL'}]}).success).toBe(false);
    expect(CalendarResultSchema.safeParse({...record,needsConfirmation:[{refId:'X',title:'확인 필요',unknownScope:[]}]}).success).toBe(false);
    expect(CalendarResultSchema.safeParse({...record,needsConfirmation:[{refId:'X',title:'확인 필요',unknownScope:['x','x']}]}).success).toBe(false);
  });
  it('refuses an ambiguous notice in any visible part of the result',()=>{
    expect(CalendarResultSchema.safeParse({...record,ambiguousNoticeIds:['GRAD']}).success).toBe(false);
    expect(CalendarResultSchema.safeParse({...record,ambiguousNoticeIds:['GRAD-UNKNOWN']}).success).toBe(false);
    expect(CalendarResultSchema.safeParse({...record,ambiguousNoticeIds:['DUPLICATE-INPUT','DUPLICATE-INPUT']}).success).toBe(false);
  });
  it('rejects invalid window, impossible deadline, stale projection and injected fields',()=>{
    expect(CalendarResultSchema.safeParse({...record,from:'2026-12-01T00:00:00.000Z'}).success).toBe(false);
    expect(CalendarResultSchema.safeParse(changed({at:'2026-01-01T00:00:00.000Z',seoulDate:'2026-01-01'})).success).toBe(false);
    expect(CalendarResultSchema.safeParse({...record,userEmail:'student@invalid.example'}).success).toBe(false);
    expect(()=>validateCalendarWire(record,'2026-11-21T00:00:00.000Z')).toThrow(RangeError);
    expect(()=>validateCalendarWire(record,'not-an-iso')).toThrow();
  });
});
