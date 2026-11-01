import type {RecommendationProfile} from './evaluate.js';
import type {NoticeStudent} from '../notices/notice.js';
import type {LabelSet, RelevanceLabel} from './evaluation.js';

/**
 * Five SYNTHETIC demo students (S01–S05). Not real people: no names, student ids or grades.
 * The real 4-person intake is a separate, consent-gated private path and is never mixed in here.
 */
export interface DemoStudent {
  subject:'S01'|'S02'|'S03'|'S04'|'S05';
  label:string;
  profile:RecommendationProfile;
  noticeStudent:NoticeStudent;
}

export const DEMO_STUDENTS:readonly DemoStudent[] = [
  {subject:'S01', label:'가상 학생 1 · 데이터/AI 지망 3학년',
    profile:{desiredJobTopics:['DATA_ANALYTICS'], interestTopics:['AI_ML', 'SOFTWARE_DEV'], approvedExperienceTopics:['DATA_ANALYTICS'],
      approvedLanguageCodes:['en'], officialMajorTopics:[], facts:{enrollment:'ENROLLED', campus:'SEOUL', cohort:2023, certification:[]}},
    noticeStudent:{campus:'SEOUL', college:'가상대학 A', majors:[{major:'가상통계학과', role:'PRIMARY'}], cohort:2023, enrollmentState:'ENROLLED',
      admissionType:'REGULAR', targetGraduationTerm:'2027-2', openRequirementIds:['SYN-REQ-GRAD-CERT', 'SYN-REQ-MAJOR-CORE'], courseIds:['SYN-C-STAT201'], interestTopics:['AI_ML', 'SOFTWARE_DEV']}},
  {subject:'S02', label:'가상 학생 2 · 해외영업/무역 지망 4학년',
    profile:{desiredJobTopics:['GLOBAL_SALES'], interestTopics:['TRADE_OVERSEAS', 'LANGUAGE_TRANSLATION'], approvedExperienceTopics:['TRADE_OVERSEAS'],
      approvedLanguageCodes:['en', 'es'], officialMajorTopics:[], facts:{enrollment:'ENROLLED', campus:'GLOBAL', cohort:2022, teamRole:'LEADER'}},
    noticeStudent:{campus:'GLOBAL', college:'가상대학 B', majors:[{major:'가상스페인어과', role:'PRIMARY'}, {major:'가상국제통상학과', role:'DOUBLE'}], cohort:2022,
      enrollmentState:'ENROLLED', admissionType:'REGULAR', targetGraduationTerm:'2027-1', openRequirementIds:['SYN-REQ-GRAD-CERT'], courseIds:[], interestTopics:['TRADE_OVERSEAS', 'LANGUAGE_TRANSLATION']}},
  {subject:'S03', label:'가상 학생 3 · 국제기구/외교 지망 졸업예정',
    profile:{desiredJobTopics:['INTL_ORGANIZATION'], interestTopics:['DIPLOMACY_PUBLIC', 'INTL_COOPERATION'], approvedExperienceTopics:[],
      approvedLanguageCodes:['en', 'fr'], officialMajorTopics:[], facts:{enrollment:'ENROLLED', campus:'SEOUL', cohort:2021, certification:['SYN-LANG-CERT-FR']}},
    noticeStudent:{campus:'SEOUL', college:'가상대학 C', majors:[{major:'가상외교학과', role:'PRIMARY'}], cohort:2021, enrollmentState:'ENROLLED',
      admissionType:'REGULAR', targetGraduationTerm:'2026-2', graduationTermVerified:true, openRequirementIds:['SYN-REQ-GRAD-EXAM'], courseIds:[], interestTopics:['DIPLOMACY_PUBLIC', 'INTL_COOPERATION']}},
  {subject:'S04', label:'가상 학생 4 · 콘텐츠/마케팅/관광 관심 2학년',
    profile:{desiredJobTopics:['MARKETING_BRAND'], interestTopics:['MEDIA_CONTENT', 'CULTURE_TOURISM'], approvedExperienceTopics:['MEDIA_CONTENT'],
      approvedLanguageCodes:['ja'], officialMajorTopics:[], facts:{enrollment:'ENROLLED', campus:'SEOUL', cohort:2024}},
    noticeStudent:{campus:'SEOUL', college:'가상대학 D', majors:[{major:'가상미디어학과', role:'PRIMARY'}], cohort:2024, enrollmentState:'ENROLLED',
      admissionType:'FOREIGN', targetGraduationTerm:'2028-2', openRequirementIds:[], courseIds:['SYN-C-MEDIA101'], interestTopics:['MEDIA_CONTENT', 'CULTURE_TOURISM']}},
  {subject:'S05', label:'가상 학생 5 · 공공정책/ESG 관심 3학년',
    profile:{desiredJobTopics:['PUBLIC_POLICY'], interestTopics:['ESG_SUSTAINABILITY', 'ECONOMIC_RESEARCH'], approvedExperienceTopics:[],
      approvedLanguageCodes:[], officialMajorTopics:[], facts:{enrollment:'ENROLLED', cohort:2023}},
    noticeStudent:{campus:'SEOUL', majors:[{major:'가상행정학과', role:'PRIMARY'}], cohort:2023, enrollmentState:'ENROLLED',
      openRequirementIds:null, courseIds:[], interestTopics:['ESG_SUSTAINABILITY', 'ECONOMIC_RESEARCH']}},
];

/**
 * A15.1 relevance labels (0 무관 / 1 보조 / 2 매우 관련), 40 × 5 = 200, graded from each student's stated
 * goal and the posting text — NOT from the ranker's TopicCode overlap (two traps: SYN-OPP-013 is data work
 * tagged only MARKETING; SYN-OPP-033 is tagged DATA_ANALYTICS but is plain data entry).
 * STATUS = AGENT_DRAFT: drafted by the recommendation agent; an independent human/agent review is still
 * required before these labels are used as official evaluation evidence (A15.1). Eligibility is not labelled here.
 */
export const DEMO_LABEL_STATUS = 'AGENT_DRAFT' as const;

const L = (two:string[], one:string[]):LabelSet => {
  const out:Record<string, RelevanceLabel> = {};
  for (let n = 1; n <= 40; n++) out[`SYN-OPP-${String(n).padStart(3, '0')}`] = 0;
  for (const k of one) out[`SYN-OPP-${k}`] = 1;
  for (const k of two) out[`SYN-OPP-${k}`] = 2;
  return out;
};

export const DEMO_LABELS:Readonly<Record<DemoStudent['subject'], LabelSet>> = {
  S01:L(['002', '008', '013', '016', '019', '021', '029', '038'], ['003', '025', '036']),
  S02:L(['001', '007', '020', '026', '028'], ['011', '014', '037']),
  S03:L(['005', '015', '024', '030'], ['010', '037', '040']),
  S04:L(['004', '017', '022', '031', '035'], ['011', '013']),
  S05:L(['010', '018', '032', '040'], ['002', '014', '021', '024', '027']),
};
