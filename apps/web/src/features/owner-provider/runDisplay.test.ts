import {describe,it,expect} from 'vitest';
import {providerRunMode,AI_RUN_MODE_TEXT} from './runDisplay.js';
describe('#317 three explicit AI provenance modes',()=>{
 it('never treats an absent or pending job as a completed provider call',()=>{
   expect(providerRunMode(null,null)).toBe('NOT_RUN');
   expect(providerRunMode({jobId:'00000000-0000-4000-8000-000000000001',state:'PENDING'},null)).toBe('PENDING');
 });
 it('separates server attested live and cached candidate from an invented synthetic example',()=>{
   const jobId='00000000-0000-4000-8000-000000000001';
   expect(providerRunMode({jobId,state:'NEEDS_REVIEW',provenance:'LIVE'},null)).toBe('LIVE_PROVIDER_RUN');
   expect(providerRunMode({jobId,state:'NEEDS_REVIEW',provenance:'CANDIDATE_CACHE'},null))
     .toBe('CACHED_PREVIOUS_RUN');
   expect(providerRunMode(null,null,true)).toBe('SYNTHETIC');
   expect(AI_RUN_MODE_TEXT.CACHED_PREVIOUS_RUN).toContain('재과금이 아닙니다');
 });
});
