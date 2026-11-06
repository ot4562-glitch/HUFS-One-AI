import type {ReactNode, Ref} from 'react';
import {InAppLink} from './AppShell.js';
import {areaOf, areaPath, currentAreaLink, type Area} from './areas.js';

const HERO_URL = new URL('./assets/hero.webp', import.meta.url).href;

/** Pages outside the menus still get a breadcrumb parent. */
const OTHER_SECTIONS: readonly {route: string; label: string}[] = [
  {route: '/demo-profile', label: '프로필'}, {route: '/reviewer', label: '심사 안내'},
];

export function sectionOf(path: string): {route: string; label: string} | null {
  const area = areaOf(path);
  if (area) return {route: areaPath(area.id), label: area.label};
  return OTHER_SECTIONS.find(s => path === s.route || path.startsWith(s.route + '/')) ?? null;
}

/**
 * Page heading (#9 redesign, Essential mockups). Home: the P001 hero. Other pages: a full-width navy
 * banner reading "메뉴 › (화면 ›) 페이지" with a one-line description and the campus-free illustration
 * fading in on the right (no photos, seals or characters). The h1 is always the page title, so
 * focus-on-navigation and title tests are unchanged; the parts before it are the breadcrumb.
 */
export function PageBanner({path, title, navigate, headingRef, greeting}: {
  path: string; title: string; navigate: (p: string) => void; headingRef: Ref<HTMLHeadingElement>; greeting?: ReactNode;
}) {
  if (path === '/') {
    return (
      <section className="hero" style={{backgroundImage: `url(${HERO_URL})`}} aria-labelledby="page-title">
        <div className="hero__in">
          <h1 id="page-title" ref={headingRef} tabIndex={-1} className="hero__eyebrow page__title">{title}</h1>
          <p className="hero__tag">오늘도 가능성을 넓혀보세요</p>
          <p className="hero__kicker">ONE AI 개인화 홈</p>
          {greeting && <p className="hero__sub">{greeting}</p>}
        </div>
      </section>
    );
  }
  const area = areaOf(path);
  const section = sectionOf(path);
  const link = area ? currentAreaLink(area, path) : null;
  const crumbs: {label: string; to: string}[] = [];
  if (section && section.label !== title) crumbs.push({label: section.label, to: section.route});
  if (link && link.route !== path && link.label !== title) crumbs.push({label: link.label, to: link.route});
  return (
    <div className="band" style={{backgroundImage: `url(${HERO_URL})`}}>
      <div className="band__in">
        <div className="band__line">
          <nav className="band__crumb" aria-label="현재 위치">
            <InAppLink to="/" navigate={navigate} className="band__home"><span className="visually-hidden">홈</span><span aria-hidden="true">⌂</span></InAppLink>
            {crumbs.map(c => (
              <span key={c.to}> <span aria-hidden="true" className="band__sep">›</span> <InAppLink to={c.to} navigate={navigate}>{c.label}</InAppLink></span>
            ))}
            <span aria-hidden="true" className="band__sep"> ›</span>
          </nav>
          <h1 id="page-title" ref={headingRef} tabIndex={-1} className="page__title">{title}</h1>
        </div>
        {area && <p className="band__summary">{area.summary}</p>}
      </div>
    </div>
  );
}

/** Small line icons for the left menu, picked by the entry's wording. */
const ICONS: readonly [RegExp, string][] = [
  [/공지|알림/, 'M4 10v4h3l5 4V6L7 10H4zM16 9a4 4 0 0 1 0 6'],
  [/일정|캘린더|학사일정/, 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5'],
  [/졸업|학업|학점|성적/, 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5'],
  [/What-if|가정|시뮬레이션/, 'M4 19h16M7 16V9M12 16V5M17 16v-4'],
  [/추천|AI/, 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z'],
  [/경험|활동|포트폴리오|이력/, 'M5 4h10l4 4v12H5zM14 4v5h5'],
  [/지원|신청|증명/, 'M4 7h16v12H4zM9 7V4h6v3'],
  [/보관|저장/, 'M6 3h12v18l-6-4-6 4z'],
  [/동아리|커뮤니티|스터디/, 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6M2 20c0-3 3-5 6-5s6 2 6 5M16 15c3 0 6 2 6 5'],
  [/메뉴/, 'M4 6h16M4 12h16M4 18h16'],
  [/설정/, 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2'],
];
function Icon({label}: {label: string}) {
  const d = ICONS.find(([re]) => re.test(label))?.[1] ?? 'M6 3h9l3 3v15H6zM9 11h6M9 15h6';
  return <svg className="lnb__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>;
}

/**
 * Left menu for the current menu (mockup LNB): navy header, HUFS One AI's screens as links (current one
 * on a gold background), then the mockup's other entries as plain text marked 미지원 — never links.
 */
export function AreaNav({area, path, navigate}: {area: Area; path: string; navigate: (p: string) => void}) {
  const current = currentAreaLink(area, path);
  return (
    <nav className="lnb" aria-label={`${area.label} 메뉴`}>
      <p className="lnb__head"><InAppLink to={areaPath(area.id)} navigate={navigate} current={path === areaPath(area.id)}><Icon label={area.label} />{area.label}</InAppLink></p>
      {area.ours.length > 0 && (
        <ul className="lnb__ours">
          {area.ours.map(o => (
            <li key={o.route}><InAppLink to={o.route} navigate={navigate} className="lnb__item" current={current?.route === o.route}><Icon label={o.label} />{o.label}</InAppLink></li>
          ))}
        </ul>
      )}
      <ul className="lnb__observed" aria-label="이번 시연 미지원 메뉴">
        {area.planned.map(o => <li key={o}><Icon label={o} /><span>{o}</span><span className="lnb__off">미지원</span></li>)}
      </ul>
    </nav>
  );
}
