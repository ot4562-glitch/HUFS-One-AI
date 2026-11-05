import {describe,expect,it} from 'vitest';
import {AI_TASK_PATHS,ProviderStoredJobSchema,type AiTask,type SafeLlmPacket} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {createProviderExecutor,type ProviderSnapshot,type ProviderRuntimeOptions,type ProviderStoredResult} from '../../apps/api/src/modules/ai/provider-runtime.js';
import type {AiBudgetEntry} from '../../apps/api/src/modules/ai/budget-postgres.js';
import {buildHcxRequest,parseHcxResponse,validateHcxCandidate,ClovaWireError} from '../../packages/ai/src/clova-wire.js';
import {validateModelCandidate} from '../../apps/api/src/modules/ai/candidate.js';

const schemaVersion='ai-task-result-v1';
const quote='자료 분석 역할로 결과를 정리합니다. 재학생 우선 선발. 신청마감은 11월 5일. 필수 요건을 먼저 확인합니다.';
const evidence=(text:string)=>({text,citationIndexes:[0]});
function input(task:AiTask):SafeLlmPacket {
  return {packetId:'PACKET1',task,providerInputClass:'SYNTHETIC_CLEARED',
    sourceTokens:[{token:'DOC1',paragraphs:[{id:'p1',text:quote}]}],
    allowedTopicCodes:['DATA_ANALYTICS'],allowedObjectTokens:
      task==='personal_action_brief'?['ACTION1','ACTION2']:task==='graduation_explanation'?['REQ1']:[],
    approvedFacts:task==='graduation_explanation'?[{token:'REQ1',key:'remainingCredits',value:12}]:[],
    schemaVersion,promptVersion:'task-results-v1'};
}
function output(task:AiTask):any {
  const result=task==='experience_skills'?{kind:task,skills:[{topicCode:'DATA_ANALYTICS',
    skill:evidence('자료 분석'),role:evidence('결과를 정리합니다')}]}:
    task==='opportunity_terms'?{kind:task,topicCodes:['DATA_ANALYTICS'],
      conditions:[{kind:'PRIORITY',evidence:evidence('재학생 우선 선발')}],
      dates:[{kind:'APPLICATION_DEADLINE',evidence:evidence('신청마감은 11월 5일')}],
      roleSteps:[{role:evidence('자료 분석 역할'),step:evidence('결과를 정리합니다')}]}:
    task==='personal_action_brief'?{kind:task,headline:evidence('필수 요건을 먼저 확인합니다'),
      actions:[{actionToken:'ACTION1',explanation:evidence('자료 분석')},
        {actionToken:'ACTION2',explanation:evidence('필수 요건을 먼저 확인합니다')}]}:
      {kind:task,requirements:[{requirementToken:'REQ1',
        explanation:evidence('필수 요건을 먼저 확인합니다'),factKeys:['remainingCredits']}]};
  return {task,reviewRequired:true,citations:[{sourceToken:'DOC1',paragraphId:'p1',quote}],
    objectTokens:input(task).allowedObjectTokens,result};
}
const tasks:AiTask[]=['experience_skills','opportunity_terms','personal_action_brief','graduation_explanation'];
const response=(candidate:unknown)=>({status:{code:'20000'},result:{finishReason:'stop',
  message:{role:'assistant',content:JSON.stringify(candidate)},
  usage:{promptTokens:80,completionTokens:120,totalTokens:200}}});
const jobId='00000000-0000-4000-8000-000000000001';


