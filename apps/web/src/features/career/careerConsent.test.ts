import {describe,expect,it} from 'vitest';
import {assertCareerConsentCurrent,requireCareerConsent} from './careerConsent.js';

const current={
  version:3,updatedAt:'2026-11-07T00:00:00.000Z',
  choices:{personalStorage:true,teamReview:false,externalAi:false,ncpStorage:false,presentation:false},
} as const;

describe('#317 owner career consent read boundary',()=>{
  it('requires the current personal-storage grant before reading owner records',()=>{
    expect(requireCareerConsent(current)).toEqual(current);
    expect(()=>requireCareerConsent(null)).toThrow();
    expect(()=>requireCareerConsent({...current,choices:{...current.choices,personalStorage:false}})).toThrow();
  });
  it('rejects revocation, consent-version changes, and stale portfolio versions after loading',()=>{
    expect(()=>assertCareerConsentCurrent(current,current,3)).not.toThrow();
    expect(()=>assertCareerConsentCurrent(current,null,3)).toThrow();
    expect(()=>assertCareerConsentCurrent(current,
      {...current,choices:{...current.choices,personalStorage:false}},3)).toThrow();
    expect(()=>assertCareerConsentCurrent(current,{...current,version:4},4)).toThrow();
    expect(()=>assertCareerConsentCurrent(current,current,2)).toThrow();
  });
});
