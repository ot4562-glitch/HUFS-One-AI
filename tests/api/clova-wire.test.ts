import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {buildOcrRequest,parseOcrResponse,buildHcxRequest,parseHcxResponse,ClovaWireError} from '../../packages/ai/src/clova-wire.js';
import type {SafeLlmPacket} from '@hufs-one/contracts';

const bytes=Buffer.from('synthetic-image-bytes');
const sha=createHash('sha256').update(bytes).digest('hex');
const media={bytes,originalSha256:sha,sourceRevisionId:'rev-1',assetId:'asset-1',
  format:'png' as const,width:100,height:200,transformVersion:'identity-1'};
const requestId='00000000-0000-4000-8000-000000000001';
const packet:SafeLlmPacket={packetId:'packet-1',task:'opportunity_terms',providerInputClass:'SYNTHETIC_CLEARED',
  sourceTokens:[{token:'DOC1',paragraphs:[{id:'p1',text:'가상 프로그램 학생 신청마감 11월 5일. 관리자 제출 11월 6일.'}]}],
  allowedTopicCodes:['DATA_ANALYTICS'],allowedObjectTokens:['ACTION1'],approvedFacts:[],schemaVersion:'1',promptVersion:'1'};
const candidate=()=>({task:'opportunity_terms',reviewRequired:true,citations:[{
  sourceToken:'DOC1',paragraphId:'p1',quote:'학생 신청마감 11월 5일',topicCode:'DATA_ANALYTICS'}],objectTokens:['ACTION1']});
const ocr=()=>({version:'V2',requestId,timestamp:1,images:[{uid:'provider-image',name:'image',inferResult:'SUCCESS',fields:[{
  inferText:'학생 신청마감',inferConfidence:0.99,type:'NORMAL',lineBreak:true,
  boundingPoly:{vertices:[{x:10,y:20},{x:90,y:20},{x:90,y:40},{x:10,y:40}]},
}]}]});
const hcx=()=>({status:{code:'20000',message:'OK'},result:{message:{role:'assistant',content:JSON.stringify(candidate())},
  finishReason:'stop',usage:{promptTokens:40,completionTokens:20,totalTokens:60}}});

