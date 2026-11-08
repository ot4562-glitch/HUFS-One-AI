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

/**
 * Explicit, compile-time-only UI preview. Its route is a query parameter so
 * static hosts never need a server-side SPA fallback. The #main skip link stays
 * an anchor; the normal production pathname router remains unchanged.
 */
export const STATIC_PAGES_PREVIEW = import.meta.env.PROD
  && import.meta.env.MODE === 'pages-preview'
  && import.meta.env.VITE_STATIC_PAGES_PREVIEW === 'true';

/**
 * Only one encoded ID segment is accepted on detail routes. Decode exactly
 * once, reject path separators, control characters, malformed UTF-8 and
 * non-canonical percent escapes before any history or preview navigation.
 */
export function decodeDetailId(segment: string): string | null {
  try {
    const id = decodeURIComponent(segment);
    if (id.length < 1 || id.length > 120 || id === '.' || id === '..'
      || !/^[\p{L}\p{N}_.:-]+$/u.test(id)
      || encodeURIComponent(id).toLowerCase() !== segment.toLowerCase()) return null;
    return id;
  } catch {
    return null;
  }
}
export function validPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return false;
  // Evaluate detail routes before the legacy static-path allowance: otherwise
  // unencoded /../, extra segments or overlong plain IDs bypass the ID limit.
  if (path.startsWith('/opportunities/') || path.startsWith('/notices/')) {
    const match = /^\/(?:opportunities|notices)\/([^/]+)$/.exec(path);
    return match !== null && decodeDetailId(match[1]!) !== null;
  }
  return /^\/[A-Za-z0-9/_-]*$/.test(path);
}

function readPath(port: HistoryPort): string {
  if (!STATIC_PAGES_PREVIEW || port !== window) return port.location.pathname;
  const candidate = new URLSearchParams(window.location.search).get('page') ?? '/';
  return validPath(candidate) ? candidate : '/';
}

/** Browser link destination for opening static preview routes in a new tab. */
export function inAppHref(path: string): string {
  return STATIC_PAGES_PREVIEW
    ? `${import.meta.env.BASE_URL}?page=${encodeURIComponent(path)}`
    : path;
}

/** Same-origin routing; Pages uses ?page=/path, normal deployments use pathname. */
export function useRoute(port: HistoryPort = window): [string, (path: string) => void] {
  const [path, setPath] = useState(() => readPath(port));
  useEffect(() => {
    const onPop = () => setPath(readPath(port));
    port.addEventListener('popstate', onPop);
    return () => port.removeEventListener('popstate', onPop);
  }, [port]);
  const navigate = useCallback((next: string) => {
    if (!validPath(next)) return;
    if (next !== readPath(port)) {
      if (STATIC_PAGES_PREVIEW && port === window) {
        const url = new URL(window.location.href);
        url.searchParams.set('page', next);
        url.hash = '';
        port.history.pushState(null, '', url);
      } else {
        port.history.pushState(null, '', next);
      }
    }
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
