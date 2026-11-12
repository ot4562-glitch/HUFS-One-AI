import {afterEach,it,expect} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {FIXED_NOW,guide} from '../../packages/core/src/feature-additions/v2.fixtures.js';
import {WorkspaceConflict} from '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
const origin='https://synthetic.invalid',actor={role:'BETA' as const,actorId:'SYN-GUIDE-OWNER',
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:ReturnType<typeof createIntegratedApi>[]=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(a=>a.close()));});
function setup(withStore=true){
  const current=guide();let record:any=null,rights=true,consentVersion='SYN-CONSENT',actorId=actor.actorId,now=FIXED_NOW;
  current.translations.en!.review='HUMAN_VERIFIED';current.translations.en!.text='SYNTHETIC reviewed English';
  const stored=new Map<string,any>();
  const source={read:async()=>({kind:'INTERNATIONAL',receipt:{actorId,consentVersion,
    sourceVersion:'SYN-SOURCE',rightsVersion:'SYN-RIGHT',expiresAt:'2026-11-30T00:00:00Z'},
    guides:[{guide:current,selection:{locale:'en',topicCode:current.topicCode,campus:'SEOUL',term:'2026-2',audienceCodes:['INTERNATIONAL_STUDENT']}}]}),
    revalidate:async({actorId:id,receipt}:any)=>rights&&id===actorId&&receipt.consentVersion===consentVersion};
  const checklists={read:async(i:any)=>stored.get(i.actorId+'|'+i.itemId)??null,
    create:async(i:any)=>{const key=i.actorId+'|'+i.itemId;if(stored.has(key))throw new WorkspaceConflict();
      record={itemId:i.itemId,version:1,value:i.value,updatedAt:FIXED_NOW};stored.set(key,record);return record;},
    update:async(i:any)=>{const key=i.actorId+'|'+i.itemId,old=stored.get(key);if(old?.version!==i.expectedVersion)throw new WorkspaceConflict();
      record={...old,version:old.version+1,value:i.value};stored.set(key,record);return record;}};
  const app=createIntegratedApi({allowedOrigin:origin,repository:closedRepository,now:()=>now,
    auth:{verifySession:async()=>({...actor,actorId}),revokeSession:async()=>{}},
    ownerInsights:{source,quota:{consume:async()=>true},...(withStore?{checklists}:{})}});apps.push(app);
  const url='/api/owner/features/v2/international/'+current.id+'/checklist';
  const read=(locale='en')=>app.inject({url:url+'?locale='+locale});
  const save=(view:any,checkedStepIds:string[],patch={})=>app.inject({method:'PUT',url,
    headers:{origin,'x-csrf-token':actor.csrfToken},payload:{expectedVersion:view.version,locale:'en',
      guideRevisionId:view.guide.sourceRevisionId,displayedLocale:view.guide.locale,translationVersion:view.translationVersion,
      contextVersion:view.contextVersion,checkedStepIds,...patch}});
  return {app,read,save,current,source,setNow:(v:string)=>{now=v;},record:()=>record,revoke:()=>{rights=false;},changeConsent:()=>{consentVersion='SYN-NEW';},changeActor:()=>{actorId='SYN-OTHER';}};
}
it('saves only owner checkboxes bound to the actually displayed reviewed translation',async()=>{
  const h=setup(),response=await h.read();expect(response.statusCode,response.body).toBe(200);
  const view=response.json();expect(view.state).toBe('READY');expect(view.version).toBe(0);
  const saved=await h.save(view,[h.current.steps[0]!.id]);expect(saved.statusCode).toBe(200);
  expect(saved.json()).toMatchObject({version:1,checklist:{state:'READY',checkedStepIds:[h.current.steps[0]!.id],officialAdministrationComplete:false}});
  expect(h.record().value).toMatchObject({kind:'GUIDE_CHECKLIST',locale:view.guide.locale,translationVersion:view.translationVersion});
  expect((await h.save(view,[])).statusCode).toBe(409);
});
it('clears displayed checks after a locale, translation or source revision change',async()=>{
  const h=setup(),view=(await h.read()).json();const saved=(await h.save(view,[h.current.steps[0]!.id])).json();
  const korean=(await h.read('ko')).json();expect(korean.checklist.state).toBe('STALE_GUIDE');expect(korean.checklist.checkedStepIds).toEqual([]);
  h.current.translations.en!.translationVersion='SYN-CHANGED';
  const changed=(await h.read()).json();expect(changed.checklist.state).toBe('STALE_GUIDE');
  expect((await h.save(saved,[h.current.steps[0]!.id])).statusCode).toBe(409);
});
it('keeps actors and consent epochs separate and refuses invalid IDs and revoked sources',async()=>{
  const h=setup(),view=(await h.read()).json();
  expect((await h.save(view,['SYN-UNKNOWN-STEP'])).statusCode).toBe(422);
  await h.save(view,[h.current.steps[0]!.id]);h.changeActor();expect((await h.read()).json().version).toBe(0);
  h.changeConsent();expect((await h.save(view,[])).statusCode).toBe(409);
  h.revoke();expect((await h.read()).statusCode).toBe(403);
});
it('rejects receipt expiration during the final asynchronous source recheck',async()=>{
  const h=setup();let checks=0;const revalidate=h.source.revalidate;
  h.source.revalidate=async input=>{if(++checks===2)h.setNow('2026-11-30T00:00:01Z');return revalidate(input);};
  expect((await h.read()).statusCode).toBe(403);
});
it('does not reuse an old request after storage consent withdrawal and regrant',async()=>{
  const h=setup(),view=(await h.read()).json();await h.save(view,[h.current.steps[0]!.id]);
  h.changeConsent();const renewed=(await h.read()).json();expect(renewed.version).toBe(0);
  expect((await h.save(view,[])).statusCode).toBe(409);
  expect((await h.save(renewed,[])).statusCode).toBe(200);
});
it('stores Korean fallback as Korean and reports an absent private store explicitly',async()=>{
  const h=setup();h.current.translations.en!.review='MACHINE_DRAFT';
  const view=(await h.read()).json();expect(view.guide).toMatchObject({status:'KOREAN_FALLBACK',locale:'ko'});
  await h.save(view,[h.current.steps[0]!.id]);expect(h.record().value.locale).toBe('ko');
  expect((await h.read('ko')).json().checklist.state).toBe('READY');
  expect((await setup(false).read()).json()).toEqual({state:'NOT_CONNECTED'});
});
it('rejects stale source revision bindings even with a current CAS version',async()=>{
  const h=setup(),view=(await h.read()).json(),saved=(await h.save(view,[])).json();
  h.current.source.revisionId='SYN-REV-2';
  for(const t of Object.values(h.current.translations))if(t)t.basedOnRevisionId='SYN-REV-2';
  expect((await h.read()).json().checklist.state).toBe('STALE_GUIDE');
  expect((await h.save(saved,[])).statusCode).toBe(409);
});