describe('offline CLOVA wire adapters',()=>{
  it('builds OCR V2 bytes-only requests and binds exact image identity without sending owner identifiers',()=>{
    const req=buildOcrRequest(media,requestId,1);
    expect(req.body).toEqual({version:'V2',requestId,timestamp:1,lang:'ko',enableTableDetection:false,
      images:[{format:'png',name:'image',data:bytes.toString('base64')}]});
    expect(JSON.stringify(req.body)).not.toContain('rev-1');
    const result=parseOcrResponse(req.context,ocr());
    expect(result.reviewState).toBe('NEEDS_REVIEW');
    expect(result.lines[0]).toMatchObject({text:'학생 신청마감',pageIndex:0,
      bboxNorm:[0.1,0.1,0.9,0.2],originalSha256:sha,sourceRevisionId:'rev-1',assetId:'asset-1'});
    expect(result.lines[0]?.vertices).toHaveLength(4);
  });
  it.each(['hash','width','format','requestId','timestamp'] as const)('rejects invalid OCR request %s',field=>{
    expect(()=>buildOcrRequest({...media,...(field==='hash'?{originalSha256:'0'.repeat(64)}:{}),
      ...(field==='width'?{width:0}:{}),...(field==='format'?{format:'pdf'}:{})} as typeof media,
      field==='requestId'?'actor-email@example.test':requestId,field==='timestamp'?-1:1)).toThrow(ClovaWireError);
  });
  it.each(['request','name','version','empty','missingFields','failed','extraPage','conversion','checkbox'] as const)(
    'refuses OCR %s without dropping an image or field',kind=>{
      const raw:any=ocr();
      if(kind==='request')raw.requestId='other';
      if(kind==='name')raw.images[0].name='other';
      if(kind==='version')raw.version='V1';
      if(kind==='empty')raw.images[0].fields=[];
      if(kind==='missingFields')delete raw.images[0].fields;
      if(kind==='failed')raw.images[0].inferResult='FAILURE';
      if(kind==='extraPage')raw.images.push({...raw.images[0]});
      if(kind==='conversion')raw.images[0].convertedImageInfo={width:100,height:200,pageIndex:1};
      if(kind==='checkbox')raw.images[0].fields[0].type='CHECKBOX';
      expect(()=>parseOcrResponse(buildOcrRequest(media,requestId,1).context,raw)).toThrow(ClovaWireError);
    });
  it.each(['negative','outside','nan','zero','crossed','collinear','text','confidence'] as const)('refuses OCR %s geometry/content',kind=>{
    const raw:any=ocr(),f=raw.images[0].fields[0];
    if(kind==='negative')f.boundingPoly.vertices[0].x=-1;
    if(kind==='outside')f.boundingPoly.vertices[1].x=101;
    if(kind==='nan')f.boundingPoly.vertices[0].x=NaN;
    if(kind==='zero')f.boundingPoly.vertices.forEach((p:any)=>p.x=10);
    if(kind==='crossed')[f.boundingPoly.vertices[1],f.boundingPoly.vertices[2]]=[f.boundingPoly.vertices[2],f.boundingPoly.vertices[1]];
    if(kind==='collinear')f.boundingPoly.vertices=[{x:1,y:1},{x:2,y:2},{x:3,y:3},{x:4,y:4}];
    if(kind==='text')f.inferText='';
    if(kind==='confidence')f.inferConfidence=1.5;
    expect(()=>parseOcrResponse(buildOcrRequest(media,requestId,1).context,raw)).toThrow(ClovaWireError);
  });
  it('builds HCX-007 from the existing safe packet with fixed schema and no tools',()=>{
    const req=buildHcxRequest({packet,model:'HCX-007',maxOutputTokens:800});
    expect(req.path).toBe('/v3/chat-completions/HCX-007');
    expect(req.body).toHaveProperty('responseFormat.type','json');
    expect(req.body).not.toHaveProperty('tools');
    expect(JSON.stringify(req.body)).not.toContain('pattern');
    expect(parseHcxResponse(req.context,hcx())).toMatchObject({reviewState:'NEEDS_REVIEW',
      task:packet.task,usage:{promptTokens:40,completionTokens:20,totalTokens:60}});
  });
  it('routes images through independent OCR and keeps HCX-007 text-only',()=>{
    const ocrRequest=buildOcrRequest(media,requestId,1);
    expect(ocrRequest.body.images[0]?.data).toBe(bytes.toString('base64'));
    const textRequest=buildHcxRequest({packet,model:'HCX-007',maxOutputTokens:800});
    expect(textRequest.body).toHaveProperty('responseFormat.type','json');
    expect(JSON.stringify(textRequest.body)).not.toContain('data:image/');
    expect(()=>buildHcxRequest({packet,model:'HCX-007',maxOutputTokens:800,media})).toThrow(ClovaWireError);
    const retired={packet,model:'HCX-005',maxOutputTokens:800,media} as unknown as Parameters<typeof buildHcxRequest>[0];
    expect(()=>buildHcxRequest(retired)).toThrow(ClovaWireError);
  });
  it.each(['wrongTask','quote','blankQuote','source','topic','object','verified','truncated','tools','usage','overBudget','status','json'] as const)(
    'refuses HCX %s',kind=>{
      const raw:any=hcx(),c:any=candidate();
      if(kind==='wrongTask')c.task='experience_skills';
      if(kind==='quote')c.citations[0].quote='지원자 전원 합격';
      if(kind==='blankQuote')c.citations[0].quote=' ';
      if(kind==='source')c.citations[0].sourceToken='OTHER';
      if(kind==='topic')c.citations[0].topicCode='UNLISTED';
      if(kind==='object')c.objectTokens=['OTHER'];
      if(kind==='verified')c.reviewRequired=false;
      if(kind==='truncated')raw.result.finishReason='length';
      if(kind==='tools')raw.result.message.toolCalls=[{id:'x'}];
      if(kind==='usage')raw.result.usage.totalTokens=61;
      if(kind==='overBudget')raw.result.usage={promptTokens:40,completionTokens:801,totalTokens:841};
      if(kind==='status')raw.status.code='50000';
      raw.result.message.content=kind==='json'?'not json':JSON.stringify(c);
      expect(()=>parseHcxResponse(buildHcxRequest({packet,model:'HCX-007',maxOutputTokens:800}).context,raw)).toThrow(ClovaWireError);
    });
  it('snapshots the packet so later caller mutation cannot change accepted citations',()=>{
    const copy=structuredClone(packet),req=buildHcxRequest({packet:copy,model:'HCX-007',maxOutputTokens:800});
    copy.sourceTokens[0]!.paragraphs[0]!.text='different';
    expect(parseHcxResponse(req.context,hcx()).reviewState).toBe('NEEDS_REVIEW');
  });
  it.each(['zeroPrompt','zeroCompletion','contextOverflow'] as const)('refuses HCX invalid usage %s',kind=>{
    const raw=hcx();
    if(kind==='zeroPrompt')raw.result.usage={promptTokens:0,completionTokens:20,totalTokens:20};
    if(kind==='zeroCompletion')raw.result.usage={promptTokens:40,completionTokens:0,totalTokens:40};
    if(kind==='contextOverflow')raw.result.usage={promptTokens:128000,completionTokens:20,totalTokens:128020};
    const context=buildHcxRequest({packet,model:'HCX-007',maxOutputTokens:800}).context;
    expect(()=>parseHcxResponse(context,raw)).toThrow(ClovaWireError);
  });
  it('uses bounded opaque errors without echoing raw provider output',()=>{
    const raw:any=hcx();raw.result.message.content='secret-marker';
    try{parseHcxResponse(buildHcxRequest({packet,model:'HCX-007',maxOutputTokens:800}).context,raw);throw Error('expected failure');}
    catch(e){expect(e).toBeInstanceOf(ClovaWireError);expect(String(e)).not.toContain('secret-marker');}
  });
});
