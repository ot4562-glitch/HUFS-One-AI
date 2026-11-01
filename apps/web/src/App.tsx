import {useEffect, useRef, type ReactNode} from 'react';
import type {DemoController, DemoViewState} from './app/index.js';
import {AppShell} from './shell/AppShell.js';
import {DemoSelector} from './shell/DemoSelector.js';
import {StatusBanner} from './shell/StatusBanner.js';
import {useDemo} from './shell/useDemo.js';
import {TABS, useRoute, type HistoryPort} from './shell/router.js';

export interface PageContext {
  readonly path: string;
  readonly state: DemoViewState;
  readonly controller: DemoController;
  readonly navigate: (path: string) => void;
}

export type PageRenderer = (ctx: PageContext) => {title: string; body: ReactNode} | null;

function placeholder(title: string): {title: string; body: ReactNode} {
  return {title, body: <p className="muted">이 화면은 아직 준비 중입니다.</p>};
}

/** Fallback pages; feature PRs register real renderers in front of these. */
const basePages: PageRenderer = ({path}) => {
  const tab = TABS.find(t => t.path === path);
  if (tab) return placeholder(tab.label);
  if (path === '/notices') return placeholder('공지');
  return null;
};

interface Props {
  readonly controller: DemoController;
  readonly transportLabel?: string | null;
  readonly historyPort?: HistoryPort;
  readonly pages?: readonly PageRenderer[];
}

export function App({controller, transportLabel = null, historyPort, pages = []}: Props) {
  const state = useDemo(controller);
  const [path, navigate] = useRoute(historyPort);
  const ctx: PageContext = {path, state, controller, navigate};
  const page = [...pages, basePages].reduce<ReturnType<PageRenderer>>((found, render) => found ?? render(ctx), null)
    ?? {title: '페이지를 찾을 수 없습니다', body: <p className="muted">주소를 확인하거나 아래 메뉴를 이용해 주세요.</p>};

  // Move focus to the new page heading after in-app navigation (not on first load).
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    document.title = `${page.title} · HUFS One AI`;
    if (first.current) { first.current = false; return; }
    heading.current?.focus();
  }, [path, page.title]);

  return (
    <AppShell
      path={path}
      navigate={navigate}
      transportLabel={transportLabel}
      selector={<DemoSelector state={state} onSelect={s => void controller.select(s)} />}
      status={<StatusBanner state={state} onRetry={() => void controller.retry()} />}
    >
      <h1 ref={heading} tabIndex={-1} className="page__title">{page.title}</h1>
      {page.body}
    </AppShell>
  );
}
