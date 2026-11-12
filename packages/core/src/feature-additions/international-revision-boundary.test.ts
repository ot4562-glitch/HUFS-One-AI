import {describe,expect,it} from 'vitest';
import {resolveInternationalGuide,reconcileGuideChecklist,type GuideLocale}
  from './international-v2.js';
import {guide,source,FIXED_NOW} from './v2.fixtures.js';

const base=guide();
const select=(locale:GuideLocale,overrides:Partial<ReturnType<typeof guide>>={})=>
  resolveInternationalGuide({guide:guide(overrides),locale,topicCode:'ENROLLMENT',
    campus:'SEOUL',term:'2026-2',audienceCodes:['INTERNATIONAL_STUDENT'],
    asOf:FIXED_NOW});
const saved=(overrides:Partial<Parameters<typeof reconcileGuideChecklist>[1]>={})=>({
  guideId:base.id,guideRevisionId:base.source.revisionId,
  ownerCheckedStepIds:['step-1'],expectedVersion:1,...overrides,
});
const reconcile=(recovery:ReturnType<typeof guide>,change:Partial<ReturnType<typeof saved>>={})=>
  reconcileGuideChecklist(recovery,saved(change),1,FIXED_NOW);

describe('#352 NCP-free multilingual Korean/English/Chinese guide consistency',()=>{
  it.each([
    ['ko','READY','ko'],
    ['en','KOREAN_FALLBACK','ko'],
    ['zh','READY','zh'],
  ] as const)('a %s request uses only the actual human-reviewed %s source locale',(
    locale,status,selected)=>{
    const r=select(locale);
    expect(r.status).toBe(status);
    expect(r.locale).toBe(selected);
    expect(r.officialAdministrationComplete).toBe(false);
    expect(r.sourceRevisionId).toBe(base.source.revisionId);
    expect(r.steps).toHaveLength(1);
  });
  it('a machine-draft English message is never marked officially translated',()=>{
    const r=select('en');
    expect(r.status).toBe('KOREAN_FALLBACK');
    expect(r.body).toBe(base.translations.ko.text);
    expect(r.locale).toBe('ko');
    expect(r.body).not.toBe(base.translations.en?.text);
  });
  it.each([
    ['wrong campus',{campuses:['GLOBAL']},'NOT_APPLICABLE'],
    ['wrong source rights',{source:{...source(),rights:'BLOCKED'}},'UNKNOWN_SOURCE'],
    ['revoked source',{source:{...source(),status:'REVOKED'}},'UNKNOWN_SOURCE'],
    ['out-of-date source span',{steps:[{...base.steps[0]!,sourceSpanId:'SYN-OLD'}]},'UNKNOWN_SOURCE'],
    ['duplicated step ID',{steps:[base.steps[0]!,base.steps[0]!] },'UNKNOWN_SOURCE'],
    ['duplicated step order',{steps:[base.steps[0]!,{
      ...base.steps[0]!,id:'SYN-STEP-2'}]},'UNKNOWN_SOURCE'],
  ] as const)('fails closed for %s',(_name,overrides,status)=>{
    const r=select('ko',overrides as Partial<ReturnType<typeof guide>>);
    expect(r.status).toBe(status);
    expect(r.steps).toHaveLength(0);
  });
  it('different verified translation versions do not change step source IDs',()=>{
    const r=select('zh',{translations:{...base.translations,
      zh:{...base.translations.zh!,translationVersion:'SYN-ZH-R2'}}});
    expect(r.status).toBe('READY');
    expect(r.steps.map(s=>s.sourceSpanId)).toEqual(['span-1']);
    expect(r.sourceRevisionId).toBe(base.source.revisionId);
  });
  it('unreviewed KO and EN translations leave no official guide text',()=>{
    const r=select('en',{translations:{...base.translations,
      ko:{...base.translations.ko,review:'MACHINE_DRAFT'},
      en:{...base.translations.en!,review:'MACHINE_DRAFT'}}});
    expect(r.status).toBe('TRANSLATION_UNAVAILABLE');
    expect(r.body).toBeUndefined();
    expect(r.steps).toEqual([]);
  });
  it('missed campus or student audience is unknown applicability, not an entitlement',()=>{
    const g=base;
    const r=resolveInternationalGuide({guide:g,locale:'ko',topicCode:'ENROLLMENT',
      asOf:FIXED_NOW});
    expect(r.status).toBe('APPLICABILITY_UNKNOWN');
    expect(r.steps).toHaveLength(0);
  });
  it('verified Korean owner checklist stays ready with matching locale and source version',()=>{
    expect(reconcile(base,{locale:'ko',translationVersion:'ko-r1'})).toMatchObject({
      state:'READY',checkedStepIds:['step-1'],invalidatedStepIds:[],
      officialAdministrationComplete:false,
    });
  });
  it.each([
    ['Korean review edited',{locale:'ko',translationVersion:'ko-r1'},
      {translations:{...base.translations,
        ko:{...base.translations.ko,translationVersion:'ko-r2'}}}],
    ['source revoked',{locale:'ko',translationVersion:'ko-r1'},
      {source:{...source(),status:'REVOKED'}}],
    ['renamed source revision',{locale:'ko',translationVersion:'ko-r1'},
      {source:{...source(),revisionId:'SYN-NEW-SOURCE-REV'}}],
    ['translation downgraded',{locale:'ko',translationVersion:'ko-r1'},
      {translations:{...base.translations,
        ko:{...base.translations.ko,review:'MACHINE_DRAFT'}}}],
  ] as const)('invalidates all owner checks when %s',(_name,record,guideOverrides)=>{
    const changed=guide(guideOverrides as Partial<ReturnType<typeof guide>>);
    const r=reconcile(changed,record);
    expect(r).toMatchObject({
      state:'STALE_GUIDE',checkedStepIds:[],invalidatedStepIds:['step-1'],
      officialAdministrationComplete:false,
    });
  });
  it('a Korean fallback cannot accidentally be saved as a verified English checklist',()=>{
    expect(reconcile(base,{locale:'en',translationVersion:'en-r1'}).state)
      .toBe('STALE_GUIDE');
    expect(reconcile(base,{locale:'ko',translationVersion:'ko-r1'}).state)
      .toBe('READY');
  });
  it.each([
    [{locale:'zh'}],
    [{translationVersion:'ko-r1'}],
    [{locale:'ko',translationVersion:'SYN-WRONG'}],
  ] as const)('rejects incomplete or mismatched translation-version binding',change=>{
    expect(reconcile(base,change).state).toBe('STALE_GUIDE');
  });
  it('a changed step order cannot reuse old progress without verification',()=>{
    const changed=guide({steps:[base.steps[0]!,{
      ...base.steps[0]!,id:'SYN-STEP-B'}]});
    const r=reconcile(changed,{locale:'ko',translationVersion:'ko-r1'});
    expect(r.state).toBe('STALE_GUIDE');
    expect(r.invalidatedStepIds).toEqual(['step-1']);
  });
  it('a currently unknown checklist step is invalidated without displaying completion',()=>{
    const r=reconcile(base,{locale:'ko',translationVersion:'ko-r1',
      ownerCheckedStepIds:['step-1','SYN-REMOVED']});
    expect(r.state).toBe('READY');
    expect(r.checkedStepIds).toEqual(['step-1']);
    expect(r.invalidatedStepIds).toEqual(['SYN-REMOVED']);
  });
  it('multi-tab saved version mismatch remains a hard conflict without leaking old flags',()=>{
    const r=reconcile(base,{locale:'ko',translationVersion:'ko-r1',expectedVersion:2});
    expect(r.state).toBe('VERSION_CONFLICT');
    expect(r.checkedStepIds).toEqual([]);
  });
  it('a verified Chinese variant remains tied to its own translation version',()=>{
    expect(reconcile(base,{locale:'zh',translationVersion:'zh-r1'}).state).toBe('READY');
    expect(reconcile(base,{locale:'zh',translationVersion:'ko-r1'}).state).toBe('STALE_GUIDE');
  });
});
