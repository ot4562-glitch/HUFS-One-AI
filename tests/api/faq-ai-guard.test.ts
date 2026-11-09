import {afterEach,describe,expect,it,vi} from 'vitest';
import {FaqAskResponseSchema} from '@hufs-one/contracts';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import type {CampusAssistServices} from '../../apps/api/src/modules/campus-assist-http.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {FAQ_EVAL_DOCUMENTS} from '../../packages/core/src/campus-assist/faq-eval.fixtures.js';
const NOW='2026-11-08T00:00:00Z',ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const receipt={actorId:actor.actorId,sourceVersion:'SYN-EVAL-1',expiresAt:'2026-12-01T00:00:00Z'};
type Provider=NonNullable<CampusAssistServices['hcx007']>;
type Wire=Parameters<Provider['execute']>[0]['wire'];
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(a=>a.close()));});
/** Offline stand-in for HCX-007: answers from the first context paragraph it was given. No network. */
function fakeModel(answer:(text:string)=>{answer:string;quote:string}):Provider&{prompts:string[]}{
  const prompts:string[]=[];
  return {prompts,admit:vi.fn(async()=>true),execute:vi.fn(async({wire}:{wire:Wire})=>{
    prompts.push(JSON.stringify(wire));
    const first=JSON.parse(wire.body.messages[1]!.content).context[0];
    const a=answer(first.text);
    return {status:{code:'20000'},result:{finishReason:'stop',message:{role:'assistant',content:JSON.stringify({
      answer:a.answer,citations:[{citationId:first.citationId,quote:a.quote}],needsHumanConfirmation:true,
      suggestedLinks:['/exchange']})},usage:{promptTokens:100,completionTokens:50,totalTokens:150}}};
  })};
}
function ask(provider:Provider,question:string){
  const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,now:()=>NOW,
    auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
    campusAssist:{faq:{read:async()=>({items:FAQ_EVAL_DOCUMENTS,receipt}),revalidate:async()=>true},hcx007:provider}});
  apps.push(app);
  return app.inject({method:'POST',url:'/api/owner/faq/ask',headers:{origin:ORIGIN,'x-csrf-token':actor.csrfToken},
    payload:{asOf:NOW,question}});
}
const grounded=fakeModel(()=>({answer:'가상 교환학생 지원자는 총평점평균 3.0 이상이어야 합니다.',
  quote:'총평점평균 3.0 이상이어야 합니다.'}));

describe('#341 FAQ route with the AI guard (offline fake model, synthetic documents)',()=>{
  it('returns a schema-valid NEEDS_REVIEW answer and never sends the student number to the model',async()=>{
    const r=await ask(grounded,'제 학번 202312345인데 교환학생은 평점이 몇이에요?');
    expect(r.statusCode).toBe(200);
    const body=FaqAskResponseSchema.parse(r.json());
    expect(body.status).toBe('NEEDS_REVIEW');
    expect(grounded.prompts.at(-1)).not.toContain('202312345');
    expect(grounded.prompts.at(-1)).toContain('[학번]');
  });
  it('withholds a personal eligibility verdict even when its quote is genuine',async()=>{
    const model=fakeModel(()=>({answer:'입력하신 조건이면 교환학생 지원 자격을 충족하여 합격 가능합니다.',
      quote:'총평점평균 3.0 이상이어야 합니다.'}));
    const r=await ask(model,'교환학생 평점 기준');
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(r.body).toContain('UNVERIFIED_EVIDENCE');
    expect(r.body).not.toContain('합격');
  });
  it('withholds an answer whose only quote is one character',async()=>{
    const model=fakeModel(()=>({answer:'가상 교환학생 지원자는 총평점평균 3.0 이상이어야 합니다.',quote:'.'}));
    const r=await ask(model,'교환학생 평점 기준');
    expect(r.body).toContain('UNVERIFIED_EVIDENCE');
  });
  it('maps a model transport failure to PROVIDER_UNAVAILABLE',async()=>{
    const model:Provider={admit:vi.fn(async()=>true),execute:vi.fn(async()=>{throw new Error('timeout');})};
    const r=await ask(model,'교환학생 평점 기준');
    expect(r.body).toContain('PROVIDER_UNAVAILABLE');
  });
  it('does not call the billable model when admission is refused',async()=>{
    const model:Provider={admit:vi.fn(async()=>false),execute:vi.fn()};
    const r=await ask(model,'교환학생 평점 기준');
    expect(r.body).toContain('RATE_LIMITED');
    expect(model.execute).not.toHaveBeenCalled();
  });
  it('answers an off-topic question with NOT_FOUND before any admission or model call',async()=>{
    const model:Provider={admit:vi.fn(async()=>true),execute:vi.fn()};
    const r=await ask(model,'학교 식당 메뉴 알려주세요');
    expect(r.json().status).toBe('NOT_FOUND');
    expect(model.admit).not.toHaveBeenCalled();
    expect(model.execute).not.toHaveBeenCalled();
  });
});
