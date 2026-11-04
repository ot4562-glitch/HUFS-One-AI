/** Actual Chrome + real HTTP + existing EMPTY_DEMO API/service. Invented auth and memory
 * store only. Real PostgreSQL is separately proven by demo-profile-live-opt-in.test.ts. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const origin='http://127.0.0.1:5175',children=[],checks=[];
let browser;
async function until(fn,accept,label,ms=45000){
 const deadline=Date.now()+ms;
 while(Date.now()<deadline){const value=await fn();if(accept(value))return value;await delay(100);}
 throw Error('Timed out: '+label);
}
function start(args,env={}){
 const child=spawn(process.execPath,args,{stdio:['ignore','ignore','pipe'],env:{...process.env,...env},windowsHide:true});
 let diagnostic='';child.stderr.on('data',x=>{diagnostic=(diagnostic+x).slice(-1000);});
 child.on('exit',code=>{if(code)process.stderr.write('Synthetic child exited '+code+': '+diagnostic+'\n');});
 children.push(child);
}
const pass=name=>{checks.push(name);process.stdout.write('PASS '+name+'\n');};
try{
 if(!process.argv.includes('--start-servers'))throw Error('Explicit --start-servers required');
 for(const port of [3000,5175]){
   let occupied=false;try{await fetch('http://127.0.0.1:'+port,{signal:AbortSignal.timeout(500)});occupied=true;}catch{}
   if(occupied)throw Error('Port '+port+' already in use; preserve existing process');
 }
 start(['dist/apps/api/src/dev/empty-demo-main.js','--synthetic'],{EMPTY_DEMO_ORIGIN:origin});
 await until(async()=>{try{return (await fetch('http://127.0.0.1:3000/api/demo-profile')).status;}catch{return 0;}},x=>x===401,'isolated synthetic API');
 start(['node_modules/vite/bin/vite.js','--config','apps/web/vite.config.ts','--mode','empty-demo','--port','5175','--strictPort']);
 await until(async()=>{try{return (await fetch(origin)).ok;}catch{return false;}},Boolean,'Vite');
 const {chromium}=await import(process.env.LOCAL_PLAYWRIGHT_MODULE??'playwright-core');
 browser=await chromium.launch({headless:true,...(process.env.PW_EXECUTABLE_PATH?
   {executablePath:process.env.PW_EXECUTABLE_PATH}:{channel:process.env.PW_CHANNEL??'chrome'})});
 const context=await browser.newContext({viewport:{width:360,height:900}});
 context.setDefaultTimeout(15000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const snapshot=async()=>{const r=await context.request.get(origin+'/api/demo-profile');assert.equal(r.status(),200);return r.json();};
 const version=async(n,target=page)=>{await target.getByText('프로필 버전 '+n+' · 계산 시점',{exact:false}).waitFor();};
 await page.goto(origin+'/api/dev/empty-demo/bootstrap');await version(0);
 assert.equal(await page.locator('details.selector').count(),0);
 assert.equal((await snapshot()).profile.value.earnedCreditUnits,null);
 pass('independent empty BETA fixture uses the owner UI without a S01 selector');
 const form=page.getByRole('form',{name:'별도 시연 프로필 설정'});
 await form.getByLabel('주전공',{exact:true}).fill('가상 정보학');
 await form.getByLabel(/취득 학점/).fill('0');
 await form.getByRole('group',{name:'관심 분야 (1~5개)'}).getByLabel('AI·머신러닝',{exact:true}).check();
 await form.getByLabel('이중전공 상태',{exact:true}).selectOption('NONE');
 await form.getByRole('button',{name:'프로필 저장·재계산',exact:true}).focus();await page.keyboard.press('Enter');await version(1);
 const a=await snapshot();assert.equal(a.profile.value.earnedCreditUnits,0);assert.ok(a.snapshot.feed.featured.length);
 await form.getByLabel('주전공',{exact:true}).fill('가상 문화학');
 await form.getByRole('group',{name:'관심 분야 (1~5개)'}).getByLabel('AI·머신러닝',{exact:true}).uncheck();
 await form.getByRole('group',{name:'관심 분야 (1~5개)'}).getByLabel('문화·관광',{exact:true}).check();
 await form.getByRole('button',{name:'프로필 저장·재계산',exact:true}).click();await version(2);
 const b=await snapshot();assert.notDeepEqual(a.snapshot.feed,b.snapshot.feed);
 assert.equal(b.snapshot.academics.state,'UNKNOWN');assert.equal(b.snapshot.forecast.state,'UNKNOWN');
 pass('keyboard save preserves zero and A to B recomputes all sections at one fixed asOf');
 const rec=page.getByRole('region',{name:'빈 계정 추천'});
 await rec.getByRole('button',{name:/상세 보기/}).first().click();
 await page.getByRole('region',{name:'합성 기회 상세'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'실제 지원 불가 · 합성 시연'}).isDisabled(),true);
 await page.getByRole('button',{name:'상세 닫기',exact:true}).click();
 await rec.getByRole('button',{name:/보관함 저장/}).first().click();await version(3);
 assert.equal((await snapshot()).profile.workspace.bookmarks.length,1);
 pass('recommendation detail shows bound evidence and disabled external application, bookmark persists');
 await page.getByLabel('가상 경험 제목',{exact:true}).fill('합성 데이터 활동');
 await page.getByLabel('가상 경험 분야',{exact:true}).selectOption('DATA_ANALYTICS');
 await page.getByRole('button',{name:'경험 초안 저장',exact:true}).click();await version(4);
 assert.equal((await snapshot()).snapshot.experienceSignals.mode,'OFF');
 await page.getByRole('button',{name:'가상 경험 신호 켜기',exact:true}).click();await version(5);
 assert.equal((await snapshot()).snapshot.experienceSignals.mode,'SYNTHETIC_OVERLAY');
 await page.getByLabel('계획 과목 ID',{exact:true}).fill('SYN-COURSE-001');
 await page.getByRole('button',{name:'계획 초안 저장',exact:true}).click();await version(6);
 // This controlled preference changes only after the server confirms its CAS receipt.
 await page.getByLabel('시연 알림 선호 저장',{exact:true}).click();await version(7);
 assert.equal(await page.getByLabel('시연 알림 선호 저장',{exact:true}).isChecked(),true);
 assert.equal((await snapshot()).profile.workspace.notifications,true);
 await page.getByRole('region',{name:'빈 계정 일정'}).getByRole('button').first().click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const shot=resolve('local_only/reports/empty-demo-360.png');await mkdir(resolve(shot,'..'),{recursive:true});
 await page.screenshot({path:shot,fullPage:false});
 pass('experience overlay, plan, notification preference and calendar remain synthetic at 360px');
 const other=await context.newPage();await other.goto(origin+'/demo-profile');await version(7,other);
 let release,held;const waiting=new Promise(r=>{held=r;}),gate=new Promise(r=>{release=r;});let intercept=true;
 await other.route('**/api/demo-profile',async route=>{
   if(!intercept||route.request().method()!=='GET')return route.continue();intercept=false;
   const response=await route.fetch();held();await gate;try{await route.fulfill({response});}catch{}
 });
 const reload=other.reload();await waiting;
 await page.bringToFront();await version(7);
 await page.getByRole('button',{name:'설정·보관함 전체 초기화',exact:true}).click();
 await page.getByRole('button',{name:'초기화 확인',exact:true}).click();await version(8);
 release();await reload;await version(8,other);
 const reset=await snapshot();
 assert.equal(reset.profile.value.primaryMajor,null);assert.equal(reset.profile.value.earnedCreditUnits,null);
 assert.deepEqual(reset.profile.workspace,{bookmarks:[],experiences:[],planCourseIds:[],search:'',notifications:false,experienceOverlay:'OFF'});
 assert.equal(await other.getByLabel('주전공',{exact:true}).inputValue(),'');
 pass('cross-tab reset discards delayed older results and clears the entire workspace');
 await other.close();
 const csrf=(await (await context.request.get(origin+'/api/auth/csrf')).json()).csrfToken;
 const stale=await context.request.put(origin+'/api/demo-profile/workspace',{headers:{origin,'x-csrf-token':csrf},
   data:{expectedVersion:7,workspace:b.profile.workspace}});
 assert.equal(stale.status(),409);
 const outsider=await browser.newContext();assert.equal((await outsider.request.get(origin+'/api/demo-profile')).status(),401);await outsider.close();
 pass('actual HTTP denies anonymous access and stale workspace resurrection');
 await page.getByRole('button',{name:'초기화 후 시연 종료',exact:true}).click();
 await page.getByRole('button',{name:'초기화 확인',exact:true}).click();
 await page.getByRole('region',{name:'시연 종료'}).waitFor();
 assert.equal((await snapshot()).profile.version,9);assert.deepEqual(errors,[]);
 pass('end demo confirms and resets server state before clearing the UI');
 process.stdout.write(JSON.stringify({status:'PASS',checks:checks.length,browser:browser.version(),viewport:'360x900',
   transport:'REAL_HTTP',authentication:'SYNTHETIC',storage:'MEMORY',realLogin:'NOT_RUN',postgres:'SEPARATE_LIVE_SUITE',
   screenReaderHuman:'PENDING',NCP:'NOT_RUN',screenshot:shot})+'\n');
}finally{await browser?.close();for(const child of children)child.kill('SIGTERM');}
