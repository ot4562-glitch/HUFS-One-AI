import type {MouseEvent, ReactNode} from 'react';
import {TABS, activeTab, inAppHref} from './router.js';
import {HufsAbilityMenu} from './HufsAbilityMenu.js';
import {MENU_GROUPS} from './menuCatalog.js';

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
 * One "주요 메뉴" for every width (#9 v5): the five A11.1 tabs (short labels, bottom bar on phones) plus,
 * from 1024px, the rest of HUFS One AI's own screens with their full names across the top.
 */
function mainMenu(): readonly {route: string; short: string; long: string; wideOnly: boolean}[] {
  const ext = MENU_GROUPS[0]!.items.flatMap(i => i.route ? [{route: i.route, label: i.label}] : []);
  const tabs = TABS.map(t => ({route: t.path as string, short: t.label as string, long: ext.find(e => e.route === t.path)?.label ?? t.label, wideOnly: false}));
  const extra = ext.filter(e => !tabs.some(t => t.route === e.route)).map(e => ({route: e.route, short: e.label, long: e.label, wideOnly: true}));
  return [...tabs, ...extra];
}

export function AppShell({path, navigate, transportLabel, selector, status, children}: Props) {
  const tab = activeTab(path);
  const isCurrent = (route: string) => TABS.some(t => t.path === route) ? tab === route : path === route || path.startsWith(route + '/');
  return (
    <div className={`app${path === '/' ? ' app--home' : ''}`}>
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      <header className="topbar">
        <div className="topbar__row">
          <span className="topbar__brand">
            <InAppLink to="/" navigate={navigate} className="app__logo">HUFS One AI</InAppLink>
            <span className="topbar__tagline">독립 학생 프로젝트 · 학교 공식 서비스 아님</span>
          </span>
          <span className="app__brand-links">
            <InAppLink to="/menu" navigate={navigate} className="app__settings app__menu-link" current={path === '/menu'}>전체 메뉴</InAppLink>
            <InAppLink to="/settings" navigate={navigate} className="app__settings" current={path === '/settings'}>설정</InAppLink>
          </span>
        </div>
        <div className="gnb">
          <nav className="app__tabs" aria-label="주요 메뉴">
            <ul>
              {mainMenu().map(m => (
                <li key={m.route} className={m.wideOnly ? 'gnb__wide' : undefined}>
                  <InAppLink to={m.route} navigate={navigate} current={isCurrent(m.route)} className="tab">
                    {/* Short label on phones; the full name is always the accessible name and contains the short one. */}
                    <span className="tab__short" aria-hidden="true">{m.short}</span><span className="tab__long">{m.long}</span>
                  </InAppLink>
                </li>
              ))}
            </ul>
          </nav>
          {/* HUFSAbility originals live only here (wide screens) and on /menu. */}
          <HufsAbilityMenu navigate={navigate} />
        </div>
      </header>
      <div className="app__header">
        {transportLabel && <p className="app__transport" role="note">{transportLabel}</p>}
        {selector}
        {status}
      </div>
      <main id="main" className="app__main" tabIndex={-1}>{children}</main>
      <footer className="app__foot">
        <span>HUFS One AI는 학생 팀 프로젝트이며 학교 공식 서비스가 아닙니다 · 합성 데이터 시연</span>
        <InAppLink to="/menu" navigate={navigate}>전체 메뉴</InAppLink>
      </footer>
    </div>
  );
}
