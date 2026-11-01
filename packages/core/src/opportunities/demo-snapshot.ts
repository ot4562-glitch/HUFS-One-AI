import {DemoSnapshotSchema, TOPIC_DICTIONARY_VERSION, type DemoSnapshot} from '@hufs-one/contracts';
import {composeNotices} from '../notices/notice.js';
import {DEMO_NOTICES} from '../notices/demo-notices.js';
import {DEMO_AS_OF, DEMO_CORPUS_VERSION, DEMO_OPPORTUNITIES, DEMO_PUBLISHED_AT} from './demo-corpus.js';
import {DEMO_STUDENTS, type DemoStudent} from './demo-profiles.js';
import {composeFeed} from './feed.js';
import {scopeInputsToGrant, type SharedSection} from './scope.js';

/**
 * Generated SYNTHETIC DemoSnapshot views of the demo corpus (#61: one source, derived snapshots).
 * Every snapshot is recomputed from the single corpus at the single DEMO_AS_OF, scoped to the shared
 * sections first (#49), and validated with the official DemoSnapshotSchema. Academics / forecast are
 * PENDING: they belong to the academics track and are never invented here.
 * Use for CI, UI mocks and the REVIEWER synthetic sandbox only — never for a real-data selector slot.
 */
export const DEMO_SNAPSHOT_VERSION = `${DEMO_CORPUS_VERSION}+snapshot-v1`;
const ALL_SECTIONS:readonly SharedSection[] = ['FEED', 'NOTICES', 'EXPERIENCE', 'ACADEMICS', 'FORECAST'];

export interface DemoSnapshotOptions {
  /** Sections the (synthetic) viewer may see; defaults to all. FEED and NOTICES are required. */
  sharedSections?:readonly SharedSection[];
}

export function buildDemoSnapshot(student:DemoStudent, options:DemoSnapshotOptions = {}):DemoSnapshot {
  const sections = options.sharedSections ?? ALL_SECTIONS;
  const scoped = scopeInputsToGrant(student.profile, student.noticeStudent, sections);
  if (!scoped.profile || !scoped.noticeStudent) throw new RangeError('a demo snapshot needs FEED and NOTICES');
  const feed = composeFeed(scoped.profile, DEMO_OPPORTUNITIES, {asOf:DEMO_AS_OF, publishedAtBySnapshotId:DEMO_PUBLISHED_AT});
  const notices = composeNotices(scoped.noticeStudent, DEMO_NOTICES, {asOf:DEMO_AS_OF});
  const pending = (section:SharedSection) => ({state:sections.includes(section) ? 'PENDING' as const : 'NOT_SHARED' as const});
  return DemoSnapshotSchema.parse({
    contextId:`SYN-CTX-${student.subject}`,
    demoSubjectId:student.subject,
    datasetMode:'SYNTHETIC',
    asOf:DEMO_AS_OF,
    versions:{
      profile:`${DEMO_SNAPSHOT_VERSION}:${student.subject}`, projection:`SYN-PROJ-${scoped.scopeKey}`, consent:'SYN-CONSENT-ALL',
      dataset:DEMO_CORPUS_VERSION, topics:TOPIC_DICTIONARY_VERSION, rules:'SYN-RULES-PENDING', overlay:'SYN-OVERLAY-NONE',
      rankConfig:feed.rankConfigVersion,
    },
    feed:feed.feed,
    notices:notices.result,
    academics:pending('ACADEMICS'),
    forecast:pending('FORECAST'),
    aiProvenance:'NONE',
  });
}

/** One snapshot per synthetic student S01–S05, all shared, in subject order. */
export function buildDemoSnapshots(options:DemoSnapshotOptions = {}):DemoSnapshot[] {
  return DEMO_STUDENTS.map(s => buildDemoSnapshot(s, options));
}
