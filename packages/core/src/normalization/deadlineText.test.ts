import {describe, it, expect} from 'vitest';
import {parseDeadlineText} from './index.js';

describe('HUFSAbility deadline text (교외채용 마감일시/마감기한)', () => {
  it('dates become Seoul end of day; an explicit time is kept in +09:00', () => {
    expect(parseDeadlineText('2026-11-25')).toEqual({kind:'DATETIME', iso:'2026-11-25T23:59:59+09:00'});
    expect(parseDeadlineText('2026.11.5')).toEqual({kind:'DATETIME', iso:'2026-11-05T23:59:59+09:00'});
    expect(parseDeadlineText('2026/11/25 (수) 18:00까지')).toEqual({kind:'DATETIME', iso:'2026-11-25T18:00:00+09:00'});
  });
  it('rolling recruitment is ROLLING, never a guessed date', () => {
    for (const raw of ['상시채용', '상시', '채용시 마감', '채용 시 마감', '수시채용', '충원시 마감']) {
      expect(parseDeadlineText(raw).kind).toBe('ROLLING');
    }
  });
  it('anything else is UNKNOWN (impossible dates, vague words, bad times)', () => {
    for (const raw of ['2026-02-30', '다음 주', '11월 말', '2026-11-25 25:00', '']) {
      expect(parseDeadlineText(raw).kind).toBe('UNKNOWN');
    }
  });
});
