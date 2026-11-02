import type {MouseEvent, ReactNode} from 'react';
import {TABS, activeTab} from './router.js';
import {MenuTree} from './MenuTree.js';

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
  return <a href={to} className={className} aria-current={current ? 'page' : undefined} onClick={onClick}>{children}</a>;
}

export function AppShell({path, navigate, transportLabel, selector, status, children}: Props) {
  const tab = activeTab(path);
  return (
    <div className="app">
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      {/* Wide screens: navy sidebar with the whole menu (#124). Phones keep the bottom tabs + /menu. */}
      <aside className="app__sidebar">
        <InAppLink to="/" navigate={navigate} className="app__sidebar-logo">HUFS One AI</InAppLink>
        <nav aria-label="전체 메뉴"><MenuTree path={path} navigate={navigate} variant="sidebar" /></nav>
      </aside>
      <div className="app__body">
      <header className="app__header">
        <div className="app__brand">
          <InAppLink to="/" navigate={navigate} className="app__logo">HUFS One AI</InAppLink>
          <span className="app__brand-links">
            <InAppLink to="/menu" navigate={navigate} className="app__settings app__menu-link" current={path === '/menu'}>전체 메뉴</InAppLink>
          </span>
        </div>
        {transportLabel && <p className="app__transport" role="note">{transportLabel}</p>}
        {/* #132: '설정' sits right next to the account (demo subject) switcher. */}
        <div className="app__account">
          {selector}
          <InAppLink to="/settings" navigate={navigate} className="app__settings app__account-settings" current={path === '/settings'}>설정</InAppLink>
        </div>
        {status}
      </header>
      {/* DOM order = visual order on wide screens (tabs under the header); fixed to the bottom on phones. */}
      <nav className="app__tabs" aria-label="주요 메뉴">
        <ul>
          {TABS.map(t => (
            <li key={t.path}>
              <InAppLink to={t.path} navigate={navigate} current={tab === t.path} className="tab">{t.label}</InAppLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main" className="app__main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
