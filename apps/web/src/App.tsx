import {useEffect, useRef, type ComponentType, type ReactNode} from 'react';
import type {RevisionPort} from './features/revisions/RevisionComparison.js';
import type {DemoContext, SubjectAlias} from '@hufs-one/contracts';
import type {ExperienceSkillPort} from './features/experience/experienceSkillPort.js';
import type {OwnerExperiencePort} from './features/experience/OwnerExperiencePanel.js';
import type {OwnerCareerPort} from './features/career/OwnerCareerPanel.js';
import type {InviteCodeHolder, InvitePort} from './features/reviewer/invite.js';
import {useSandbox, type SandboxApi, type SandboxPort} from './features/sandbox/useSandbox.js';
import type {BoardPort} from './features/applications/boardPort.js';
import type {ClubPort} from './features/clubs/useClubBoard.js';
import type {OwnerClubPort} from './features/clubs/OwnerClubBoard.js';
import type {ClubModerationPort} from './features/clubs/ClubModerationPanel.js';
import type {OverlayPort} from './features/settings/overlayCompare.js';
import type {WhatIfPort} from './features/what-if/WhatIfPanel.js';
import type {PlanCheckPort} from './features/plan-check/PlanCheckPanel.js';
import type {DoubleMajorPort} from './features/double-major/DoubleMajorPanel.js';
import type {OwnerDemoProfilePort} from './features/owner-demo/OwnerDemoProfile.js';
import type {OwnerAcademicsPort} from './features/owner-academics/OwnerAcademicsPanel.js';
import type {OwnerPrivateIntakePort} from './features/owner-intake/OwnerPrivateIntakePanel.js';
import type {OwnerProviderPort} from './features/owner-provider/OwnerProviderPanel.js';
import type {CampusAssistPort} from './features/campus-assist/ownerPort.js';
import type {OwnerCourseEvidencePort} from './features/owner-academics/OwnerExperienceCoursePanel.js';
import type {OwnerV2CatalogPort} from './features/owner-catalog/OwnerV2CatalogPanel.js';
import type {OwnerInsightsPort} from './features/owner-insights/OwnerInsightsPanel.js';
import type {OwnerPreparationPort} from './features/owner-preparation/OwnerPreparationPanel.js';
import type {DemoController, DemoViewState} from './app/index.js';
import {AppShell} from './shell/AppShell.js';
import {AreaNav, PageBanner} from './shell/PageBanner.js';
import {areaOf} from './shell/areas.js';
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
  /** #123 current BETA owner; no selected S01–S05 context. */
  readonly ownerClubs?: OwnerClubPort;
  /** #123 ADMIN session plus independently provisioned publication authority. */
  readonly clubModeration?: ClubModerationPort;
  /** #85 BETA temporary choices; never set for a REVIEWER session (sandbox settings instead). */
  readonly overlay?: OverlayPort;
  /** #82 hypothetical major What-if; synthetic until wired to OwnerApiClient.checkMajorWhatIf. */
  readonly whatIf?: WhatIfPort;
  /** #81 owner plan check next to the 졸업 summary; synthetic until wired to OwnerApiClient.checkStudyPlan. */
  readonly planCheck?: PlanCheckPort;
  /** #119 reviewed correction comparison for an opportunity; dev synthetic until the client/discovery API exists. */
  readonly revisions?: RevisionPort;
  /** #144 current primary + chosen double major audit; synthetic only until the owner API (#150) lands. */
  readonly doubleMajor?: DoubleMajorPort;
  /** #132 verified BETA owner, independent of S01–S05 and REVIEWER. */
  readonly ownerDemoProfile?: OwnerDemoProfilePort;
  /** Current BETA owner's double-major/plan/What-if checks; no public demo subject context. */
  readonly ownerAcademics?: OwnerAcademicsPort;
  /** Verified BETA actor's own attested CSV profile/course review, never public S01–S05. */
  readonly ownerIntake?: OwnerPrivateIntakePort;
  /** Operator-provisioned, metadata-only BETA Provider vertical slice. Default absent. */
  readonly ownerProvider?: OwnerProviderPort;
  /** Current BETA only: authorized campus assistance and HCX FAQ service, never a demoSubject. */
  readonly campusAssist?:CampusAssistPort;
  /** Only current purpose-granted academic evidence, not school graduation. */
  readonly ownerCourseEvidence?:OwnerCourseEvidencePort;
  /** #366/#348: authenticated, consent-bound full v2 catalog search and signed cursor. */
  readonly ownerV2Catalog?:OwnerV2CatalogPort;
  readonly ownerInsights?:OwnerInsightsPort;
  readonly ownerPreparation?:OwnerPreparationPort;
  /** Synthetic-only per-subject experience stores; never shared with BETA owner ports. */
  readonly experienceForSubject?: (subject: SubjectAlias) => ExperienceSkillPort;
  /** Current BETA owner's own portfolio, independent of the demo selector. */
  readonly ownerExperience?: OwnerExperiencePort;
  /** #317 authenticated and owner-private profile/timeline/roadmap. */
  readonly ownerCareer?: OwnerCareerPort;
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
  const independent = path==='/activities'||path==='/exchange'||path==='/faq'
    || path==='/owner-scholarships'||path==='/owner-badges'||path==='/owner-academics/experience-courses'
    || (!!services.ownerIntake && (path === '/' || path === '/owner-intake'))
    || (!!services.ownerExperience && path === '/experience')
    || path === '/career' || path.startsWith('/owner-opportunities/')
    || path.startsWith('/owner-insights/')
    || path === '/demo-profile' || path === '/owner-ai' || path === '/owner-academics'
    || path === '/clubs/admin' || (!!services.ownerClubs && (path === '/clubs' || path.startsWith('/clubs/')));
  const ctx: PageContext = {path, state, controller, navigate, services, sandbox};
  const page = (path === '/local-demo' && LocalWorkbench
    ? {title: '로컬 합성 계정 실험실', body: <LocalWorkbench/>}
    : null) ?? [...pages, basePages].reduce<ReturnType<PageRenderer>>((found, render) => found ?? render(ctx), null)
    ?? {title: '페이지를 찾을 수 없습니다', body: <p className="muted">주소를 확인하거나 아래 메뉴를 이용해 주세요.</p>};

  const area = path === '/' ? null : areaOf(path);
  const subject = state.status === 'READY' ? state.profiles.find(p => p.demoSubjectId === state.selected)?.displayLabel : undefined;
  const greeting = path === '/' && subject ? <>{subject.split(' · ')[0]}님, 오늘의 정보를 확인하세요 <span className="hero__chip">합성 데이터</span></> : undefined;

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
      selector={independent ? null
        : path === '/reviewer/invite' ? null : path === '/local-demo' && LocalWorkbench
        ? <a href="/" onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate('/');}}}>기존 S01–S05 시연으로 돌아가기</a>
        : <><DemoSelector state={state} onSelect={s => void controller.select(s)} />{LocalWorkbench&&<a href="/local-demo" onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate('/local-demo');}}}>로컬 합성 계정 실험실 열기</a>}</>}
      status={independent || path === '/reviewer/invite' || (path === '/local-demo' && LocalWorkbench) ? null
        : <StatusBanner state={state} onRetry={() => void controller.retry()} />}
    >
      <PageBanner path={path} title={page.title} navigate={navigate} headingRef={heading} greeting={greeting} />
      {area ? <div className="layout"><AreaNav area={area} path={path} navigate={navigate} /><div className="layout__body">{page.body}</div></div> : page.body}
    </AppShell>
  );
}
