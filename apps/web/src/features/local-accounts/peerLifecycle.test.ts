// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {observePeerFreshness} from './peerLifecycle.js';
afterEach(()=>vi.useRealTimers());
it('checks only visible peers on focus, visibility and bounded polling, then removes listeners and timer',()=>{
  vi.useFakeTimers();let visibility='visible';
  Object.defineProperty(document,'visibilityState',{get:()=>visibility,configurable:true});
  const check=vi.fn();const dispose=observePeerFreshness(check,window,document);
  window.dispatchEvent(new Event('focus'));expect(check).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(15_000);expect(check).toHaveBeenCalledTimes(2);
  visibility='hidden';vi.advanceTimersByTime(30_000);window.dispatchEvent(new Event('focus'));expect(check).toHaveBeenCalledTimes(2);
  visibility='visible';document.dispatchEvent(new Event('visibilitychange'));expect(check).toHaveBeenCalledTimes(3);
  dispose();vi.advanceTimersByTime(60_000);window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));
  expect(check).toHaveBeenCalledTimes(3);expect(vi.getTimerCount()).toBe(0);
});
