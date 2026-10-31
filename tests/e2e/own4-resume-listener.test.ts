import {describe,expect,it} from 'vitest';
import {
  attachDemoResumeRevalidation,
} from '../../apps/web/src/app/resume-listener.js';
import type {
  BrowserResumePorts,
} from '../../apps/web/src/app/resume-listener.js';

function syntheticBrowser(){
  let state:'visible'|'hidden'='visible';
  const focus=new Set<()=>void>(),visibility=new Set<()=>void>();
  const add=(kind:string,callback:()=>void)=>{
    if(kind==='focus')focus.add(callback);
    if(kind==='visibilitychange')visibility.add(callback);
  };
  const remove=(kind:string,callback:()=>void)=>{
    if(kind==='focus')focus.delete(callback);
    if(kind==='visibilitychange')visibility.delete(callback);
  };
  const page={
    get visibilityState(){return state;},addEventListener:add,removeEventListener:remove,
  } as unknown as BrowserResumePorts['page'];
  const view={
    addEventListener:add,removeEventListener:remove,
  } as unknown as BrowserResumePorts['view'];
  return {
    ports:{page,view},
    dispatchFocus:()=>{for(const callback of focus)callback();},
    dispatchVisibility:()=>{for(const callback of visibility)callback();},
    hide:()=>{state='hidden';},show:()=>{state='visible';},
    listeners:()=>focus.size+visibility.size,
  };
}

describe('React focus/visibility bridge (synthetic browser event transport)',()=>{
  it('revalidates on both visible tab focus and visible-tab resume, not hidden events',()=>{
    const browser=syntheticBrowser();
    let calls=0;
    const detached=attachDemoResumeRevalidation({
      revalidate:async()=>{calls++;},
    },browser.ports);
    expect(browser.listeners()).toBe(2);
    browser.dispatchFocus();
    expect(calls).toBe(1);
    browser.hide();
    browser.dispatchFocus();
    browser.dispatchVisibility();
    expect(calls).toBe(1); // No browsing or background refresh while hidden
    browser.show();
    browser.dispatchVisibility();
    expect(calls).toBe(2);
    detached();
    expect(browser.listeners()).toBe(0);
    browser.dispatchFocus();
    expect(calls).toBe(2);
  });

  it('can be safely unmounted more than once during React StrictMode effect teardown',()=>{
    const browser=syntheticBrowser();
    let calls=0;
    const first=attachDemoResumeRevalidation({
      revalidate:async()=>{calls++;},
    },browser.ports);
    first();first();
    expect(browser.listeners()).toBe(0);
    const second=attachDemoResumeRevalidation({
      revalidate:async()=>{calls++;},
    },browser.ports);
    browser.dispatchFocus();
    expect(calls).toBe(1);
    second();
    expect(browser.listeners()).toBe(0);
  });

  it('refuses missing event subscribers rather than pretending to protect stale sessions',()=>{
    const browser=syntheticBrowser();
    expect(()=>attachDemoResumeRevalidation({
      revalidate:async()=>{},
    },{page:browser.ports.page,view:{} as never})).toThrow('trusted browser');
  });
});
