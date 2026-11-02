import type {MouseEvent, ReactNode} from 'react';
import {TABS, activeTab} from './router.js';

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
      <header className="app__header">
        <div className="app__brand">
          <InAppLink to="/" navigate={navigate} className="app__logo">HUFS One AI</InAppLink>
          <InAppLink to="/settings" navigate={navigate} className="app__settings" current={path === '/settings'}>설정</InAppLink>
        </div>
        {transportLabel && <p className="app__transport" role="note">{transportLabel}</p>}
        {selector}
        {status}
      </header>
      <main id="main" className="app__main" tabIndex={-1}>{children}</main>
      <nav className="app__tabs" aria-label="주요 메뉴">
        <ul>
          {TABS.map(t => (
            <li key={t.path}>
              <InAppLink to={t.path} navigate={navigate} current={tab === t.path} className="tab">{t.label}</InAppLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
