/**
 * Content title row of the Essential mockups (icon · page title · small chip · one line). The banner's h1
 * already names the page, so the repeated title here is hidden from screen readers; the line is not.
 */
const META: Readonly<Record<string, {chip: string; line: string; icon: string}>> = {
  '/notices': {chip: '개인 맞춤', line: '내 전공·학년·이수 현황을 바탕으로 나에게 해당하는 공지와 확정 마감을 먼저 보여 드려요.', icon: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5'},
  '/graduation': {chip: '규칙 기반 종합 현황', line: '내 학점과 이수 현황, 수강계획 검사를 함께 확인하세요. 공식 졸업 판정이 아닙니다.', icon: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5'},
  '/graduation/what-if': {chip: '시나리오 비교', line: '전공을 바꾸거나 더하면 요건이 어떻게 달라지는지 가정해 보세요. 실제 전공 변경이 아닙니다.', icon: 'M4 19h16M7 16V9M12 16V5M17 16v-4'},
  '/experience': {chip: '내 활동 기록', line: '지금까지의 활동을 한곳에 모아 두세요. AI가 제안한 태그는 내가 승인한 것만 추천에 쓰여요.', icon: 'M5 4h10l4 4v12H5zM14 4v5h5'},
  '/applications': {chip: '자기기록 관리', line: '저장한 기회와 준비 중인 지원 활동을 단계별로 정리하고 다음 할 일을 확인하세요.', icon: 'M4 7h16v12H4zM9 7V4h6v3'},
  '/saved': {chip: '내 관심 기회 관리', line: '저장한 공고와 모의 지원, 지원서 초안을 한곳에서 확인하세요.', icon: 'M6 3h12v18l-6-4-6 4z'},
  '/clubs': {chip: '승인된 모집 공고', line: '승인된 동아리의 모집 공고를 탐색하고 관심 있는 동아리 활동을 찾아보세요.', icon: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M16 11a3 3 0 1 0 0-6M16 15c3 0 6 2 6 5'},
  '/settings': {chip: '나에게 맞춘 HUFS One AI', line: '관심 분야를 바꿔 보고, 같은 기준 시각에서 추천이 어떻게 달라지는지 비교하세요.', icon: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3'},
};

export function PageHead({path, title}: {path: string; title: string}) {
  const meta = META[path];
  if (!meta) return null;
  return (
    <div className="phead">
      <div className="phead__row">
        <svg className="phead__icon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={meta.icon} /></svg>
        <span className="phead__title" aria-hidden="true">{title}</span>
        <span className="phead__chip">{meta.chip}</span>
      </div>
      <p className="phead__line">{meta.line}</p>
    </div>
  );
}
