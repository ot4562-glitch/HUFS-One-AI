import type {SelfConsent} from '@hufs-one/contracts';

/** No private profile, portfolio, or saved records without current personal-storage consent. */
export function requireCareerConsent(consent:SelfConsent|null):SelfConsent {
  if(!consent?.choices.personalStorage)throw new Error('Career personal-storage consent missing');
  return consent;
}

/** Discard a mixed/stale response when consent changes during owner-only reads. */
export function assertCareerConsentCurrent(before:SelfConsent,after:SelfConsent|null,
  portfolioConsentVersion:number):void {
  if(!after?.choices.personalStorage
    ||after.version!==before.version
    ||portfolioConsentVersion!==after.version)
    throw new Error('Career consent revoked or changed during read');
}
