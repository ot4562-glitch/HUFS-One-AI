import {LocalAccountProfileSchema, type LocalAccountProfile} from '@hufs-one/contracts';

export type ProfileDraft = Omit<LocalAccountProfile,'primaryMajor'|'doubleMajor'|'earnedCredits'|'cohort'|'campus'> & {
  primaryMajor:string; doubleMajor:string; earnedCredits:string; cohort:string; campus:''|'SEOUL'|'GLOBAL';
};
export function profileDraft(profile:LocalAccountProfile):ProfileDraft {
  return {...profile, primaryMajor:profile.primaryMajor ?? '', doubleMajor:profile.doubleMajor ?? '',
    earnedCredits:profile.earnedCredits === null ? '' : String(profile.earnedCredits),
    cohort:profile.cohort === null ? '' : String(profile.cohort), campus:profile.campus ?? ''};
}
export function parseCreditInput(input:string):number|null {
  if (!input.trim()) return null;
  const value=Number(input);
  if (!Number.isFinite(value) || value<0) throw new Error('취득학점은 0 이상의 숫자로 입력해 주세요.');
  return value;
}
export function parseProfileDraft(draft:ProfileDraft):LocalAccountProfile {
  return LocalAccountProfileSchema.parse({...draft, displayName:draft.displayName.trim(), primaryMajor:draft.primaryMajor.trim()||null,
    doubleMajor:draft.doubleMajorStatus==='SELECTED' ? draft.doubleMajor.trim()||null : null,
    earnedCredits:parseCreditInput(draft.earnedCredits), campus:draft.campus||null,
    cohort:draft.cohort.trim() ? Number(draft.cohort) : null});
}
