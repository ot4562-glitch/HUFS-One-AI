import {describe, expect, it} from 'vitest';
import {OpportunitySchema, type OpportunityCatalogDetail} from '@hufs-one/contracts';
import {buildBoard, SELF_REPORT_TEXT} from './boardView.js';
import {seedOwnerRecords} from '../../dev/syntheticOwnerServer.js';
import {DEMO_AS_OF, DEMO_OPPORTUNITIES} from '../../../../../packages/core/src/opportunities/index.js';

const detail = (id: string, patch: Record<string, unknown> = {}): OpportunityCatalogDetail => {
  const o = DEMO_OPPORTUNITIES.find(x => x.id === id)!;
  return {opportunity: OpportunitySchema.parse({...o, ...patch}), source: {sourceId: 'S', revisionId: o.sourceSnapshotId, permissionRef: 'p', status: 'SYNTHETIC'}};
};

describe('#80 board view model', () => {
  const {bookmarks, tasks} = seedOwnerRecords();
  const ids = ['SYN-OPP-002', 'SYN-OPP-004', 'SYN-OPP-006', 'SYN-OPP-010', 'SYN-OPP-013', 'SYN-OPP-015'];
  const details = new Map<string, OpportunityCatalogDetail | null>([...ids.map(id => [id, detail(id)] as const), ['SYN-OPP-999', null]]);
  const board = buildBoard(bookmarks, tasks, details, DEMO_AS_OF);
  const card = (itemId: string) => board.flatMap(c => c.cards).find(c => c.itemId === itemId)!;

  it('five columns in order; a legacy SAVED row without a stage starts at 관심', () => {
    expect(board.map(c => c.title)).toEqual(['관심', '준비 중', '지원 완료', '결과 대기', '결과 기록']);
    expect(card('bm-06').stage).toBe('INTERESTED');
    expect(board[0]!.cards.map(c => c.itemId).sort()).toEqual(['bm-01', 'bm-06']);
  });

  it('from 지원 완료 on, the card is marked as the student’s own unverified record', () => {
    expect(['bm-01', 'bm-02'].map(id => card(id).selfReported)).toEqual([false, false]);
    expect(['bm-03', 'bm-04', 'bm-05'].map(id => card(id).selfReported)).toEqual([true, true, true]);
    expect(SELF_REPORT_TEXT).toContain('확인되지 않음');
  });

  it('offers only the next stage; the last stage offers nothing', () => {
    expect(card('bm-01').next).toEqual({stage: 'PREPARING', label: '준비 시작'});
    expect(card('bm-04').next?.stage).toBe('RESULT_RECORDED');
    expect(card('bm-05').next).toBeNull();
    expect(card('bm-05').outcomeText).toBe('대기 · 가상 메모');
  });

  it('a posting that cannot be read keeps its record with no title or deadline', () => {
    expect(card('bm-07')).toMatchObject({title: null, deadlineText: null, dday: null, stage: 'PREPARING'});
  });

  it('tasks attach by opportunity; D-day only from the server asOf and a confirmed deadline', () => {
    expect(card('bm-02').tasks.map(t => [t.task, t.done])).toEqual([['가상 자기소개서 초안 쓰기', true], ['가상 포트폴리오 링크 정리', false]]);
    const at = '2026-11-24T00:00:00.000Z';
    const b = (patch: Record<string, unknown>, asOf: string | null) =>
      buildBoard(bookmarks, [], new Map([['SYN-OPP-002', detail('SYN-OPP-002', patch)]]), asOf).flatMap(c => c.cards).find(c => c.itemId === 'bm-01')!;
    expect(b({applyClosesAt: at, deadlineKind: 'FIXED'}, DEMO_AS_OF).dday?.text).toBe('D-4');
    expect(b({applyClosesAt: at, deadlineKind: 'FIXED'}, null)).toMatchObject({dday: null, deadlineText: '마감 11월 24일 (화) 09:00'});
    expect(b({applyClosesAt: at, deadlineKind: 'ROLLING'}, DEMO_AS_OF)).toMatchObject({dday: null, deadlineText: null});
  });
});
