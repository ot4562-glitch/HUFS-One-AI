import {useCallback, useEffect, useState} from 'react';

/** Bottom tabs per Architecture A11.1: 오늘·기회·경험·졸업·보관함. */
export const TABS = [
  {path: '/', label: '오늘'},
  {path: '/opportunities', label: '기회'},
  {path: '/experience', label: '경험'},
  {path: '/graduation', label: '졸업'},
  {path: '/saved', label: '보관함'},
] as const;

export interface HistoryPort {
  readonly location: Pick<Location, 'pathname'>;
  readonly history: Pick<History, 'pushState'>;
  addEventListener(type: 'popstate', listener: () => void): void;
  removeEventListener(type: 'popstate', listener: () => void): void;
}

/** Same-origin path routing without a router dependency. Only absolute in-app paths are accepted. */
export function useRoute(port: HistoryPort = window): [string, (path: string) => void] {
  const [path, setPath] = useState(() => port.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(port.location.pathname);
    port.addEventListener('popstate', onPop);
    return () => port.removeEventListener('popstate', onPop);
  }, [port]);
  const navigate = useCallback((next: string) => {
    if (!/^\/[A-Za-z0-9/_-]*$/.test(next) || next.startsWith('//')) return;
    if (next !== port.location.pathname) port.history.pushState(null, '', next);
    setPath(next);
  }, [port]);
  return [path, navigate];
}

/** Which bottom tab is active for a path (detail pages keep their parent tab lit). */
export function activeTab(path: string): string | null {
  if (path === '/') return '/';
  const tab = TABS.find(t => t.path !== '/' && (path === t.path || path.startsWith(t.path + '/')));
  if (tab) return tab.path;
  return path === '/notices' || path.startsWith('/notices/') ? '/' : null;
}
