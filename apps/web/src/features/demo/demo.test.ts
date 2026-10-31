import {readFileSync} from 'node:fs';
import {describe, it, expect} from 'vitest';
import {makeApiError, type DemoContext, type DemoSnapshot} from '@hufs-one/contracts';
import {
  buildSelectorSlots,
  buildDemoScreenView,
  canRetry,
  initialDemoSession,
  reduceDemoSession,
  type DemoSessionEvent,
  type DemoSessionState,
} from './index.js';

/** Synthetic fixtures only; never point this at csv/ or local_only/. */
function fixture<T>(name: string): T {
  if (!/^[a-z0-9-]+\.json$/.test(name)) throw new Error('Fixture scope denied');
  return JSON.parse(readFileSync(new URL('../../../../../packages/fixtures/synthetic/' + name, import.meta.url), 'utf8')) as T;
}

const ctxS01 = fixture<DemoContext>('demo-context.json');
const snapS01 = fixture<DemoSnapshot>('demo-snapshot.json');
const ctxS02: DemoContext = {...ctxS01, contextId: 'SYN-CTX-02', demoSubjectId: 'S02'};
const snapS02: DemoSnapshot = {...snapS01, contextId: 'SYN-CTX-02', demoSubjectId: 'S02'};

function run(events: DemoSessionEvent[], from: DemoSessionState = initialDemoSession): DemoSessionState {
  return events.reduce(reduceDemoSession, from);
}

