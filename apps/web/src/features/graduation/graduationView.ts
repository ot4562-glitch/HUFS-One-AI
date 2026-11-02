import type {AcademicSummary, ForecastSummary} from '@hufs-one/contracts';

/**
 * 졸업 화면 모델. Values come from the academics track's summary as-is: the UI never adds up
 * credits, decides a requirement or turns a pattern into a confirmed offering.
 * 1 credit unit = 0.5 credit (contracts CreditUnitsSchema).
 */
export interface CreditLine { readonly label: string; readonly credits: string }

export interface GraduationView {
  readonly stateText: string;
  /** Always shown: this screen is support, not an official graduation decision. */
  readonly notOfficialText: string;
  readonly credits: readonly CreditLine[];
  readonly deficits: readonly {readonly id: string; readonly text: string}[];
  readonly caveats: readonly string[];
  readonly rulePackText: string;
}

export interface OutlookItemView {
  readonly courseId: string;
  readonly targetTerm: string;
  readonly signalText: string;
  readonly basisText: string;
  readonly caveat: string;
}

const STATE_TEXT: Record<AcademicSummary['state'], string> = {
  READY: '규칙 적용 결과',
  NEEDS_REVIEW: '검토가 필요한 결과',
  INSUFFICIENT_DATA: '자료가 부족해 판단할 수 없음',
};

const DEFICIT_TEXT: Record<AcademicSummary['deficits'][number]['state'], string> = {
  MISSING: '부족',
  NEEDS_REVIEW: '검토 필요',
  UNKNOWN: '확인 불가',
};

const SIGNAL_TEXT: Record<ForecastSummary['items'][number]['signal'], string> = {
  CONFIRMED_OFFERED: '개설 확정(공식 공지)',
  CONFIRMED_NOT_OFFERED: '미개설 확정(공식 공지)',
  HISTORICAL_PATTERN: '과거 개설 패턴 — 확정 아님',
  INSUFFICIENT_DATA: '자료 부족',
  UNKNOWN: '알 수 없음',
};

const COVERAGE_TEXT: Record<ForecastSummary['items'][number]['coverage'], string> = {
  COMPLETE_TERM_CATALOG: '학기 개설목록 전체 확인',
  PARTIAL: '일부 학기 자료만 확인',
  UNKNOWN: '자료 범위 알 수 없음',
};

/** "12" units → "6학점", "13" → "6.5학점". */
export function creditsText(units: number): string {
  return `${units % 2 === 0 ? units / 2 : (units / 2).toFixed(1)}학점`;
}

/** Shown on the 졸업 section in every state (shown, pending, not shared), not only with numbers. */
export const NOT_OFFICIAL_GRADUATION_TEXT = '공식 졸업 판정이 아닙니다. 확정은 학과·학사지원팀에서 확인해 주세요.';

export function buildGraduationView(s: AcademicSummary): GraduationView {
  return {
    stateText: STATE_TEXT[s.state],
    notOfficialText: NOT_OFFICIAL_GRADUATION_TEXT,
    // Kept separate on purpose: earned, in progress and planned are never summed into one number.
    credits: [
      {label: '취득', credits: creditsText(s.earnedCreditUnits)},
      {label: '수강 중', credits: creditsText(s.inProgressCreditUnits)},
      {label: '계획', credits: creditsText(s.plannedCreditUnits)},
    ],
    deficits: s.deficits.map(d => ({
      id: d.requirementId,
      text: `${d.requirementId} · ${DEFICIT_TEXT[d.state]}${d.missingCreditUnits !== undefined ? ` · ${creditsText(d.missingCreditUnits)} 부족` : ''}`,
    })),
    caveats: s.caveats,
    rulePackText: `적용 규칙 ${s.rulePackVersion}`,
  };
}

export function buildOutlookView(f: ForecastSummary): readonly OutlookItemView[] {
  return f.items.map(i => ({
    courseId: i.courseId,
    targetTerm: i.targetTerm,
    signalText: SIGNAL_TEXT[i.signal],
    basisText: `${COVERAGE_TEXT[i.coverage]} · 같은 학기 ${i.sameSeasonObservedTerms}번 중 ${i.sameSeasonOfferedTerms}번 개설`,
    caveat: i.caveat,
  }));
}
