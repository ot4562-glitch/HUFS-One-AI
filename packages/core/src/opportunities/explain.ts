import type {TopicCode} from '@hufs-one/contracts';
import {TOPIC_LABELS_KO} from '../normalization/topics.js';
import type {ConditionField} from './evaluate.js';
import {DEFAULT_RANK_CONFIG, type RankConfig, type RankedOpportunity} from './rank.js';

/**
 * Code-built recommendation explanation (A05.2: "추천 이유는 실제 일치 topic·학생 승인 evidence·원문 조건을
 * 코드 템플릿으로 먼저 구성"). Deterministic, no AI. An LLM may later only rephrase within these facts.
 */
export type RelevanceLevel = 'HIGH'|'MEDIUM'|'LOW'|'GENERAL';

export interface ScorePart {key:'J'|'I'|'S'|'L'|'M'|'F'; label:string; points:number; max:number}
export interface ReasonLine {
  code:'JOB_MATCH'|'INTEREST_MATCH'|'EXPERIENCE_MATCH'|'LANGUAGE_MATCH'|'MAJOR_MATCH'|'RECENT'|'NO_PERSONAL_MATCH';
  text:string;
  topics?:TopicCode[];
}
export interface EligibilityNote {
  state:'ELIGIBLE'|'INELIGIBLE'|'UNKNOWN';
  text:string;
  /** Condition fields that failed (INELIGIBLE) or had no student value (UNKNOWN). */
  fields:ConditionField[];
  evidenceRefs:string[];
}
export interface DeadlineNote {
  kind:'CONFIRMED'|'EVENT_ONLY'|'RECORD_ONLY'|'UNKNOWN';
  text:string;
  iso?:string;
}
export interface RecommendationExplanation {
  opportunityId:string;
  relevance:{
    /** 0–100, the code score total rounded. Not a probability of acceptance or employment. */
    score:number;
    level:RelevanceLevel;
    label:string;
    breakdown:ScorePart[];
    disclaimer:string;
  };
  reasons:ReasonLine[];
  eligibility:EligibilityNote;
  deadline:DeadlineNote;
  /** Number of 우대사항 lines; they are never application requirements. */
  prioritySelectionCount:number;
  provenance:'CODE_RULES';
  rankConfigVersion:string;
}

/** Design thresholds on the 0–100 score (team choice, revisit with A15 evaluation). */
export const RELEVANCE_THRESHOLDS = {HIGH:60, MEDIUM:35} as const;
export const SCORE_DISCLAIMER = '관심·직무·경험 일치를 코드로 계산한 관련도예요. 합격이나 취업 가능성이 아니에요.';

const LEVEL_LABEL:Record<RelevanceLevel, string> = {HIGH:'관련 높음', MEDIUM:'관련 보통', LOW:'관련 낮음', GENERAL:'일반 공고'};
const FIELD_LABEL:Record<ConditionField, string> = {
  enrollment:'학적', campus:'캠퍼스', major:'전공', cohort:'학번', degree:'학위과정',
  time:'일정', teamRole:'팀 역할', certification:'자격증',
};
const PART_LABEL = {J:'희망 직무', I:'관심 분야', S:'승인한 경험', L:'언어', M:'전공', F:'최신 게시'} as const;

const topicList = (topics:readonly TopicCode[]) => topics.map(t => `‘${TOPIC_LABELS_KO[t]}’`).join(', ');
const fieldList = (fields:readonly ConditionField[]) => fields.map(f => FIELD_LABEL[f]).join('·');
const round1 = (x:number) => Math.round(x * 10) / 10;

