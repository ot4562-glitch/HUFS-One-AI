import type {ReactNode, Ref} from 'react';
import {InAppLink} from './AppShell.js';
import {areaOf, areaPath, currentAreaLink, type Area} from './areas.js';

const HERO_URL = new URL('./assets/hero.webp', import.meta.url).href;

/** Pages outside the 11 areas still get a category label and a breadcrumb parent. */
const OTHER_SECTIONS: readonly {route: string; label: string}[] = [
  {route: '/menu', label: '전체 메뉴'}, {route: '/settings', label: '설정'}, {route: '/reviewer', label: '심사 안내'},
];

/** Kept for callers that only need the section of a path (area first, then the pages above). */
export function sectionOf(path: string): {route: string; label: string} | null {
  const area = areaOf(path);
  if (area) return {route: areaPath(area.id), label: area.label};
  return OTHER_SECTIONS.find(s => path === s.route || path.startsWith(s.route + '/')) ?? null;
}

/**
 * Page heading (#9 redesign, UIUX master spec C03 / P001). Home: a full-width hero with the decorative,
 * campus-free illustration. Other pages: a 142px navy banner — the area name in a 230px block, then the
 * breadcrumb above the h1 and a small abstract pattern (no photos, seals or characters). The h1 always
 * carries the page title, so focus-on-navigation and title tests are unchanged.
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
          <div className="hero__actions" aria-label="시작하기">
            <InAppLink to="/opportunities" navigate={navigate} className="hero__cta hero__cta--primary">맞춤 기회 살펴보기 <span aria-hidden="true">↗</span></InAppLink>
            <InAppLink to="/graduation" navigate={navigate} className="hero__cta hero__cta--secondary">학업 계획 확인 <span aria-hidden="true">→</span></InAppLink>
          </div>
        </div>
      </section>
    );
  }
  const area = areaOf(path);
  const section = sectionOf(path);
  const link = area ? currentAreaLink(area, path) : null;
  // 홈 › area › (our screen, when this is a page inside it) › this page; the last one is never a link.
  const crumbs: {label: string; to?: string}[] = [];
  if (section && section.label !== title) crumbs.push({label: section.label, to: section.route});
  if (link && link.route !== path && link.label !== title) crumbs.push({label: link.label, to: link.route});
  crumbs.push({label: title});
  return (
    <div className="band">
      <div className="band__cat" aria-hidden="true">{section?.label ?? 'HUFS One AI'}</div>
      <div className="band__title">
        <nav className="band__crumb" aria-label="현재 위치">
          <InAppLink to="/" navigate={navigate}>홈</InAppLink>
          {crumbs.map((c, i) => (
            <span key={i}> <span aria-hidden="true">›</span> {c.to && i < crumbs.length - 1
              ? <InAppLink to={c.to} navigate={navigate}>{c.label}</InAppLink>
              : <span aria-current="page">{c.label}</span>}</span>
          ))}
        </nav>
        <h1 id="page-title" ref={headingRef} tabIndex={-1} className="page__title">{title}</h1>
        {area && <p className="band__summary">{area.summary}</p>}
      </div>
    </div>
  );
}

/**
 * C04 left menu for the current area: HUFS One AI's own screens as links (current one with a gold bar),
 * then the area's original menu names as plain text marked 미지원 — never links, never focusable.
 */
export function AreaNav({area, path, navigate}: {area: Area; path: string; navigate: (p: string) => void}) {
  const current = currentAreaLink(area, path);
  return (
    <nav className="lnb" aria-label={`${area.label} 메뉴`}>
      <p className="lnb__head"><InAppLink to={areaPath(area.id)} navigate={navigate} current={path === areaPath(area.id)}>{area.label}</InAppLink></p>
      {area.ours.length > 0 && (
        <ul className="lnb__ours">
          {area.ours.map(o => (
            <li key={o.route}><InAppLink to={o.route} navigate={navigate} className="lnb__item" current={current?.route === o.route}>{o.label}</InAppLink></li>
          ))}
        </ul>
      )}
      <p className="lnb__sub">원래 메뉴 <span className="lnb__subnote">이번 시연 미지원</span></p>
      <ul className="lnb__observed">
        {area.observed.map(o => <li key={o}><span>{o}</span><span className="lnb__off">미지원</span></li>)}
      </ul>
    </nav>
  );
}
