import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {} from './recognition-harness.js';
const phase=process.env.HUFS_PROOF_CAPTURE_PHASE==='before'?'before':'after';
test('#512 synthetic proof App at five widths',async({page})=>{
  const folder=resolve('local_only/ui/recognition-proofs',phase);await mkdir(folder,{recursive:true});
  for(const width of [320,360,390,768,1440]){
    await page.setViewportSize({width,height:900});await page.goto('/e2e/recognition-harness.html');
    await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();
    await expect(page.getByText(/규정 판본/).first()).toBeVisible();
    if(phase==='after')await expect(page.getByRole('button',{name:'현재 권한으로 후보 추출'})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:resolve(folder,width+'.png'),fullPage:true});
  }
});
test('#512 keyboard extraction, field masking and explicit owner confirmation',async({page})=>{
  test.skip(phase==='before');await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/e2e/recognition-harness.html');
  await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();await page.getByRole('button',{name:'현재 권한으로 후보 추출'}).focus();
  await page.keyboard.press('Enter');const box=page.getByRole('checkbox',{name:'발급기관 후보를 보관'});await expect(box).toBeVisible();
  await page.getByLabel('확인할 문서').focus();await page.keyboard.press('Space');await page.keyboard.press('Escape');await page.keyboard.press('Tab');
  await expect(page.getByRole('checkbox',{name:'활동 시작일 후보를 보관'})).toBeFocused();
  await expect(page.getByText('가상미래교육재단',{exact:true})).toHaveCount(0);
  await box.focus();await page.keyboard.press('Space');await expect(page.getByText('가상미래교육재단',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'선택한 후보 수락'})).toBeDisabled();
  await page.getByRole('checkbox',{name:'표시된 후보와 필드 가림 선택을 검토했습니다'}).focus();await page.keyboard.press('Space');
  await page.getByRole('button',{name:'선택한 후보 수락'}).focus();await page.keyboard.press('Enter');
  await expect(page.getByText(/본인 확인 후보/)).toBeVisible();await expect(page.getByText(/본인 기록상 서류 준비 확인됨/)).toBeVisible();
  expect(await page.evaluate(()=>window.__proofHarness.state())).toEqual({version:2,state:'OWNER_CONFIRMED_CANDIDATE'});
});
test('#512 deletion before OCR stays pending until explicit synthetic erasure acknowledgment',async({page})=>{
  test.skip(phase==='before');await page.goto('/e2e/recognition-harness.html');await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();
  await page.getByRole('button',{name:'본인 문서 삭제 요청'}).click();await expect(page.getByText(/외부 원본·파생물 정리 확인 대기/)).toBeVisible();
  await page.getByRole('button',{name:'외부 정리 상태 확인'}).click();await expect(page.getByText(/외부 원본·파생물 정리 확인 대기/)).toBeVisible();
  await expect(page.getByText('외부 삭제 확인됨',{exact:true})).toHaveCount(0);
  await page.evaluate(()=>window.__proofHarness.acknowledgeNext());await page.getByRole('button',{name:'외부 정리 상태 확인'}).click();
  await expect(page.getByText('외부 삭제 확인됨',{exact:true})).toBeVisible();await expect(page.getByRole('checkbox')).toHaveCount(0);
});
test('#512 409 recovery never replays an extraction',async({page})=>{
  test.skip(phase==='before');await page.goto('/e2e/recognition-harness.html');await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();
  await page.evaluate(()=>window.__proofHarness.conflictNext());await page.getByRole('button',{name:'현재 권한으로 후보 추출'}).click();
  await expect(page.getByText(/다른 탭의 문서/)).toBeVisible();await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button',{name:'현재 계정·권한 다시 확인'}).click();await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();
  await expect(page.getByRole('button',{name:'현재 권한으로 후보 추출'})).toBeVisible();
  expect(await page.evaluate(()=>window.__proofHarness.state())).toEqual({version:0,state:'AVAILABLE'});
});
test('#512 missing provider and actor change remove previous candidate values',async({page})=>{
  test.skip(phase==='before');await page.goto('/e2e/recognition-harness.html');await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();
  await page.getByRole('button',{name:'현재 권한으로 후보 추출'}).click();await page.getByRole('checkbox',{name:'발급기관 후보를 보관'}).check();
  await expect(page.getByText('가상미래교육재단',{exact:true})).toBeVisible();await page.evaluate(()=>window.__proofHarness.disconnect());
  await page.getByRole('button',{name:'문서·후보 다시 읽기'}).click();await expect(page.getByText(/NOT_CONNECTED.*본인 문서·OCR/)).toBeVisible();
  await expect(page.getByText('가상미래교육재단',{exact:true})).toHaveCount(0);await page.evaluate(()=>window.__proofHarness.switchOwner());
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('checkbox')).toHaveCount(0);
});
test('#512 post-withdrawal cleanup does not require loading document data',async({page})=>{
  test.skip(phase==='before');await page.goto('/e2e/recognition-harness.html');await page.getByRole('button',{name:'남은 정리 작업 한 건 확인'}).click();
  await expect(page.getByText(/NOT_CONNECTED.*외부 정리 공급자/)).toBeVisible();await expect(page.getByLabel('확인할 문서')).toHaveCount(0);
});
test('#512 long valid version references stay inside a 320px viewport',async({page})=>{
  test.skip(phase==='before');await page.setViewportSize({width:320,height:900});await page.goto('/e2e/recognition-harness.html');
  await page.evaluate(()=>window.__proofHarness.longReferences());await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();
  await expect(page.getByRole('button',{name:'현재 권한으로 후보 추출'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('#512 manual preparation survives an unconnected proof provider',async({page})=>{
  test.skip(phase==='before');await page.goto('/e2e/recognition-harness.html');await page.evaluate(()=>{window.__proofHarness.manualReady();window.__proofHarness.disconnect();});
  await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();await expect(page.getByText(/NOT_CONNECTED.*본인 문서·OCR/)).toBeVisible();
  await expect(page.getByText(/초기 활동 조회 시점의 준비 결과/)).toBeVisible();await expect(page.getByText(/본인 기록상 서류 준비 확인됨/)).toBeVisible();
});
test('#512 cleanup remains reachable after a private-purpose 403',async({page})=>{
  test.skip(phase==='before');await page.goto('/e2e/recognition-harness.html');await page.evaluate(()=>window.__proofHarness.denyPrivateRead());
  await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button',{name:'남은 정리 작업 한 건 확인'}).click();await expect(page.getByText(/NOT_CONNECTED.*외부 정리 공급자/)).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);await expect(page.getByRole('button',{name:'현재 권한으로 확인하기'})).toHaveCount(0);
});
