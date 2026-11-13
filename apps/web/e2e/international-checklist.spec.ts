import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {} from './international-harness.js';
const phase=process.env.HUFS_GUIDE_CAPTURE_PHASE==='before'?'before':'after';
test('#518 synthetic international App at five widths',async({page})=>{
  const folder=resolve('local_only/ui/guide-checklists',phase);await mkdir(folder,{recursive:true});
  for(const width of [320,360,390,768,1440]){
    await page.setViewportSize({width,height:900});await page.goto('/e2e/international-harness.html');
    await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();
    await expect(page.getByText(/합성 수강 준비 안내입니다/)).toBeVisible();
    if(phase==='after'){
      await expect(page.getByLabel('안내 언어')).toBeVisible();
      await expect(page.getByRole('checkbox')).toHaveCount(1);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:resolve(folder,width+'.png'),fullPage:true});
  }
});
test('#518 keyboard owner check, three locales, stale review and inquiry link',async({page})=>{
  test.skip(phase==='before');await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/e2e/international-harness.html');await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();
  const box=page.getByRole('checkbox');await expect(box).toBeVisible();await box.focus();await page.keyboard.press('Space');
  await expect(box).toBeChecked();await page.getByRole('button',{name:'체크 저장',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByText('체크를 저장했습니다.')).toBeVisible();
  await page.getByLabel('안내 언어').selectOption('en');await expect(page.getByText(/Synthetic registration preparation/)).toBeVisible();
  await expect(box).not.toBeChecked();await expect(page.getByText(/안내 또는 번역이 바뀌어/)).toBeVisible();
  await page.getByLabel('안내 언어').selectOption('zh');await expect(page.locator('p[lang="zh"]')).toBeVisible();
  await expect(page.getByRole('link',{name:'상담 기관 안내 열기'})).toHaveAttribute('href','/counseling');
});
test('#518 a 409 needs explicit recovery and does not replay a checkbox write',async({page})=>{
  test.skip(phase==='before');await page.goto('/e2e/international-harness.html');
  await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();await page.getByRole('checkbox').check();
  await page.evaluate(()=>window.__guideHarness.conflictNext());await page.getByRole('button',{name:'체크 저장',exact:true}).click();
  await expect(page.getByText(/다른 탭의 저장 또는 안내 판본/)).toBeVisible();await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button',{name:'현재 계정·권한 다시 확인'}).click();
  await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();await expect(page.getByRole('checkbox')).not.toBeChecked();
  expect(await page.evaluate(()=>window.__guideHarness.state())).toEqual({version:0,checked:[]});
});
test('#518 missing storage is explicit and actor change removes old private controls',async({page})=>{
  test.skip(phase==='before');await page.goto('/e2e/international-harness.html');
  await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();await expect(page.getByRole('checkbox')).toBeVisible();
  await page.evaluate(()=>window.__guideHarness.disconnect());await page.getByRole('button',{name:'안내·체크 다시 읽기'}).click();
  await expect(page.getByText(/NOT_CONNECTED.*체크 저장/)).toBeVisible();await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.evaluate(()=>window.__guideHarness.switchOwner());await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText(/합성 수강 준비 안내입니다/)).toHaveCount(0);
});
test('#518 long valid source/translation references stay inside a 320px viewport',async({page})=>{
  test.skip(phase==='before');await page.setViewportSize({width:320,height:900});
  await page.goto('/e2e/international-harness.html');await page.evaluate(()=>window.__guideHarness.longReferences());
  await page.getByRole('button',{name:'현재 권한으로 확인하기'}).click();await expect(page.getByRole('checkbox')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