describe('task candidates through the authenticated API and executor',()=>{
  it.each(tasks)('preserves %s results through execution, cached reads and source withdrawal',async task=>{
    const now='2026-11-03T00:00:00Z',expires='2026-11-04T00:00:00Z';
    const actor={actorId:'SYN-ACTOR',sessionIdHash:'SYN-SESSION',role:'BETA' as const,
      betaAllowed:true,csrfToken:'C'.repeat(32),sessionExpiresAt:expires,schoolMailProofExpiresAt:expires};
    const packet=input(task);
    const snapshot:ProviderSnapshot={actorId:actor.actorId,sessionIdHash:actor.sessionIdHash,
      inputRef:'INPUT1',operation:'HCX_007',asOf:now,epoch:'E1',grantVersion:'G1',consentVersion:'C1',
      policyVersion:'P1',approvedBy:'SYN-REVIEWER',approvedAt:'2026-11-02T00:00:00Z',expiresAt:expires,packet,
      sources:[{sourceId:'SOURCE1',revisionId:'REV1',permissionRef:'RIGHT1',originalSha256:'a'.repeat(64)}]};
    let authorized=true,row:AiBudgetEntry|undefined,record:ProviderStoredResult|undefined,calls=0;
    const options:ProviderRuntimeOptions={
      enabled:()=>true,liveApproved:()=>true,now:()=>now,timeoutMs:1000,
      authority:{read:async()=>authorized?structuredClone(snapshot):null},
      policy:{version:'PRICE1',approvedBy:'SYN-OPERATOR',approvedAt:'2026-11-02T00:00:00Z',
        expiresAt:expires,inputUnitsPerToken:2,outputUnitsPerToken:3,tokenizerUnits:1,
        ocrImageUnits:10,maxInputTokens:3500,maxOutputTokens:800,framingTokens:0},
      ledger:{
        reserve:async(_actor,request)=>{
          if(row)return {...row,changed:false};
          row={jobId,state:'RESERVED',worstCaseUnits:request.worstCaseUnits,chargedUnits:null,changed:true};
          return {...row};
        },
        transition:async(_actor,request)=>{
          if(!row||request.jobId!==jobId)throw new Error('synthetic ledger mismatch');
          const changed=row.state!==request.action;
          row={...row,state:request.action,chargedUnits:request.action==='SETTLED'?request.actualUnits:null,changed};
          return {...row};
        },
      },
      results:{
        put:async value=>{record=structuredClone(value);},
        get:async(actorId,sessionId,id)=>record&&record.actorId===actorId
          &&record.sessionIdHash===sessionId&&record.jobId===id?structuredClone(record):null,
      },
      transport:{post:async request=>{
        await request.beforeSend();calls++;
        const body=JSON.parse(request.body);
        if(request.stage==='TOKENIZE')return new Response(JSON.stringify({status:{code:'20000'},
          result:{messages:body.messages.map((message:{role:string;content:string})=>({
            role:message.role,content:{type:'text',text:message.content,count:20}})),responseFormat:{count:1}}}));
        return new Response(JSON.stringify(response(output(task))));
      }},
    };
    const executor=createProviderExecutor(options);
    const app=createApi({repository:new MemoryApiRepository({profiles:[],safePackets:[]}),
      allowedOrigin:'https://example.test',verifySession:async()=>actor,now:()=>now,
      realAi:{phaseId:'SYN-PHASE',operation:'HCX_007',executor}});
    try{
      const path=Object.entries(AI_TASK_PATHS).find(([,value])=>value===task)![0];
      const accepted=await app.inject({method:'POST',url:'/api/ai/'+path,
        headers:{cookie:'SYN',origin:'https://example.test','x-csrf-token':actor.csrfToken},
        payload:{packetRef:'INPUT1',idempotencyKey:'KEY00001',asOf:now}});
      expect(accepted.statusCode).toBe(202);
      expect(accepted.json()).toMatchObject({state:'NEEDS_REVIEW',provenance:'LIVE'});
      expect(calls).toBe(2);
      for(let index=0;index<3;index++){
        const cached=await app.inject({url:'/api/ai/jobs/'+jobId,headers:{cookie:'SYN'}});
        expect(cached.statusCode).toBe(200);
        expect(ProviderStoredJobSchema.parse(cached.json()).candidate.result).toEqual(output(task).result);
        expect(cached.headers['cache-control']).toContain('no-store');
      }
      expect(calls).toBe(2);
      authorized=false;
      const withdrawn=await app.inject({url:'/api/ai/jobs/'+jobId,headers:{cookie:'SYN'}});
      expect(withdrawn.statusCode).toBe(403);
      expect(withdrawn.json()).not.toHaveProperty('candidate');
      expect(calls).toBe(2);
    }finally{await app.close();}
  });
});

