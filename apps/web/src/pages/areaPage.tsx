import type {PageRenderer} from '../App.js';
import {InAppLink} from '../shell/AppShell.js';
import {AREAS} from '../shell/areas.js';
import {MENU_GROUPS} from '../shell/menuCatalog.js';

const OUR_TEXT: Readonly<Record<string, string>> = {
  '/graduation': '취득·수강 중·계획 학점과 요건 현황, 수강계획 검사를 나란히 봅니다.',
  '/graduation/what-if': '전공을 바꾸거나 더하면 요건이 어떻게 달라지는지 가정해 봅니다.',
  '/saved': '보관한 공고와 연습 기록을 모아 봅니다.',
  '/clubs': '가상 동아리 모집 공고를 관심 분야에 맞춰 봅니다.',
  '/opportunities': '전공·학년·관심 분야에 맞춘 공고를 추천 이유와 함께 봅니다.',
  '/applications': '관심 → 준비 → 지원 → 결과 대기를 내가 직접 기록합니다.',
  '/experience': '활동을 기록하고, AI 후보 태그는 내가 승인한 것만 추천에 씁니다.',
  '/notices': '나와 관련된 학사 공지와 확정 마감을 봅니다.',
};

const OWNER_ONLY_ROUTES = new Set(MENU_GROUPS.find(g => g.id === 'owner-independent')?.items
  .flatMap(i => i.route ? [i.route] : []) ?? []);

/**
 * /area/:id (UIUX master spec TYPE_GUIDE): what HUFS One AI offers inside one of the 11 observed
 * HUFSAbility areas, and the area's original menu names, which this demo does not provide.
 */
export const areaPage: PageRenderer = ({path, navigate}) => {
  const m = /^\/area\/([a-z-]+)$/.exec(path);
  if (!m) return null;
  const area = AREAS.find(a => a.id === m[1]);
  if (!area) return null;
  return {
    title: area.label,
    body: (
      <>
        <p className="notice-box" role="note">
          HUFSAbility에서 관찰한 메뉴 구조를 따라 정리한 화면입니다. HUFS One AI는 학교 공식 서비스가 아니며, 아래 원래 메뉴의 기능은 이번 시연에서 제공하지 않습니다.
        </p>
        <section className="section" aria-label="ONE AI에서 쓸 수 있는 화면">
          <div className="section__head"><h2>ONE AI에서 쓸 수 있는 화면</h2></div>
          {area.ours.length
            ? <ul className="area__cards">{area.ours.map(o => (
              <li key={o.route} className="area__card">
                <h3><InAppLink to={o.route} navigate={navigate}>{o.label}</InAppLink></h3>
                {OWNER_ONLY_ROUTES.has(o.route) && <span className="area__status">본인 인증·승인 자료 필요</span>}
                {OUR_TEXT[o.route] && <p>{OUR_TEXT[o.route]}</p>}
              </li>
            ))}</ul>
            : <p className="muted">이 영역에는 이번 시연에서 HUFS One AI 화면이 없습니다.</p>}
        </section>
        <section className="section" aria-label="원래 메뉴">
          <div className="section__head"><h2>원래 메뉴 <span className="muted area__count">{area.observed.length}개 · 이번 시연 미지원</span></h2></div>
          <ul className="area__observed">{area.observed.map(o => <li key={o}><span>{o}</span><span className="lnb__off">미지원</span></li>)}</ul>
        </section>
      </>
    ),
  };
};
