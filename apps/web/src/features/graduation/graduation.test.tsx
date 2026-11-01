// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {AcademicSummarySchema} from '@hufs-one/contracts';
import {DemoController} from '../../app/index.js';
import {SyntheticDemoClient} from '../../dev/syntheticDemoClient.js';
import {App} from '../../App.js';
import {appPages} from '../../pages/index.js';
import type {HistoryPort} from '../../shell/router.js';
import {buildGraduationView, creditsText} from './graduationView.js';

afterEach(cleanup);
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); });
const history = (): HistoryPort => ({location: {pathname: '/graduation'}, history: {pushState: () => {}}, addEventListener: () => {}, removeEventListener: () => {}});
async function open(i: number) {
  render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'RUN')} historyPort={history()} pages={appPages} />);
  await flush();
  fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[i]!);
  await flush();
}

describe('graduation view model', () => {
  it('converts units to credits and never sums earned/in-progress/planned', () => {
    expect(creditsText(12)).toBe('6학점');
    expect(creditsText(13)).toBe('6.5학점');
    const g = buildGraduationView(AcademicSummarySchema.parse({
      state: 'INSUFFICIENT_DATA', rulePackVersion: 'SYN-R', asOf: '2026-11-20T00:00:00.000Z',
      earnedCreditUnits: 10, inProgressCreditUnits: 4, plannedCreditUnits: 2, deficits: [], caveats: [],
    }));
    expect(g.credits.map(c => c.credits)).toEqual(['5학점', '2학점', '1학점']);
    expect(JSON.stringify(g)).not.toContain('8학점');
    expect(g.stateText).toBe('자료가 부족해 판단할 수 없음');
  });
});

describe('졸업 page', () => {
  it('S01: separate credit lines, deficits, not-official note and outlook that is not a confirmation', async () => {
    await open(0);
    expect(screen.getByRole('note').textContent).toContain('공식 졸업 판정이 아닙니다');
    const credits = Array.from(document.querySelectorAll('.credits div'), d => d.textContent);
    expect(credits).toEqual(['취득95학점', '수강 중18학점', '계획12학점']);
    expect(screen.getByText('SYN-REQ-MAJOR-CORE · 부족 · 3학점 부족')).toBeTruthy();
    expect(screen.getByText(/과거 개설 패턴 — 확정 아님/)).toBeTruthy();
    expect(screen.getByText(/같은 학기 4번 중 3번 개설/)).toBeTruthy();
  });

  it('S02 (academics pending): placeholders, no numbers from another subject', async () => {
    await open(1);
    expect(screen.getAllByText('아직 준비 중인 정보입니다.')).toHaveLength(2);
    expect(screen.queryByText(/95학점/)).toBeNull();
  });

  it('S03 (academics not shared): out-of-scope text only', async () => {
    await open(2);
    expect(screen.getAllByText('이 항목은 시연 공유 범위 밖입니다.')).toHaveLength(2);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
