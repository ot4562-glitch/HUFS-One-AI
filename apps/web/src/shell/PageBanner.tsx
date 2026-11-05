import type {Ref} from 'react';
import {InAppLink} from './AppShell.js';
import {MENU_GROUPS} from './menuCatalog.js';

const HERO_URL = new URL('./assets/hero.webp', import.meta.url).href;

/** Section label for the left block of the banner, from the 확장 menu (plus pages outside it). */
const EXTRA_SECTIONS: readonly {route: string; label: string}[] = [
  {route: '/menu', label: '전체 메뉴'}, {route: '/settings', label: '설정'}, {route: '/reviewer', label: '심사 안내'},
];
export function sectionOf(path: string): {route: string; label: string} | null {
  const all = [...MENU_GROUPS[0]!.items.flatMap(i => i.route && i.route !== '/' ? [{route: i.route, label: i.label}] : []), ...EXTRA_SECTIONS];
  return all.find(s => path === s.route || path.startsWith(s.route + '/')) ?? null;
}

/**
 * #9 v5 page heading. Home: a campus-free illustration banner with the page's h1 and the product line.
 * Other pages: a category block + breadcrumb (above) + h1. The h1 always carries the page title, so
 * focus-on-navigation and heading tests are unchanged. The illustration is decorative (CSS background).
 */
export function PageBanner({path, title, navigate, headingRef}: {
  path: string; title: string; navigate: (p: string) => void; headingRef: Ref<HTMLHeadingElement>;
}) {
  if (path === '/') {
    return (
      <section className="hero" style={{backgroundImage: `url(${HERO_URL})`}} aria-labelledby="page-title">
        <div className="hero__in">
          <h1 id="page-title" ref={headingRef} tabIndex={-1} className="hero__eyebrow page__title">{title}</h1>
          <p className="hero__tag">나에게 맞는 공고를, 조건과 근거와 함께</p>
          <p className="hero__sub">전공·학년·관심 분야에 맞춘 공고와 마감, 졸업까지 남은 일을 한 화면에서 확인하세요.</p>
          <InAppLink to="/opportunities" navigate={navigate} className="button hero__cta">맞춤 공고 보기</InAppLink>
        </div>
      </section>
    );
  }
  const section = sectionOf(path);
  const showCrumbLeaf = section && section.label !== title;
  return (
    <div className="band">
      <div className="band__cat" aria-hidden="true">{section?.label ?? 'HUFS One AI'}</div>
      <div className="band__title" style={{backgroundImage: `url(${HERO_URL})`}}>
        <nav className="band__crumb" aria-label="현재 위치">
          <InAppLink to="/" navigate={navigate}>홈</InAppLink>
          {section && <> <span aria-hidden="true">›</span> {showCrumbLeaf
            ? <InAppLink to={section.route} navigate={navigate}>{section.label}</InAppLink>
            : <span aria-current="page">{section.label}</span>}</>}
          {showCrumbLeaf && <> <span aria-hidden="true">›</span> <span aria-current="page">{title}</span></>}
        </nav>
        <h1 id="page-title" ref={headingRef} tabIndex={-1} className="page__title">{title}</h1>
      </div>
    </div>
  );
}
