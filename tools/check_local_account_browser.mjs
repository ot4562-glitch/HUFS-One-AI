/** Real-browser synthetic HTTP regression. Uses an installed browser; never downloads one. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const origin='http://127.0.0.1:5173';
const children=[];
let browser;
let diagnosticPage;
const checks=[];
const check=(name)=>{checks.push(name);process.stdout.write(`PASS ${name}\n`);};
async function until(read,accept,description,timeout=15_000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=await read();if(accept(value))return value;await delay(100);}
  throw new Error(`Timed out: ${description}`);
}
function start(args){
  const child=spawn(process.execPath,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});
  let error='';child.stderr.on('data',chunk=>{error=(error+chunk.toString()).slice(-1500);});
  child.on('exit',code=>{if(code)process.stderr.write(`Test service exited ${code}: ${error}\n`);});
  children.push(child);return child;
}
try {
  if(process.argv.includes('--start-servers')){
    // Never accidentally test another process's mutable demo instance.
    for(const port of [3000,5173]){
      let reachable=false;try{await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(500)});reachable=true;}catch{}
      if(reachable)throw new Error(`Port ${port} already in use; stop the local test service first`);
    }
    start(['dist/apps/api/src/dev/local-account-main.js','--synthetic']);
    start(['node_modules/vite/bin/vite.js','--config','apps/web/vite.config.ts','--mode','synthetic']);
    await until(async()=>{try{return (await fetch(origin,{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},Boolean,'Vite readiness',45_000);
  }
  const {chromium}=await import(process.env.LOCAL_PLAYWRIGHT_MODULE??'playwright-core');
  browser=await chromium.launch({headless:true,...(process.env.PW_EXECUTABLE_PATH?
    {executablePath:process.env.PW_EXECUTABLE_PATH}:{channel:process.env.PW_CHANNEL??'chrome'})});
  const context=await browser.newContext({viewport:{width:360,height:800}});
  const page=await context.newPage();
  diagnosticPage=page;
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  const snapshot=async()=>{const response=await context.request.get(origin+'/api/local-accounts/snapshot');assert.equal(response.status(),200);return response.json();};
  const settled=()=>page.getByRole('button',{name:'계정 설정',exact:true}).waitFor({state:'visible'});
  const waitReady=()=>until(async()=>page.getByRole('button',{name:'계정 설정',exact:true}).isEnabled(),Boolean,'account ready');
  const select=async(id)=>{await waitReady();await page.getByLabel('로컬 합성 계정',{exact:true}).selectOption(id);await waitReady();await until(snapshot,s=>s.accountId===id,'selected account');};
  await page.goto(origin+'/local-demo');await settled();await waitReady();
  let state=await snapshot();assert.equal(state.accountId,'BLANK_DEMO');
  assert.equal(state.profile.primaryMajor,null);assert.equal(state.profile.earnedCredits,null);
  assert.deepEqual(state.profile.interestTopics,[]);assert.equal(state.profile.doubleMajorStatus,'UNSET');
  check('first visit has an independent empty account');
  const beforeOwners={};
  for(let i=1;i<=4;i++){await select(`SYN_OWNER_${i}`);beforeOwners[i]=await snapshot();}
  await select('BLANK_DEMO');
  await page.getByRole('button',{name:'계정 설정',exact:true}).click();
  const form=page.getByRole('form',{name:'로컬 계정 프로필 설정'});
  await form.getByLabel('주전공',{exact:true}).fill('가상통계학과');
  await form.getByLabel('취득학점',{exact:true}).fill('0');
  await form.getByLabel('복수·이중전공 상태',{exact:true}).selectOption('NONE');
  await form.getByRole('group',{name:'관심 분야 (최대 5개)'}).getByLabel('AI·머신러닝',{exact:true}).check();
  await form.getByRole('group',{name:'희망 진로 (최대 3개)'}).getByLabel('데이터 분석',{exact:true}).check();
  await form.getByRole('button',{name:'프로필 저장',exact:true}).click();await waitReady();
  const a=await snapshot();assert.equal(a.profile.earnedCredits,0);assert.equal(a.profile.primaryMajor,'가상통계학과');
  await page.getByText('취득학점: 0',{exact:true}).waitFor();
  check('settings save preserves explicit zero and recomputes server results');
  await page.getByRole('button',{name:'계정 설정',exact:true}).click();
  await form.getByLabel('주전공',{exact:true}).fill('가상스페인어과');
  await form.getByRole('group',{name:'관심 분야 (최대 5개)'}).getByLabel('AI·머신러닝',{exact:true}).uncheck();
  await form.getByRole('group',{name:'관심 분야 (최대 5개)'}).getByLabel('무역·통상',{exact:true}).check();
  await form.getByRole('group',{name:'희망 진로 (최대 3개)'}).getByLabel('데이터 분석',{exact:true}).uncheck();
  await form.getByRole('group',{name:'희망 진로 (최대 3개)'}).getByLabel('해외영업',{exact:true}).check();
  await form.getByRole('button',{name:'프로필 저장',exact:true}).click();await waitReady();
  const b=await snapshot();assert.ok(b.revision>a.revision);assert.notDeepEqual(b.feed,a.feed);assert.notDeepEqual(b.clubs,a.clubs);
  assert.equal(b.academics.state,'UNKNOWN');assert.equal(b.forecast.state,'UNKNOWN');
  check('A/B input changes feed and club results while academic claims stay UNKNOWN');
  const workspace=page.getByRole('form',{name:'로컬 개인 보관함'});
  await workspace.getByLabel('저장할 검색어',{exact:true}).fill('SYNTHETIC_QUERY');
  await workspace.getByLabel('경험 제목',{exact:true}).fill('합성 경험');
  await workspace.getByRole('button',{name:'경험 초안 추가',exact:true}).click();
  await workspace.getByLabel('계획 과목 ID',{exact:true}).fill('SYN-COURSE-1');
  await workspace.getByRole('button',{name:'계획 초안 추가',exact:true}).click();
  await workspace.getByRole('button',{name:'보관함 저장',exact:true}).click();await waitReady();
  state=await snapshot();assert.equal(state.workspace.experiences.length,1);assert.equal(state.workspace.planCourseIds.length,1);
  await page.getByRole('button',{name:'빈 데모 초기화',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'빈 데모 초기화 확인'});await dialog.waitFor();
  assert.equal(await dialog.getByRole('button',{name:'취소',exact:true}).evaluate(element=>element===document.activeElement),true);
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.equal((await snapshot()).revision,state.revision);
  check('reset cancellation preserves workspace and keyboard focus enters confirmation');
  const other=await context.newPage();await other.goto(origin+'/local-demo');
  await until(async()=>other.getByRole('button',{name:'계정 설정',exact:true}).isEnabled(),Boolean,'second tab ready');
  let releaseSession;let sessionHeldResolve;
  const sessionHeld=new Promise(resolveHeld=>{sessionHeldResolve=resolveHeld;});
  const sessionRelease=new Promise(resolveRelease=>{releaseSession=resolveRelease;});
  let holdSession=true;
  await other.route('**/api/local-accounts/session',async route=>{
    if(!holdSession)return route.continue();holdSession=false;
    const response=await route.fetch();
    assert.equal(response.headers()['set-cookie'],undefined,'existing bootstrap must not restore an old shared cookie');
    sessionHeldResolve();await sessionRelease;try{await route.fulfill({response});}catch{}
  });
  const sessionReload=other.reload();await sessionHeld;
  await select('SYN_OWNER_1');releaseSession();await sessionReload;
  await until(async()=>other.getByLabel('로컬 합성 계정',{exact:true}).inputValue(),v=>v==='SYN_OWNER_1','peer account switch');
  assert.equal((await snapshot()).accountId,'SYN_OWNER_1');
  await other.unroute('**/api/local-accounts/session');await select('BLANK_DEMO');
  await until(async()=>other.getByLabel('로컬 합성 계정',{exact:true}).inputValue(),v=>v==='BLANK_DEMO','peer account restored');
  check('delayed bootstrap cannot restore a revoked cookie after another tab switches accounts');
  let releaseOld;let heldResolve;
  const oldHeld=new Promise(resolveHeld=>{heldResolve=resolveHeld;});
  const release=new Promise(resolveRelease=>{releaseOld=resolveRelease;});
  let intercept=true;
  await other.route('**/api/local-accounts/snapshot',async route=>{
    if(!intercept)return route.continue();intercept=false;
    const response=await route.fetch();heldResolve();await release;
    try{await route.fulfill({response});}catch{}
  });
  const reloading=other.reload();await oldHeld;
  await page.getByRole('button',{name:'빈 데모 초기화',exact:true}).click();
  await page.getByRole('button',{name:'모두 지우고 초기화',exact:true}).click();await waitReady();
  releaseOld();await reloading;
  await other.getByText('취득학점: 미입력',{exact:true}).waitFor();
  state=await snapshot();assert.equal(state.profile.primaryMajor,null);assert.equal(state.profile.earnedCredits,null);
  assert.deepEqual(state.workspace,{bookmarks:[],experiences:[],planCourseIds:[],search:'',notifications:false});
  assert.equal(await other.getByText('SYNTHETIC_QUERY',{exact:true}).count(),0);
  check('reset clears profile/workspace and delayed pre-reset response cannot repopulate another tab');
  await other.close();
  const freshSession=await context.request.get(origin+'/api/local-accounts/session');const session=await freshSession.json();
  const staleReset=await context.request.post(origin+'/api/local-accounts/reset',{headers:{Origin:origin,'x-csrf-token':session.csrfToken},data:{expectedRevision:b.revision}});
  assert.equal(staleReset.status(),409);
  const csrf=await context.request.patch(origin+'/api/local-accounts/profile',{headers:{Origin:origin},data:{expectedRevision:state.revision,profile:state.profile}});assert.equal(csrf.status(),403);
  const foreign=await context.request.get(origin+'/api/local-accounts/accounts/SYN_OWNER_1');assert.equal(foreign.status(),404);
  const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(origin+'/api/local-accounts/snapshot')).status(),401);await anonymous.close();
  check('real HTTP denies anonymous, CSRF, stale reset and foreign direct URL');
  for(let i=1;i<=4;i++){
    await select(`SYN_OWNER_${i}`);const after=await snapshot();
    assert.deepEqual(after.profile,beforeOwners[i].profile);assert.deepEqual(after.workspace,beforeOwners[i].workspace);
    assert.equal(after.revision,beforeOwners[i].revision);
    assert.equal(await page.getByRole('button',{name:'빈 데모 초기화',exact:true}).count(),0);
  }
  await select('BLANK_DEMO');check('all four other accounts survive demo reset unchanged');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  assert.equal(await page.getByRole('button').filter({hasText:'🚫 미지원'}).count(),24);
  await page.getByRole('button',{name:'계정 설정',exact:true}).focus();await page.keyboard.press('Enter');await form.waitFor();
  await form.getByRole('button',{name:'설정 취소',exact:true}).click();
  assert.deepEqual(pageErrors,[]);check('360px layout, keyboard settings and 24 disabled original functions');
  const screenshot=resolve(process.env.LOCAL_ACCOUNT_SCREENSHOT??'local_only/reports/local-account-360.png');
  await mkdir(resolve(screenshot,'..'),{recursive:true});await page.screenshot({path:screenshot,fullPage:false});
  process.stdout.write(JSON.stringify({status:'PASS',checks:checks.length,browser:browser.version(),viewport:'360x800',mode:'SYNTHETIC',realLogin:'NOT_RUN',NCP:'NOT_RUN'})+'\n');
} catch(error) {
  if(diagnosticPage)process.stderr.write('Synthetic browser state: '+(await diagnosticPage.locator('body').innerText()).slice(0,1400)+'\n');
  throw error;
} finally {
  await browser?.close();for(const child of children)child.kill('SIGTERM');
}
