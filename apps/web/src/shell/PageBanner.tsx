import type {Ref} from 'react';
import {InAppLink} from './AppShell.js';
import {areaOf, areaPath, currentAreaLink, type Area} from './areas.js';

const OTHER_SECTIONS: readonly {route: string; label: string}[] = [
  {route: '/menu', label: '전체 메뉴'}, {route: '/settings', label: '설정'}, {route: '/reviewer', label: '심사 안내'},
];

export function sectionOf(path: string): {route: string; label: string} | null {
  const area = areaOf(path);
  if (area) return {route: areaPath(area.id), label: area.label};
  return OTHER_SECTIONS.find(s => path === s.route || path.startsWith(s.route + '/')) ?? null;
}

/** One compact heading for both the synthetic dashboard and the BETA owner home.
 * No decorative hero, duplicate CTAs, or artificial greeting; breadcrumbs remain navigable.
 */
export function PageBanner({path, title, navigate, headingRef}: {
  path: string; title: string; navigate: (p: string) => void; headingRef: Ref<HTMLHeadingElement>;
}) {
  if (path === '/') {
    return <header className="page-head page-head--home">
      <h1 id="page-title" ref={headingRef} tabIndex={-1} className="page__title">{title}</h1>
    </header>;
  }
  const area = areaOf(path);
  const section = sectionOf(path);
  const link = area ? currentAreaLink(area, path) : null;
  const crumbs: {label: string; to?: string}[] = [];
  if (section && section.label !== title) crumbs.push({label: section.label, to: section.route});
  if (link && link.route !== path && link.label !== title) crumbs.push({label: link.label, to: link.route});
  crumbs.push({label: title});
  return <header className="page-head">
    <nav className="page-head__breadcrumb" aria-label="현재 위치">
      <InAppLink to="/" navigate={navigate}>홈</InAppLink>
      {crumbs.map((c, i) => (
        <span key={i}> <span aria-hidden="true">›</span> {c.to && i < crumbs.length - 1
          ? <InAppLink to={c.to} navigate={navigate}>{c.label}</InAppLink>
          : <span aria-current="page">{c.label}</span>}</span>
      ))}
    </nav>
    <h1 id="page-title" ref={headingRef} tabIndex={-1} className="page__title">{title}</h1>
  </header>;
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
      <details className="lnb__legacy">
        <summary className="lnb__sub">원래 HUFSAbility 메뉴 <span className="lnb__subnote">{area.observed.length}개 · 미지원</span></summary>
        <ul className="lnb__observed">
          {area.observed.map(o => <li key={o}><span>{o}</span><span className="lnb__off">미지원</span></li>)}
        </ul>
      </details>
    </nav>
  );
}
