import {TOPIC_CODES, type Opportunity} from '@hufs-one/contracts';
import {byCodeUnit} from '../normalization/dedupe.js';
import type {Notice} from '../notices/notice.js';
import {evaluateOpportunity, opportunityLifecycle, type RecommendationProfile} from './evaluate.js';
import {featureGroupKey} from './feed.js';

/**
 * #10 evaluation-corpus coverage: which cases the fixed corpus actually exercises, so a metric is never read
 * as covering a case the data does not contain. Pure; counts only, no ranking or label use.
 * A dimension that is absent is reported as 0 / an empty list, never omitted.
 */
export interface CorpusCoverage {
  asOf:string;
  corpusVersion:string;
  opportunities:{
    total:number;
    /** dataMode share: the evaluation corpus must stay 100% SYNTHETIC until real rights are approved (#252). */
    dataMode:Record<string, number>;
    kind:Record<string, number>;
    lifecycle:Record<string, number>;
    dataQuality:Record<string, number>;
    applicationRoute:Record<string, number>;
    deadline:{fixed:number; rolling:number; none:number; futurePublication:number; unknownPublication:number};
    conditionFields:Record<string, number>;
    withPrioritySelection:number;
    withCompletionRules:number;
    withEventSessions:number;
    withLanguages:number;
    /** kind+organizer groups holding more than one item: these exercise the feed's per-group cap. */
    sharedGroups:string[];
    topicsCovered:number;
    topicsTotal:number;
    topicsMissing:string[];
    /**
     * Correction/cancel/extension chains attached to these opportunities. The 40-item corpus has single
     * revisions only; correction behaviour is covered by the normalization correction fixtures instead.
     */
    revisionChains:number;
  };
  /** Code eligibility per student over the visible corpus: each student should see all three outcomes. */
  eligibilityByStudent:Record<string, Record<'ELIGIBLE'|'INELIGIBLE'|'UNKNOWN', number>>;
  notices:{total:number; category:Record<string, number>; verification:Record<string, number>;
    withAdminReportDeadline:number; withScholarshipConditions:number; withScope:number; withEventSessions:number};
}

const tally = <T>(items:readonly T[], key:(x:T) => string):Record<string, number> => {
  const out:Record<string, number> = {};
  for (const k of items.map(key).sort(byCodeUnit)) out[k] = (out[k] ?? 0) + 1;
  return out;
};

export function corpusCoverage(input:{
  asOf:string; corpusVersion:string; opportunities:readonly Opportunity[];
  publishedAtBySnapshotId:Readonly<Record<string, string>>; notices:readonly Notice[];
  students:readonly {subject:string; profile:RecommendationProfile}[];
}):CorpusCoverage {
  const {asOf, opportunities: ops, notices} = input;
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) throw new RangeError('asOf must be an ISO datetime');
  const published = (o:Opportunity) => {
    const raw = input.publishedAtBySnapshotId[o.sourceSnapshotId];
    return raw === undefined ? undefined : Date.parse(raw);
  };
  const groups = tally(ops, featureGroupKey);
  const topics = new Set(ops.flatMap(o => o.topicCodes));
  const snapshotsBySource = tally(ops, o => o.sourceSnapshotId.replace(/-r\d+$/u, ''));
  const eligibilityByStudent:CorpusCoverage['eligibilityByStudent'] = {};
  for (const s of [...input.students].sort((a, b) => byCodeUnit(a.subject, b.subject))) {
    const counts = {ELIGIBLE:0, INELIGIBLE:0, UNKNOWN:0};
    for (const o of ops) counts[evaluateOpportunity(s.profile, o, asOf).eligibility] += 1;
    eligibilityByStudent[s.subject] = counts;
  }
  return {
    asOf, corpusVersion:input.corpusVersion,
    opportunities:{
      total:ops.length,
      dataMode:tally(ops, o => o.dataMode),
      kind:tally(ops, o => o.kind),
      lifecycle:tally(ops, o => opportunityLifecycle(o, asOf)),
      dataQuality:tally(ops, o => o.dataQuality),
      applicationRoute:tally(ops, o => o.actualApplicationRoute),
      deadline:{
        fixed:ops.filter(o => o.applyClosesAt !== undefined).length,
        rolling:ops.filter(o => o.deadlineKind === 'ROLLING').length,
        none:ops.filter(o => o.applyClosesAt === undefined && o.deadlineKind !== 'ROLLING').length,
        futurePublication:ops.filter(o => (published(o) ?? -Infinity) > now).length,
        unknownPublication:ops.filter(o => published(o) === undefined || !Number.isFinite(published(o)!)).length,
      },
      conditionFields:tally(ops.flatMap(o => o.conditions), c => c.field),
      withPrioritySelection:ops.filter(o => o.prioritySelection.length > 0).length,
      withCompletionRules:ops.filter(o => o.completionRules.length > 0).length,
      withEventSessions:ops.filter(o => o.eventSessions.length > 0).length,
      withLanguages:ops.filter(o => o.languageCodes.length > 0).length,
      sharedGroups:Object.entries(groups).filter(([, n]) => n > 1).map(([k]) => k),
      topicsCovered:topics.size,
      topicsTotal:TOPIC_CODES.length,
      topicsMissing:TOPIC_CODES.filter(t => !topics.has(t)).sort(byCodeUnit),
      revisionChains:Object.values(snapshotsBySource).filter(n => n > 1).length,
    },
    eligibilityByStudent,
    notices:{
      total:notices.length,
      category:tally(notices, n => n.category),
      verification:tally(notices, n => n.verificationState),
      withAdminReportDeadline:notices.filter(n => n.adminReportDeadline !== undefined).length,
      withScholarshipConditions:notices.filter(n => (n.scholarshipConditions?.length ?? 0) > 0).length,
      withScope:notices.filter(n => n.campus !== undefined || n.majors?.length || n.admissionTypes?.length
        || n.graduationTermScope?.length || n.cohortRange !== undefined).length,
      withEventSessions:notices.filter(n => (n.eventSessions?.length ?? 0) > 0).length,
    },
  };
}
