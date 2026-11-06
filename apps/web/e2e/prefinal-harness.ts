/** Test-only Vite entry. Not imported by main.tsx or included in either production bundle. */
import {createElement, StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import type {ApiErrorCode, DemoProfileOption, SubjectAlias} from '@hufs-one/contracts';
import {httpStatusForError, makeApiError} from '@hufs-one/contracts';
import {App, type AppServices} from '../src/App.js';
import {DemoController} from '../src/app/demo-controller.js';
import {SyntheticDemoClient} from '../src/dev/syntheticDemoClient.js';
import {syntheticExperienceSkillPort} from '../src/dev/syntheticExperienceSkills.js';
import {syntheticRevisionPort} from '../src/dev/syntheticRevisions.js';
import {syntheticPlanCheckPort} from '../src/dev/syntheticPlanCheck.js';
import {syntheticWhatIfPort} from '../src/dev/syntheticWhatIf.js';
import {syntheticDoubleMajorPort} from '../src/dev/syntheticDoubleMajor.js';
import {SyntheticOwnerServer} from '../src/dev/syntheticOwnerServer.js';
import {boardPort} from '../src/features/applications/boardPort.js';
import type {ExperienceSkillPort} from '../src/features/experience/experienceSkillPort.js';
import {HufsApiClient} from '../src/integrations/api-client.js';
import {HufsApiError} from '../src/integrations/api-error.js';
import {cssVariables} from '../src/design/tokens.js';
import {appPages} from '../src/pages/index.js';
import type {HistoryPort} from '../src/shell/router.js';
import '../src/styles.css';

if (!import.meta.env.DEV || import.meta.env.MODE !== 'synthetic') throw new Error('Synthetic test entry only');
let snapshotFailure: ApiErrorCode | null = null;
let approvalFailure: ApiErrorCode | null = null;
let revisionFailure: ApiErrorCode | null = null;
let deferExperience = false;
let deferredSubject: SubjectAlias | null = null;
const deferredExperience: (() => void)[] = [];

class ReadyFiveClient extends SyntheticDemoClient {
  override async listProfiles(signal?: AbortSignal): Promise<DemoProfileOption[]> {
    // Complete synthetic test matrix only. Production S05 remains PENDING; no privilege change there.
    return (await super.listProfiles(signal)).map(p => ({...p, readiness: 'READY',
      allowedSections: ['FEED', 'NOTICES', 'EXPERIENCE', 'ACADEMICS', 'FORECAST']}));
  }
  override async getSnapshot(id: string, signal?: AbortSignal) {
    if (snapshotFailure) {
      const code = snapshotFailure; snapshotFailure = null;
      throw new HufsApiError(code, httpStatusForError(makeApiError(code, 'SYN-E2E')));
    }
    return super.getSnapshot(id, signal);
  }
}

const client = new ReadyFiveClient({delayMs: 0});
const controller = new DemoController(client, crypto.randomUUID());
const stores = new Map<SubjectAlias, ExperienceSkillPort>();
const revisions = syntheticRevisionPort({delayMs: 0});
const services: AppServices = {
  experienceForSubject: subject => {
    let port = stores.get(subject);
    if (!port) {
      const base = syntheticExperienceSkillPort({subject});
      port = {...base,
        async load(signal) {
          if (deferExperience) { deferredSubject = subject; deferExperience = false; }
          if (deferredSubject !== subject) return base.load(signal);
          // Deliberately ignore cancellation to verify the controller, rather than a compliant transport.
          // Hold every StrictMode effect for this subject until explicitly released.
          const value = await base.load(new AbortController().signal);
          return new Promise(resolve => { deferredExperience.push(() => resolve(value)); });
        },
        async approve(id, input, signal) {
          if (approvalFailure) {
            const code = approvalFailure; approvalFailure = null;
            throw new HufsApiError(code, httpStatusForError(makeApiError(code, 'SYN-E2E')));
          }
          return base.approve(id, input, signal);
        },
      };
      stores.set(subject, port);
    }
    return port;
  },
  revisions: {async forOpportunity(id, asOf, signal) {
    if (revisionFailure) {
      const code = revisionFailure; revisionFailure = null;
      throw new HufsApiError(code, httpStatusForError(makeApiError(code, 'SYN-E2E')));
    }
    return revisions.forOpportunity(id, asOf, signal);
  }},
  planCheck: syntheticPlanCheckPort(), whatIf: syntheticWhatIfPort(), doubleMajor: syntheticDoubleMajorPort(),
  applications: boardPort(new HufsApiClient(new SyntheticOwnerServer().fetch)),
  loadCalendar: (ctx, signal) => client.getCalendar(ctx.contextId, signal),
};

const location = {pathname: new URLSearchParams(window.location.search).get('screen') ?? '/experience'};
const historyPort: HistoryPort = {location,
  history: {pushState: (_data, _unused, next) => { location.pathname = String(next); }},
  addEventListener: () => {}, removeEventListener: () => {},
};
const styles = document.createElement('style'); styles.textContent = `:root{${cssVariables()}}`; document.head.append(styles);
createRoot(document.getElementById('root')!).render(createElement(StrictMode, null,
  createElement(App, {controller, services, historyPort, pages: appPages, transportLabel: '합성 시험 전용 · 외부 API 호출 없음'})));

export const controls = {
  select: (subject: SubjectAlias) => controller.select(subject),
  state: () => ({selected: controller.getState().selected, status: controller.getState().status,
    contextId: controller.getState().context?.contextId ?? null}),
  failSnapshot: (code: ApiErrorCode) => { snapshotFailure = code; },
  failApproval: (code: ApiErrorCode) => { approvalFailure = code; },
  failRevision: (code: ApiErrorCode) => { revisionFailure = code; },
  deferNextExperience: () => { deferExperience = true; },
  releaseExperience: () => { deferredSubject = null; for (const resolve of deferredExperience.splice(0)) resolve(); },
  closeSession: () => controller.invalidateLocalSession(),
};
declare global { interface Window { __prefinal: typeof controls } }
window.__prefinal = controls;
