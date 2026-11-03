import {describe, expect, it} from 'vitest';
import {parseCreditInput, parseProfileDraft, profileDraft} from './profileDraft.js';

const blank = {displayName:'빈 데모 계정', primaryMajor:null, doubleMajorStatus:'UNSET' as const,
  doubleMajor:null, earnedCredits:null, interestTopics:[], desiredJobTopics:[], campus:null, cohort:null};

describe('local account profile input', () => {
  it('keeps missing credits distinct from explicitly entered zero', () => {
    expect(parseCreditInput('')).toBeNull();
    expect(parseCreditInput('0')).toBe(0);
    expect(profileDraft(blank).earnedCredits).toBe('');
    expect(profileDraft({...blank, earnedCredits:0}).earnedCredits).toBe('0');
  });
  it('rejects negative, nonnumeric, infinite credits instead of coercing them to missing', () => {
    for (const input of ['-1', 'abc', 'Infinity']) expect(() => parseCreditInput(input)).toThrow();
  });
  it('keeps empty major null, and rejects inconsistent selected double major', () => {
    expect(parseProfileDraft(profileDraft(blank)).primaryMajor).toBeNull();
    expect(() => parseProfileDraft({...profileDraft(blank), doubleMajorStatus:'SELECTED'})).toThrow();
    expect(parseProfileDraft({...profileDraft(blank), doubleMajorStatus:'NONE', doubleMajor:'옛 입력'}).doubleMajor).toBeNull();
  });
});