describe('5-slot selector', () => {
  it('renders five rows; PENDING S05 is visible but not selectable', () => {
    const result = buildSelectorSlots(fixture('demo-profiles.json'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slots.map(s => s.demoSubjectId)).toEqual(['S01', 'S02', 'S03', 'S04', 'S05']);
    expect(result.slots.slice(0, 4).every(s => s.selectable)).toBe(true);
    const s05 = result.slots[4]!;
    expect(s05.selectable).toBe(false);
    expect(s05.ariaLabel).toContain('자료 준비 중');
    expect(s05.ariaLabel).toContain('선택할 수 없음');
    expect(s05.dataBadge).toBe('합성 자료');
  });
  it('renders no rows for a malformed or 4-slot payload instead of guessing', () => {
    const profiles = fixture<{profiles: unknown[]}>('demo-profiles.json').profiles;
    expect(buildSelectorSlots({profiles: profiles.slice(0, 4)}).ok).toBe(false);
    expect(buildSelectorSlots(null).ok).toBe(false);
  });
});

describe('request epoch session', () => {
  it('shows a current snapshot for the selected subject', () => {
    const s = run([{type: 'SELECT', context: ctxS01}, {type: 'SNAPSHOT_RECEIVED', requestEpoch: 1, payload: snapS01}]);
    expect(s.status).toBe('READY');
    expect(s.snapshot?.demoSubjectId).toBe('S01');
  });
  it('clears the previous subject immediately on reselect and drops its late response', () => {
    const ready = run([{type: 'SELECT', context: ctxS01}, {type: 'SNAPSHOT_RECEIVED', requestEpoch: 1, payload: snapS01}]);
    const switching = reduceDemoSession(ready, {type: 'SELECT', context: ctxS02});
    expect(switching.status).toBe('LOADING');
    expect(switching.snapshot).toBeNull();
    const late = reduceDemoSession(switching, {type: 'SNAPSHOT_RECEIVED', requestEpoch: 1, payload: snapS01});
    expect(late.snapshot).toBeNull();
    expect(late.droppedResponses).toBe(1);
    const done = reduceDemoSession(late, {type: 'SNAPSHOT_RECEIVED', requestEpoch: 2, payload: snapS02});
    expect(done.snapshot?.demoSubjectId).toBe('S02');
  });
  it('drops a same-epoch response carrying another subject or dataset version', () => {
    const loading = run([{type: 'SELECT', context: ctxS02}]);
    expect(reduceDemoSession(loading, {type: 'SNAPSHOT_RECEIVED', requestEpoch: 1, payload: snapS01}).snapshot).toBeNull();
    const otherVersion = {...snapS02, versions: {...snapS02.versions, dataset: 'D2'}};
    expect(reduceDemoSession(loading, {type: 'SNAPSHOT_RECEIVED', requestEpoch: 1, payload: otherVersion}).status).toBe('LOADING');
  });
  it('drops duplicate responses after READY', () => {
    const ready = run([{type: 'SELECT', context: ctxS01}, {type: 'SNAPSHOT_RECEIVED', requestEpoch: 1, payload: snapS01}]);
    const dup = reduceDemoSession(ready, {type: 'ERROR_RECEIVED', requestEpoch: 1, payload: makeApiError('PROVIDER_UNAVAILABLE', 'SYN-REQ-9')});
    expect(dup.status).toBe('READY');
    expect(dup.droppedResponses).toBe(1);
  });
  it('keeps two tabs isolated: each tab state only accepts its own context', () => {
    const tab1 = run([{type: 'SELECT', context: ctxS01}]);
    const tab2 = run([{type: 'SELECT', context: ctxS02}]);
    expect(reduceDemoSession(tab2, {type: 'SNAPSHOT_RECEIVED', requestEpoch: 1, payload: snapS01}).snapshot).toBeNull();
    expect(reduceDemoSession(tab1, {type: 'SNAPSHOT_RECEIVED', requestEpoch: 1, payload: snapS01}).snapshot?.demoSubjectId).toBe('S01');
  });
  it('never renders a malformed snapshot (e.g. raw course rows)', () => {
    const raw = {...snapS01, academics: {state: 'READY', courseRows: [1, 2, 3]}};
    const s = run([{type: 'SELECT', context: ctxS01}, {type: 'SNAPSHOT_RECEIVED', requestEpoch: 1, payload: raw}]);
    expect(s.status).toBe('INVALID');
    expect(s.snapshot).toBeNull();
  });
  it('rejects a malformed context without starting a request', () => {
    const s = run([{type: 'SELECT', context: {...ctxS01, demoSubjectId: 'S09'}}]);
    expect(s.status).toBe('INVALID');
    expect(s.context).toBeNull();
    expect(canRetry(s)).toBe(false);
  });
});

describe('403 / 409 / 503 / 401 states', () => {
  const loading = run([{type: 'SELECT', context: ctxS01}]);
  const err = (code: Parameters<typeof makeApiError>[0], contextId?: string) =>
    reduceDemoSession(loading, {type: 'ERROR_RECEIVED', requestEpoch: 1, payload: makeApiError(code, 'SYN-REQ-1', contextId)});

  it('403 SHARING_REVOKED clears data and offers no retry', () => {
    const s = err('SHARING_REVOKED', ctxS01.contextId);
    expect(s.status).toBe('REVOKED');
    expect(s.snapshot).toBeNull();
    expect(canRetry(s)).toBe(false);
    expect(s.error?.message).toBe('공유 허용이 변경되었습니다.');
  });
  it('409 VERSION_CONFLICT retries with a new epoch and drops the old one', () => {
    const conflict = err('VERSION_CONFLICT');
    expect(conflict.status).toBe('CONFLICT');
    const retry = reduceDemoSession(conflict, {type: 'RETRY'});
    expect(retry.epoch).toBe(2);
    expect(reduceDemoSession(retry, {type: 'SNAPSHOT_RECEIVED', requestEpoch: 1, payload: snapS01}).snapshot).toBeNull();
    expect(reduceDemoSession(retry, {type: 'SNAPSHOT_RECEIVED', requestEpoch: 2, payload: snapS01}).status).toBe('READY');
  });
  it('503 is retryable; 401 is not', () => {
    expect(canRetry(err('PROVIDER_UNAVAILABLE'))).toBe(true);
    const signedOut = err('UNAUTHENTICATED');
    expect(signedOut.status).toBe('SIGNED_OUT');
    expect(canRetry(signedOut)).toBe(false);
  });
  it('ignores an error tagged with another context', () => {
    const s = err('SHARING_REVOKED', 'SYN-CTX-OTHER');
    expect(s.status).toBe('LOADING');
    expect(s.droppedResponses).toBe(1);
  });
  it('replaces an unparseable error body with a safe generic message', () => {
    const s = reduceDemoSession(loading, {type: 'ERROR_RECEIVED', requestEpoch: 1, payload: {stack: 'SELECT * FROM students', token: 'x'}});
    expect(s.status).toBe('UNAVAILABLE');
    expect(s.error?.message).toBe('현재 외부 서비스를 사용할 수 없습니다.');
    expect(JSON.stringify(s)).not.toContain('SELECT');
  });
});

describe('section visibility', () => {
  it('shows only allowed sections; ACADEMICS data is hidden when not allowed', () => {
    const withAcademics = {
      ...snapS01,
      academics: {
        state: 'READY', rulePackVersion: 'R1', asOf: snapS01.asOf,
        earnedCreditUnits: 0, inProgressCreditUnits: 0, plannedCreditUnits: 0, deficits: [], caveats: [],
      },
    } as DemoSnapshot;
    const view = buildDemoScreenView(withAcademics, ['FEED', 'NOTICES']);
    expect(view.feed.kind).toBe('SHOW');
    expect(view.notices.kind).toBe('SHOW');
    expect(view.academics.kind).toBe('HIDDEN');
    expect(view.forecast.kind).toBe('HIDDEN');
  });
  it('shows a placeholder for allowed but PENDING sections', () => {
    const view = buildDemoScreenView(snapS01, ['FEED', 'ACADEMICS', 'FORECAST']);
    expect(view.academics).toEqual({kind: 'PLACEHOLDER', text: '아직 준비 중인 정보입니다.'});
    expect(view.forecast.kind).toBe('PLACEHOLDER');
    expect(view.notices.kind).toBe('HIDDEN');
  });
  it('labels synthetic data/AI mock and shows server eligibility verbatim', () => {
    const view = buildDemoScreenView(snapS01, ['FEED']);
    expect(view.snapshotBadges).toEqual(['합성 자료', 'AI 예시(모의)']);
    if (view.feed.kind !== 'SHOW') throw new Error('feed hidden');
    expect(view.feed.data.featured.length).toBeLessThanOrEqual(3);
    expect(view.feed.data.compact.length).toBeLessThanOrEqual(6);
    expect(view.feed.data.featured.map(c => c.eligibilityText)).toEqual(['자격 확인 필요', '지원 조건 충족']);
    expect(view.feed.data.featured[0]!.badges).toEqual(['합성 공고']);
  });
});
