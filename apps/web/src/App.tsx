import {useEffect, useRef, type ComponentType, type ReactNode} from 'react';
import type {DemoContext} from '@hufs-one/contracts';
import type {InviteCodeHolder, InvitePort} from './features/reviewer/invite.js';
import {useSandbox, type SandboxApi, type SandboxPort} from './features/sandbox/useSandbox.js';
import type {BoardPort} from './features/applications/boardPort.js';
import type {ClubPort} from './features/clubs/useClubBoard.js';
import type {OverlayPort} from './features/settings/overlayCompare.js';
import type {PlanCheckPort} from './features/plan-check/PlanCheckPanel.js';
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
  /** REVIEWER synthetic sandbox for the current context; null when not a REVIEWER session. */
  readonly sandbox: SandboxApi | null;
}

/** Optional data ports beyond DemoController. Missing ports render a "not connected" state. */
export interface AppServices {
  /** Raw CalendarResult for the context (validated by the widget). Real path: liveServices → HufsApiClient.getCalendar. */
  readonly loadCalendar?: (context: DemoContext, signal: AbortSignal) => Promise<unknown>;
  /** /reviewer/invite: session check + redeem, and the in-memory code captured before render. */
  readonly reviewerInvite?: {readonly port: InvitePort; readonly holder: InviteCodeHolder};
  /** Present only for a verified REVIEWER session (or the dev synthetic mode). */
  readonly sandbox?: SandboxPort;
  /** #80 owner-private application board (BETA owner session; the server checks every call). */
  readonly applications?: BoardPort;
  /** #123 club board for the current demo context; synthetic only until a club API exists. */
  readonly clubs?: ClubPort;
  /** #85 BETA temporary choices; never set for a REVIEWER session (sandbox settings instead). */
  readonly overlay?: OverlayPort;
  /** #81 owner plan check next to the 졸업 summary; synthetic until wired to OwnerApiClient.checkStudyPlan. */
  readonly planCheck?: PlanCheckPort;
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
  if (path === '/settings') return placeholder('설정');
  return null;
};

interface Props {
  readonly controller: DemoController;
  readonly transportLabel?: string | null;
  readonly historyPort?: HistoryPort;
  readonly pages?: readonly PageRenderer[];
  readonly services?: AppServices;
  /** Supplied only by the DEV synthetic loopback entrypoint; absent in production. */
  readonly localAccountWorkbench?: ComponentType;
}

export function App({controller, transportLabel = null, historyPort, pages = [], services = {}, localAccountWorkbench:LocalWorkbench}: Props) {
  const state = useDemo(controller);
  const [path, navigate] = useRoute(historyPort);
  const sandbox = useSandbox(controller, state, services.sandbox);
  const ctx: PageContext = {path, state, controller, navigate, services, sandbox};
  const page = (path === '/local-demo' && LocalWorkbench
    ? {title: '로컬 합성 계정 실험실', body: <LocalWorkbench/>}
    : null) ?? [...pages, basePages].reduce<ReturnType<PageRenderer>>((found, render) => found ?? render(ctx), null)
    ?? {title: '페이지를 찾을 수 없습니다', body: <p className="muted">주소를 확인하거나 아래 메뉴를 이용해 주세요.</p>};

  // Move focus to the new page heading after in-app navigation (not on first load).
  const heading = useRef<HTMLHeadingElement>(null);
  // Compare with the last path, not a "first run" flag: StrictMode re-runs effects on mount.
  const lastPath = useRef(path);
  useEffect(() => {
    document.title = `${page.title} · HUFS One AI`;
    if (lastPath.current === path) return;
    lastPath.current = path;
    heading.current?.focus();
  }, [path, page.title]);

  return (
    <AppShell
      path={path}
      navigate={navigate}
      transportLabel={transportLabel}
      // Reviewer enrollment is never a student selector; the local demo remains a separate synthetic-only route.
      selector={path === '/reviewer/invite' ? null : path === '/local-demo' && LocalWorkbench
        ? <a href="/" onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate('/');}}}>기존 S01–S05 시연으로 돌아가기</a>
        : <><DemoSelector state={state} onSelect={s => void controller.select(s)} />{LocalWorkbench&&<a href="/local-demo" onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate('/local-demo');}}}>로컬 합성 계정 실험실 열기</a>}</>}
      status={path === '/reviewer/invite' || (path === '/local-demo' && LocalWorkbench) ? null
        : <StatusBanner state={state} onRetry={() => void controller.retry()} />}
    >
      <h1 ref={heading} tabIndex={-1} className="page__title">{page.title}</h1>
      {page.body}
    </AppShell>
  );
}
