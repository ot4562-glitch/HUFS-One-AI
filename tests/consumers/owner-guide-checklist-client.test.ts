import {it,expect} from 'vitest';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {FIXED_NOW,guide} from '../../packages/core/src/feature-additions/v2.fixtures.js';
import {resolveInternationalGuide} from '../../packages/core/src/feature-additions/international-v2.js';
const current=guide(),resolved=resolveInternationalGuide({guide:current,locale:'zh',topicCode:current.topicCode,
  campus:'SEOUL',term:'2026-2',audienceCodes:['INTERNATIONAL_STUDENT'],asOf:FIXED_NOW});
const view={state:'READY',guide:resolved,translationVersion:'zh-r1',contextVersion:'a'.repeat(64),version:1,
  checklist:{state:'READY',checkedStepIds:['step-1'],invalidatedStepIds:[],officialAdministrationComplete:false}};
const input={expectedVersion:0,locale:'zh' as const,displayedLocale:'zh' as const,
  guideRevisionId:resolved.sourceRevisionId,translationVersion:'zh-r1',contextVersion:'a'.repeat(64),checkedStepIds:['step-1']};
function harness(response:unknown){
  const calls:{url:string;init:RequestInit}[]=[];
  const client=new HufsApiClient(async(url,init)=>{calls.push({url,init});
    return new Response(JSON.stringify(url==='/api/auth/csrf'?{csrfToken:'C'.repeat(32)}:response),
      {headers:{'content-type':'application/json'}});});return {client,calls};
}
it('reads the selected locale and sends exact CAS/translation binding with fresh CSRF',async()=>{
  const h=harness(view);expect(await h.client.owner.getOwnerGuideChecklist(current.id,'zh')).toEqual(view);
  expect(h.calls[0]!.url).toBe('/api/owner/features/v2/international/'+current.id+'/checklist?locale=zh');
  expect(await h.client.owner.saveOwnerGuideChecklist(current.id,input)).toEqual(view);
  expect(h.calls.at(-1)!.init).toMatchObject({method:'PUT',body:JSON.stringify(input),headers:{'x-csrf-token':'C'.repeat(32)}});
});
it('rejects mismatched server acknowledgements and refuses generic checklist CRUD',async()=>{
  for(const response of [{...view,version:2},{...view,translationVersion:'SYN-FOREIGN'},
    {...view,guide:{...resolved,guideId:'SYN-OTHER'}},{...view,checklist:{...view.checklist,checkedStepIds:[]}}]){
    const h=harness(response);await expect(h.client.owner.saveOwnerGuideChecklist(current.id,input)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  }
  const h=harness(view);await expect(h.client.owner.listWorkspace('GUIDE_CHECKLIST')).rejects.toBeDefined();
  expect(h.calls).toEqual([]);
});
