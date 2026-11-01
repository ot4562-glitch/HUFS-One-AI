import {useEffect, useRef, type ReactNode} from 'react';
import type {DemoContext} from '@hufs-one/contracts';
import type {InviteCodeHolder, InvitePort} from './features/reviewer/invite.js';
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
  readonly services: AppServices;
}

/** Optional data ports beyond DemoController. Missing ports render a "not connected" state. */
export interface AppServices {
  /** Raw CalendarResult for the context (validated by the widget). Real path: liveServices → HufsApiClient.getCalendar. */
  readonly loadCalendar?: (context: DemoContext, signal: AbortSignal) => Promise<unknown>;
  /** /reviewer/invite: session check + redeem, and the in-memory code captured before render. */
  readonly reviewerInvite?: {readonly port: InvitePort; readonly holder: InviteCodeHolder};
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
  readonly services?: AppServices;
}

export function App({controller, transportLabel = null, historyPort, pages = [], services = {}}: Props) {
  const state = useDemo(controller);
  const [path, navigate] = useRoute(historyPort);
  const ctx: PageContext = {path, state, controller, navigate, services};
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
      // The invite page is about enrolment, not a demo subject: no selector or demo status there.
      selector={path === '/reviewer/invite' ? null : <DemoSelector state={state} onSelect={s => void controller.select(s)} />}
      status={path === '/reviewer/invite' ? null : <StatusBanner state={state} onRetry={() => void controller.retry()} />}
    >
      <h1 ref={heading} tabIndex={-1} className="page__title">{page.title}</h1>
      {page.body}
    </AppShell>
  );
}
