import type {TopicCode} from '@hufs-one/contracts';
import type {ReviewerSandboxClientAction} from '../../integrations/reviewer-sandbox-contract.js';

/**
 * REVIEWER synthetic sandbox as seen by the UI: a pure fold over the server's action log
 * (latest action per item wins, RESET_SANDBOX clears everything before it). Nothing here is
 * stored in the browser; the server log is the only state.
 */
export interface SandboxState {
  readonly bookmarks: ReadonlySet<string>;
  readonly read: ReadonlySet<string>;
  readonly checklist: ReadonlySet<string>;
  readonly experiences: ReadonlyMap<string, string>;
  readonly drafts: ReadonlyMap<string, string>;
  readonly simulated: ReadonlySet<string>;
  readonly plannedCourses: ReadonlySet<string>;
  readonly interests: readonly TopicCode[] | null;
  readonly desiredJobs: readonly TopicCode[] | null;
  readonly search: string;
  readonly notifications: boolean | null;
}

export const EMPTY_SANDBOX: SandboxState = {
  bookmarks: new Set(), read: new Set(), checklist: new Set(), experiences: new Map(), drafts: new Map(),
  simulated: new Set(), plannedCourses: new Set(), interests: null, desiredJobs: null, search: '', notifications: null,
};

function toggle(set: Set<string>, id: string, on: boolean) {
  if (on) set.add(id); else set.delete(id);
}

export function deriveSandbox(actions: readonly ReviewerSandboxClientAction[]): SandboxState {
  const lastReset = actions.map(a => a.kind).lastIndexOf('RESET_SANDBOX');
  const bookmarks = new Set<string>(), read = new Set<string>(), checklist = new Set<string>();
  const simulated = new Set<string>(), plannedCourses = new Set<string>();
  const experiences = new Map<string, string>(), drafts = new Map<string, string>();
  let interests: readonly TopicCode[] | null = null, desiredJobs: readonly TopicCode[] | null = null;
  let search = '', notifications: boolean | null = null;
  for (const a of actions.slice(lastReset + 1)) {
    switch (a.kind) {
      case 'BOOKMARK': toggle(bookmarks, a.itemId, a.saved); break;
      case 'MARK_READ': toggle(read, a.itemId, a.read); break;
      case 'CHECKLIST': toggle(checklist, a.requirementId, a.done); break;
      case 'EXPERIENCE': experiences.set(a.experienceId, a.note); break;
      case 'APPLICATION_DRAFT': drafts.set(a.opportunityId, a.text); break;
      case 'SIMULATE_APPLICATION': simulated.add(a.opportunityId); break;
      case 'PLAN_COURSE': toggle(plannedCourses, a.courseId, a.planned); break;
      case 'SET_INTERESTS': interests = a.topics; break;
      case 'SET_DESIRED_JOBS': desiredJobs = a.topics; break;
      case 'SET_SEARCH': search = a.query; break;
      case 'SET_NOTIFICATIONS': notifications = a.enabled; break;
      case 'RESET_SANDBOX': break;
    }
  }
  return {bookmarks, read, checklist, experiences, drafts, simulated, plannedCourses, interests, desiredJobs, search, notifications};
}

/** Next unused synthetic experience id (server requires SYN-…). */
export function nextExperienceId(state: SandboxState): string {
  let n = state.experiences.size + 1;
  while (state.experiences.has(`SYN-EXP-${n}`)) n++;
  return `SYN-EXP-${n}`;
}
