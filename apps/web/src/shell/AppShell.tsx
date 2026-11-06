import type {MouseEvent, ReactNode} from 'react';
import {TABS, activeTab, inAppHref} from './router.js';
import {AREAS, areaOf, areaPath} from './areas.js';

interface Props {
  readonly path: string;
  readonly navigate: (path: string) => void;
  /** Shown permanently when a non-production transport (synthetic mock) is in use. */
  readonly transportLabel: string | null;
  readonly selector: ReactNode;
  readonly status: ReactNode;
  readonly children: ReactNode;
}

export function InAppLink({to, navigate, children, className, current}: {
  to: string; navigate: (p: string) => void; children: ReactNode; className?: string; current?: boolean;
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={inAppHref(to)} className={className} aria-current={current ? 'page' : undefined} onClick={onClick}>{children}</a>;
}

/**
 * #9 redesign shell (UIUX 96 master spec §3.4, §4 C01/C02/C18):
 * - 48px top bar: wordmark + "독립 학생 프로젝트 · 학교 공식 서비스 아님", 전체 메뉴/설정, and the five A11.1
 *   tabs as small "ONE AI" shortcuts (they become the bottom bar on phones; one nav, one name).
 * - Wide screens: the 11 observed HUFSAbility areas as the GNB, the current one underlined in gold.
 *   Each area opens its own page; original functions inside it are never links.
 */
export function AppShell({path, navigate, transportLabel, selector, status, children}: Props) {
  const tab = activeTab(path);
  const area = areaOf(path);
  return (
    <div className={`app${path === '/' ? ' app--home' : ''}`}>
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      <header className="topbar">
        <div className="topbar__row">
          <span className="topbar__brand">
            <InAppLink to="/" navigate={navigate} className="app__logo"><span className="app__logo-mark" aria-hidden="true" />HUFS One AI</InAppLink>
            <span className="topbar__tagline">독립 학생 프로젝트 · 학교 공식 서비스 아님</span>
          </span>
          <span className="app__brand-links">
            <InAppLink to="/menu" navigate={navigate} className="app__settings app__menu-link" current={path === '/menu'}>전체 메뉴</InAppLink>
            <InAppLink to="/settings" navigate={navigate} className="app__settings" current={path === '/settings'}>설정</InAppLink>
          </span>
          <nav className="app__tabs" aria-label="주요 메뉴">
            <span className="app__tabs-label" aria-hidden="true">ONE AI</span>
            <ul>
              {TABS.map(t => (
                <li key={t.path}>
                  <InAppLink to={t.path} navigate={navigate} current={tab === t.path} className="tab">{t.label}</InAppLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <nav className="gnb" aria-label="전체 메뉴">
          <ul className="gnb__items">
            {AREAS.map(a => (
              <li key={a.id}>
                <InAppLink to={areaPath(a.id)} navigate={navigate} className="gnb__item" current={area?.id === a.id}>{a.label}</InAppLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <div className="app__header">
        {transportLabel && <p className="app__transport" role="note">{transportLabel}</p>}
        {selector}
        {status}
      </div>
      <main id="main" className="app__main" tabIndex={-1}>{children}</main>
      <footer className="app__foot">
        <div className="app__foot-in">
          <strong>HUFS One AI</strong>
          <span>HUFS One AI는 학교 공식 서비스가 아닌 독립 학생 프로젝트입니다 · 합성 데이터 시연</span>
          <span className="app__foot-links">
            <InAppLink to="/menu" navigate={navigate}>메뉴 전체 보기</InAppLink>
          </span>
        </div>
      </footer>
    </div>
  );
}