/** 와/과 by the final consonant of the last Hangul syllable (non-Hangul endings default to 와). */
function waGwa(text:string):'와'|'과' {
  const chars = [...text.replace(/[’'\s]+$/u, '')];
  const code = (chars[chars.length - 1] ?? '').codePointAt(0) ?? 0;
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0 ? '과' : '와';
}

/** Korea has no DST: a fixed +09:00 keeps the text deterministic on every server. */
function seoulText(iso:string):string {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${hh}:${mm}`;
}

export function relevanceLevel(r:RankedOpportunity):RelevanceLevel {
  if (!r.relevant) return 'GENERAL'; // freshness/language alone never make an item personal
  const total = r.score.total;
  return total >= RELEVANCE_THRESHOLDS.HIGH ? 'HIGH' : total >= RELEVANCE_THRESHOLDS.MEDIUM ? 'MEDIUM' : 'LOW';
}

function eligibilityNote(r:RankedOpportunity):EligibilityNote {
  const e = r.evaluation;
  const failed = e.conditions.filter(c => c.outcome === 'FAIL').map(c => c.field);
  const missing = e.conditions.filter(c => c.outcome === 'UNKNOWN').map(c => c.field);
  const uniq = (xs:ConditionField[]) => [...new Set(xs)];
  if (e.eligibility === 'ELIGIBLE') {
    return {state:'ELIGIBLE', fields:[], evidenceRefs:e.evidenceRefs,
      text:e.conditions.length === 0 ? '공고에 별도 지원 조건이 없어요.' : '공고에 적힌 지원 조건을 모두 확인했어요.'};
  }
  if (e.eligibility === 'INELIGIBLE') {
    return {state:'INELIGIBLE', fields:uniq(failed), evidenceRefs:e.evidenceRefs, text:`지원 조건(${fieldList(uniq(failed))})이 맞지 않아요.`};
  }
  let text:string;
  if (e.dataQuality === 'CONFLICT') text = '공고 안의 조건이 서로 달라 확인이 필요해요.';
  else if (missing.length > 0) text = `${fieldList(uniq(missing))} 정보가 없어 지원 가능 여부를 확인해야 해요.`;
  else if (e.dataQuality === 'STALE') text = '공고 정보가 오래되어 원문 확인이 필요해요.';
  else text = '공고 정보가 일부만 확인되어 원문 확인이 필요해요.';
  return {state:'UNKNOWN', fields:uniq(missing), evidenceRefs:e.evidenceRefs, text};
}

function deadlineNote(r:RankedOpportunity):DeadlineNote {
  const o = r.opportunity;
  if (r.evaluation.deadline !== undefined) {
    return {kind:'CONFIRMED', iso:r.evaluation.deadline, text:`${seoulText(r.evaluation.deadline)}까지 신청`};
  }
  if (o.actualApplicationRoute === 'RECORD_ONLY') return {kind:'RECORD_ONLY', text:'기록용 페이지예요. 실제 모집 마감은 원문에서 확인하세요.'};
  if (o.eventSessions.length > 0) return {kind:'EVENT_ONLY', text:'행사 기간만 공개돼 있어요. 신청 마감은 원문에서 확인하세요.'};
  return {kind:'UNKNOWN', text:'마감일이 확인되지 않았어요(상시·채용 시 마감 포함). 원문을 확인하세요.'};
}

export function explainRecommendation(r:RankedOpportunity, config:RankConfig = DEFAULT_RANK_CONFIG):RecommendationExplanation {
  const w = config.weights;
  const s = r.score;
  const breakdown:ScorePart[] = (['J', 'I', 'S', 'L', 'M', 'F'] as const).map(key => ({
    key, label:PART_LABEL[key], points:round1(w[key] * s[key]), max:w[key],
  }));
  const reasons:ReasonLine[] = [];
  if (r.matched.job.length) reasons.push({code:'JOB_MATCH', topics:r.matched.job, text:`희망 직무 ${topicList(r.matched.job)}${waGwa(topicList(r.matched.job))} 일치해요.`});
  if (r.matched.interest.length) reasons.push({code:'INTEREST_MATCH', topics:r.matched.interest, text:`관심 분야 ${topicList(r.matched.interest)}${waGwa(topicList(r.matched.interest))} 일치해요.`});
  if (r.matched.experience.length) reasons.push({code:'EXPERIENCE_MATCH', topics:r.matched.experience, text:`승인한 경험의 주제 ${topicList(r.matched.experience)}${waGwa(topicList(r.matched.experience))} 관련 있어요.`});
  if (s.L === 1) reasons.push({code:'LANGUAGE_MATCH', text:'공고의 사용 언어가 내가 등록한 언어와 맞아요(어학 자격 인정은 아님).'});
  if (s.M === 1) reasons.push({code:'MAJOR_MATCH', text:'전공과 관련된 주제예요.'});
  if (s.F >= 0.5) reasons.push({code:'RECENT', text:'최근 15일 안에 게시됐어요.'});
  if (!r.relevant) reasons.unshift({code:'NO_PERSONAL_MATCH', text:'내 관심·직무·경험과 직접 일치하지는 않는 일반 공고예요.'});
  const level = relevanceLevel(r);
  return {
    opportunityId:r.opportunity.id,
    relevance:{score:Math.round(s.total), level, label:LEVEL_LABEL[level], breakdown, disclaimer:SCORE_DISCLAIMER},
    reasons,
    eligibility:eligibilityNote(r),
    deadline:deadlineNote(r),
    prioritySelectionCount:r.opportunity.prioritySelection.length,
    provenance:'CODE_RULES',
    rankConfigVersion:config.version,
  };
}