describe('four task results preserve evidence and code-owned decisions',()=>{
  it.each(tasks)('carries %s through provider, storage DTO and synthetic validation',task=>{
    const packet=input(task),candidate=output(task);
    const request=buildHcxRequest({packet,model:'HCX-007',maxOutputTokens:800});
    const parsed=parseHcxResponse(request.context,response(candidate));
    expect(parsed).toMatchObject({task,result:candidate.result,reviewState:'NEEDS_REVIEW'});
    const stored={jobId,state:'NEEDS_REVIEW',billing:'SETTLED',
      provenance:'CANDIDATE_CACHE',candidate:parsed};
    expect(ProviderStoredJobSchema.parse(stored)).toEqual(stored);
    expect(validateModelCandidate(packet,candidate)).toMatchObject({
      task,result:candidate.result,reviewState:'NEEDS_REVIEW',provenance:'MOCK'});
    const format=request.body.responseFormat as any;
    expect(format.schema.required).toContain('result');
    expect(format.schema.properties.result.properties.kind.enum).toEqual([task]);
    expect(JSON.stringify(format)).not.toMatch(/"pattern"|"oneOf"|"anyOf"|"\$ref"/);
  });

  it.each(tasks)('refuses a generic citation-only answer for the versioned %s packet',task=>{
    const candidate=output(task);delete candidate.result;
    expect(()=>validateHcxCandidate(input(task),candidate)).toThrow(ClovaWireError);
    expect(()=>validateModelCandidate(input(task),candidate)).toThrow();
  });

  it('keeps legacy persisted citation-only candidates readable without accepting new results as legacy',()=>{
    const packet={...input('opportunity_terms'),schemaVersion:'1'};
    const candidate=output(packet.task);delete candidate.result;
    expect(validateHcxCandidate(packet,candidate)).toMatchObject({task:packet.task});
    expect(()=>validateHcxCandidate(packet,output(packet.task))).toThrow(ClovaWireError);
    expect(()=>validateHcxCandidate({...packet,schemaVersion:'ai-task-result-v999'},candidate)).toThrow(ClovaWireError);
  });

  it.each(['differentTask','missingCitation','duplicateCitation','inventedSkill','unlistedTopic','extraDecision'] as const)(
    'refuses an unsupported experience result: %s',kind=>{
      const candidate=output('experience_skills');
      if(kind==='differentTask')candidate.result.kind='opportunity_terms';
      if(kind==='missingCitation')candidate.result.skills[0].skill.citationIndexes=[1];
      if(kind==='duplicateCitation')candidate.result.skills[0].skill.citationIndexes=[0,0];
      if(kind==='inventedSkill')candidate.result.skills[0].skill.text='외부 전문가 인증 보유';
      if(kind==='unlistedTopic')candidate.result.skills[0].topicCode='SOFTWARE_DEV';
      if(kind==='extraDecision')candidate.result.approved=true;
      expect(()=>validateHcxCandidate(input('experience_skills'),candidate)).toThrow(ClovaWireError);
    });

  it.each(['newAction','reorderedActions','omittedAction','duplicateAction','inventedDeadline','inventedEmail'] as const)(
    'cannot change the selected action set or add unsupported text: %s',kind=>{
      const packet=input('personal_action_brief'),candidate=output(packet.task);
      if(kind==='newAction')candidate.result.actions[0].actionToken='ACTION3';
      if(kind==='reorderedActions')candidate.result.actions.reverse();
      if(kind==='omittedAction')candidate.result.actions.pop();
      if(kind==='duplicateAction')candidate.result.actions[1].actionToken='ACTION1';
      if(kind==='inventedDeadline')candidate.result.actions[0].explanation.text='신청마감은 12월 9일';
      if(kind==='inventedEmail')candidate.result.headline.text='student@example.test';
      expect(()=>validateHcxCandidate(packet,candidate)).toThrow(ClovaWireError);
    });

  it.each(['unknownRequirement','unknownFact','duplicateFact','creditCalculation','crossRequirementFact'] as const)(
    'keeps graduation facts and arithmetic outside model output: %s',kind=>{
      const packet=input('graduation_explanation'),candidate=output(packet.task),row=candidate.result.requirements[0];
      if(kind==='unknownRequirement')row.requirementToken='REQ2';
      if(kind==='unknownFact')row.factKeys=['approvedGraduation'];
      if(kind==='duplicateFact')row.factKeys=['remainingCredits','remainingCredits'];
      if(kind==='creditCalculation'){
        row.explanation.text='12학점이면 졸업 가능합니다';
        packet.sourceTokens[0]!.paragraphs[0]!.text+=' 12학점이면 졸업 가능합니다';
        candidate.citations[0].quote=packet.sourceTokens[0]!.paragraphs[0]!.text;
      }
      if(kind==='crossRequirementFact')packet.approvedFacts=[{token:'REQ2',key:'remainingCredits',value:12}];
      expect(()=>validateHcxCandidate(packet,candidate)).toThrow(ClovaWireError);
    });

  it.each(['duplicateSource','duplicateParagraph','duplicateObject','duplicateFact'] as const)(
    'refuses ambiguous versioned packet bindings before building a request: %s',kind=>{
      const packet=input('graduation_explanation');
      if(kind==='duplicateSource')packet.sourceTokens.push(structuredClone(packet.sourceTokens[0]!));
      if(kind==='duplicateParagraph')packet.sourceTokens[0]!.paragraphs.push({...packet.sourceTokens[0]!.paragraphs[0]!});
      if(kind==='duplicateObject')packet.allowedObjectTokens.push('REQ1');
      if(kind==='duplicateFact')packet.approvedFacts.push({token:'REQ1',key:'remainingCredits',value:99});
      expect(()=>buildHcxRequest({packet,model:'HCX-007',maxOutputTokens:800})).toThrow(ClovaWireError);
    });

  it('revalidates a cached result against fresh evidence rather than trusting its stored shape',()=>{
    const packet=input('opportunity_terms'),candidate=output(packet.task);
    expect(validateHcxCandidate(packet,candidate)).toHaveProperty('result');
    packet.sourceTokens[0]!.paragraphs[0]!.text='철회된 문서';
    expect(()=>validateHcxCandidate(packet,candidate)).toThrow(ClovaWireError);
  });
});
