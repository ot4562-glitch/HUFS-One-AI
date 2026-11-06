import type {PageRenderer} from '../App.js';
import {InAppLink} from '../shell/AppShell.js';
import {AREAS} from '../shell/areas.js';

const OUR_TEXT: Readonly<Record<string, string>> = {
  '/graduation': '취득·수강 중·계획 학점과 요건 현황, 수강계획 검사를 나란히 봅니다.',
  '/graduation/what-if': '전공을 바꾸거나 더하면 요건이 어떻게 달라지는지 가정해 봅니다.',
  '/saved': '보관한 공고와 연습 기록을 모아 봅니다.',
  '/clubs': '가상 동아리 모집 공고를 관심 분야에 맞춰 봅니다.',
  '/opportunities': '전공·학년·관심 분야에 맞춘 공고를 추천 이유와 함께 봅니다.',
  '/applications': '관심 → 준비 → 지원 → 결과 대기를 내가 직접 기록합니다.',
  '/experience': '활동을 기록하고, AI 후보 태그는 내가 승인한 것만 추천에 씁니다.',
  '/notices': '나와 관련된 학사 공지와 확정 마감을 봅니다.',
  '/menu': 'HUFS One AI의 모든 메뉴와 학교 HUFSAbility 원래 메뉴(미지원)를 한눈에 봅니다.',
  '/settings': '관심 분야를 바꿔 보고 같은 기준 시각의 전후 결과를 비교합니다.',
};

/**
 * /area/:id: what HUFS One AI offers inside one top menu of the design mockups, and the menu's other
 * entries, which this demo does not provide (plain text, never links).
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
          HUFS One AI는 학교 공식 서비스가 아닌 독립 학생 프로젝트입니다. 아래 ‘미지원’ 메뉴는 이번 시연에서 제공하지 않으며, 학교 업무는 학교 공식 서비스에서 확인해 주세요.
        </p>
        <section className="section" aria-label="ONE AI에서 쓸 수 있는 화면">
          <div className="section__head"><h2>ONE AI에서 쓸 수 있는 화면</h2></div>
          {area.ours.length
            ? <ul className="area__cards">{area.ours.map(o => (
              <li key={o.route} className="area__card">
                <h3><InAppLink to={o.route} navigate={navigate}>{o.label}</InAppLink></h3>
                <p>{OUR_TEXT[o.route] ?? ''}</p>
              </li>
            ))}</ul>
            : <p className="muted">이 영역에는 이번 시연에서 HUFS One AI 화면이 없습니다.</p>}
        </section>
        <section className="section" aria-label="미지원 메뉴">
          <div className="section__head"><h2>미지원 메뉴 <span className="muted area__count">{area.planned.length}개 · 이번 시연에서 제공하지 않음</span></h2></div>
          <ul className="area__observed">{area.planned.map(o => <li key={o}><span>{o}</span><span className="lnb__off">미지원</span></li>)}</ul>
        </section>
      </>
    ),
  };
};
