import {describe,expect,it} from 'vitest';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {
  ReviewerSandboxClientActionSchema,ReviewerSandboxClientResultSchema,
} from '../../apps/web/src/integrations/reviewer-sandbox-contract.js';
import {ReviewerSandboxActionSchema} from '../../apps/api/src/modules/auth/reviewer-sandbox.js';
import contextFixture from '../../packages/fixtures/synthetic/demo-context.json';

const context=contextFixture as Parameters<HufsApiClient['readReviewerActions']>[0];
const csrfToken='C'.repeat(32);
const respond=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{
  status,headers:{'content-type':'application/json'},
});
const actions=[
  {kind:'BOOKMARK',itemId:'SYN-OPP-01',saved:true},
  {kind:'MARK_READ',itemId:'SYN-NOT-01',read:true},
  {kind:'CHECKLIST',requirementId:'SYN-REQ-01',done:true},
  {kind:'EXPERIENCE',experienceId:'SYN-EXP-01',note:'Synthetic experience'},
  {kind:'APPLICATION_DRAFT',opportunityId:'SYN-OPP-01',text:'Synthetic draft'},
  {kind:'SIMULATE_APPLICATION',opportunityId:'SYN-OPP-01'},
  {kind:'SET_INTERESTS',topics:['DATA_ANALYTICS']},
  {kind:'SET_DESIRED_JOBS',topics:['ECONOMIC_RESEARCH']},
  {kind:'PLAN_COURSE',courseId:'SYN-COURSE-01',planned:true},
  {kind:'SET_SEARCH',query:'synthetic'},
  {kind:'SET_NOTIFICATIONS',enabled:true},
  {kind:'RESET_SANDBOX'},
] as const;

describe('reviewer-sandbox browser/backend DTO parity (synthetic only)',()=>{
  it('validates all 12 server-owned action kinds with exact same consumer types',()=>{
    for(const action of actions){
      expect(ReviewerSandboxClientActionSchema.safeParse(action).success)
        .toBe(ReviewerSandboxActionSchema.safeParse(action).success);
      expect(ReviewerSandboxClientActionSchema.safeParse(action).success).toBe(true);
    }
  });

  it('rejects injected real IDs, fifth provider task and unexpected fields on both sides',()=>{
    const bad=[
      {kind:'BOOKMARK',itemId:'REAL-OPP-1',saved:true},
      {kind:'BOOKMARK',itemId:'SYN-OPP-1',saved:true,studentId:'PRIVATE'},
      {kind:'EXPERIENCE',experienceId:'SYN-EX-1',note:'x'.repeat(281)},
      {kind:'APPLICATION_DRAFT',opportunityId:'SYN-OPP-1',text:'x'.repeat(1201)},
      {kind:'SET_INTERESTS',topics:['FAKE_TOPIC']},
      {kind:'SET_DESIRED_JOBS',topics:['PUBLIC_POLICY','DATA_ANALYTICS','AI_ML','SOFTWARE_DEV']},
      {kind:'MODEL_CALL',model:'HCX'},
    ];
    for(const action of bad){
      expect(ReviewerSandboxClientActionSchema.safeParse(action).success).toBe(false);
      expect(ReviewerSandboxActionSchema.safeParse(action).success).toBe(false);
    }
  });

  it('consumes server-issued context-scoped GET and POST without leaking the token into URLs',async()=>{
    const calls:Array<{url:string;init:RequestInit}>=[];
    const expectedAction={kind:'BOOKMARK',itemId:'SYN-OPP-01',saved:true} as const;
    const client=new HufsApiClient(async(url,init)=>{
      calls.push({url,init});
      if(url==='/api/auth/csrf')return respond({csrfToken});
      if(url==='/api/reviewer/demo/contexts/'+context.contextId+'/actions')
        return respond({subjectId:'S01',mode:'SYNTHETIC_SANDBOX',
          actions:init.method==='POST'?[expectedAction]:[]});
      throw new Error('Blocked unexpected endpoint');
    });
    expect((await client.readReviewerActions(context)).actions).toEqual([]);
    const result=await client.saveReviewerAction(context,expectedAction);
    expect(result.actions).toEqual([expectedAction]);
    const post=calls.find(x=>x.init.method==='POST');
    expect(post?.url).toBe('/api/reviewer/demo/contexts/'+context.contextId+'/actions');
    expect((post?.init.headers as Record<string,string>)['x-csrf-token']).toBe(csrfToken);
    expect(post?.init.credentials).toBe('same-origin');
    expect(post?.init.cache).toBe('no-store');
    expect(JSON.parse(post!.init.body as string)).toEqual(expectedAction);
    expect(calls.every(x=>!x.url.includes('SYN-OPP-01'))).toBe(true);
  });

  it('never returns an activity response for another student or real item',async()=>{
    for(const response of [
      {subjectId:'S02',mode:'SYNTHETIC_SANDBOX',actions:[]},
      {subjectId:'S01',mode:'REAL',actions:[]},
      {subjectId:'S01',mode:'SYNTHETIC_SANDBOX',actions:[
        {kind:'BOOKMARK',itemId:'REAL-USER-1',saved:true}]},
      {subjectId:'S01',mode:'SYNTHETIC_SANDBOX',actions:[] as unknown[],
        actorId:'PRIVATE-ACCOUNT'},
    ]){
      const client=new HufsApiClient(async()=>respond(response));
      await expect(client.readReviewerActions(context)).rejects.toMatchObject({
        code:response.subjectId==='S02'?'FORBIDDEN':'PROVIDER_UNAVAILABLE',
      });
    }
  });

  it('rejects unverified actions before calling CSRF or a backend route',async()=>{
    let calls=0;
    const client=new HufsApiClient(async()=>{calls++;throw new Error('never called');});
    await expect(client.saveReviewerAction(context,{
      kind:'BOOKMARK',itemId:'REAL-PRIVATE',saved:true,
    } as never)).rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(calls).toBe(0);
    await expect(client.readReviewerActions({...context,contextId:'../escape'}))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(calls).toBe(0);
  });

  it('blocks malformed sandbox outputs and enforces 200-action cap',()=>{
    expect(ReviewerSandboxClientResultSchema.safeParse({
      subjectId:'S01',mode:'SYNTHETIC_SANDBOX',
      actions:Array.from({length:201},()=>actions[0]),
    }).success).toBe(false);
  });

  it('maps a revoked reviewer invitation to HTTP 403 with no returned actions',async()=>{
    const client=new HufsApiClient(async()=>respond({
      code:'FORBIDDEN',message:'이 정보를 볼 권한이 없습니다.',
      requestId:'SYN-REQ-1',retryable:false,
    },403));
    await expect(client.readReviewerActions(context)).rejects.toMatchObject({
      code:'FORBIDDEN',status:403,
    });
  });
});
