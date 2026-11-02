import type {TopicCode} from '@hufs-one/contracts';
import type {ClubActivity, ClubCampus, ClubCategory, ClubPost, ClubPostState, ClubProfile} from './clubs.js';
import {DEMO_AS_OF} from './demo-corpus.js';
import {DEMO_STUDENTS, type DemoStudent} from './demo-profiles.js';

/**
 * #123 SYNTHETIC club recruiting demo. Every club, name, summary and poster id is invented for the demo
 * ("가상동아리 …"): no real HUFS club, student contact, Everytime post or image is copied or implied.
 * 12 APPROVED posts in 10 categories (shown) + 5 posts in other states that must never be shown.
 * Dates are relative to DEMO_AS_OF. Poster ids are placeholders for the UI track's synthetic assets.
 */
export const DEMO_CLUB_CORPUS_VERSION = 'syn-clubs-v1';
const AS_OF = Date.parse(DEMO_AS_OF);
const d = (days:number) => new Date(AS_OF + days * 86_400_000).toISOString();

interface Spec {
  n:string; name:string; summary:string; category:ClubCategory; campus:ClubCampus; topics:TopicCode[]; activities:ClubActivity[];
  state?:ClubPostState; approvedAt?:number|null; opens?:number; closes?:number|null; created?:number;
  conditions?:ClubPost['conditions'];
}
const post = (s:Spec):ClubPost => {
  const created = s.created ?? -14;
  const state = s.state ?? 'APPROVED';
  const approved = s.approvedAt === null ? undefined : s.approvedAt ?? (state === 'APPROVED' || state === 'EXPIRED' || state === 'REVOKED' ? created + 2 : undefined);
  const out:ClubPost = {
    id:`SYN-CLUB-${s.n}`, clubName:`가상동아리 ${s.name}`, summary:s.summary, category:s.category, campus:s.campus,
    topicCodes:s.topics, activities:s.activities, conditions:s.conditions ?? [], state,
    createdAt:d(created), updatedAt:d(created + 1), posterAssetId:`SYN-POSTER-CLUB-${s.n}`, dataMode:'SYNTHETIC',
  };
  if (approved !== undefined) out.approvedAt = d(approved);
  if (s.opens !== undefined) out.recruitOpensAt = d(s.opens);
  if (s.closes !== null) out.recruitClosesAt = d(s.closes ?? 10);
  return out;
};
const ev = (n:string) => `EV-SYN-CLUB-${n}`;

export const DEMO_CLUB_POSTS:readonly ClubPost[] = [
  post({n:'001', name:'올라 회화랩', summary:'스페인어로 주 1회 수다 떠는 회화 모임', category:'LANGUAGE', campus:'GLOBAL',
    topics:['LANGUAGE_TRANSLATION', 'CULTURE_TOURISM'], activities:['STUDY', 'NETWORKING'], closes:12}),
  post({n:'002', name:'번역공방', summary:'짧은 글을 함께 번역하고 서로 고쳐 주는 스터디', category:'LANGUAGE', campus:'SEOUL',
    topics:['LANGUAGE_TRANSLATION'], activities:['STUDY', 'CREATION'], closes:null}),
  post({n:'003', name:'모의유엔 라운드테이블', summary:'가상 의제로 대표단 토론과 결의안 작성', category:'INTERNATIONAL', campus:'SEOUL',
    topics:['INTL_ORGANIZATION', 'DIPLOMACY_PUBLIC', 'INTL_COOPERATION'], activities:['DEBATE', 'PROJECT'], closes:9,
    conditions:[{field:'enrollment', operator:'EQ', value:'ENROLLED', evidenceId:ev('003')}]}),
  post({n:'004', name:'글로벌 버디', summary:'교환학생과 1:1 버디로 캠퍼스 생활 돕기', category:'INTERNATIONAL', campus:'BOTH',
    topics:['INTL_COOPERATION', 'CULTURE_TOURISM'], activities:['NETWORKING', 'MENTORING'], closes:6}),
  post({n:'005', name:'데이터 산책', summary:'공공데이터로 작은 분석 프로젝트를 매 학기 하나씩', category:'IT_AI', campus:'SEOUL',
    topics:['DATA_ANALYTICS', 'AI_ML'], activities:['PROJECT', 'STUDY'], closes:8}),
  post({n:'006', name:'코드 한 줄', summary:'처음 코딩하는 사람을 위한 웹 만들기 모임', category:'IT_AI', campus:'GLOBAL',
    topics:['SOFTWARE_DEV', 'PRODUCT_UX'], activities:['PROJECT', 'MENTORING'], closes:15,
    conditions:[{field:'cohort', operator:'GTE', value:2023, evidenceId:ev('006')}]}),
  post({n:'007', name:'경제 신문 읽기', summary:'매주 경제 기사 한 편을 읽고 토론', category:'ACADEMIC', campus:'SEOUL',
    topics:['ECONOMIC_RESEARCH', 'FINANCE_INVESTMENT'], activities:['STUDY', 'DEBATE'], closes:20}),
  post({n:'008', name:'정책 실험실', summary:'캠퍼스 문제를 정책 제안서로 만들어 보는 학회', category:'ACADEMIC', campus:'BOTH',
    topics:['PUBLIC_POLICY', 'ESG_SUSTAINABILITY'], activities:['PROJECT', 'DEBATE'], opens:3, closes:17}),
  post({n:'009', name:'필름 앤 컷', summary:'짧은 영상 기획부터 편집까지 함께 만드는 모임', category:'MEDIA', campus:'SEOUL',
    topics:['MEDIA_CONTENT', 'MARKETING_BRAND'], activities:['CREATION', 'PROJECT'], closes:5}),
  post({n:'010', name:'초록 발자국', summary:'캠퍼스 주변 줍깅과 친환경 캠페인', category:'VOLUNTEER', campus:'BOTH',
    topics:['ESG_SUSTAINABILITY'], activities:['VOLUNTEERING'], closes:null}),
  post({n:'011', name:'새벽 러닝 크루', summary:'일주일에 두 번 아침 5km 함께 달리기', category:'SPORTS', campus:'SEOUL',
    topics:[], activities:['MATCH', 'NETWORKING'], closes:-2}),
  post({n:'012', name:'어쿠스틱 노트', summary:'통기타와 보컬로 학기말 작은 공연', category:'MUSIC', campus:'GLOBAL',
    topics:['CULTURE_TOURISM'], activities:['PERFORMANCE'], closes:11,
    conditions:[{field:'time', operator:'EQ', value:'WEEKDAY_EVENING', evidenceId:ev('012')}]}),
  // Never shown: not (or no longer) approved, or approved only after asOf.
  post({n:'013', name:'초안 모임', summary:'작성 중인 초안', category:'CAREER', campus:'SEOUL', topics:['DATA_ANALYTICS'], activities:['STUDY'], state:'DRAFT'}),
  post({n:'014', name:'검토 대기 모임', summary:'관리자 검토를 기다리는 글', category:'IT_AI', campus:'SEOUL', topics:['AI_ML'], activities:['PROJECT'], state:'REVIEW_PENDING'}),
  post({n:'015', name:'반려된 모임', summary:'반려된 글', category:'CAREER', campus:'BOTH', topics:['GLOBAL_SALES'], activities:['NETWORKING'], state:'REJECTED'}),
  post({n:'016', name:'철회된 모임', summary:'승인이 취소된 글', category:'LANGUAGE', campus:'GLOBAL', topics:['LANGUAGE_TRANSLATION'], activities:['STUDY'], state:'REVOKED'}),
  post({n:'017', name:'내일 승인될 모임', summary:'asOf 이후에 승인되는 글', category:'CULTURE_ART', campus:'SEOUL', topics:['MEDIA_CONTENT'], activities:['CREATION'], approvedAt:1}),
];

/** Club-side choices for the five synthetic students (explicit activity / campus picks only). */
const CLUB_CHOICES:Readonly<Record<DemoStudent['subject'], {activities:ClubActivity[]; campus?:'SEOUL'|'GLOBAL'}>> = {
  S01:{activities:['PROJECT', 'STUDY'], campus:'SEOUL'},
  S02:{activities:['NETWORKING'], campus:'GLOBAL'},
  S03:{activities:['DEBATE'], campus:'SEOUL'},
  S04:{activities:['CREATION', 'TRIP'], campus:'SEOUL'},
  S05:{activities:['VOLUNTEERING', 'PROJECT']},
};

/** Builds a club profile from a demo student: explicit interests + approved experience + club choices. */
export function demoClubProfile(student:DemoStudent):ClubProfile {
  const c = CLUB_CHOICES[student.subject];
  const out:ClubProfile = {
    interestTopics:student.profile.interestTopics,
    approvedExperienceTopics:student.profile.approvedExperienceTopics,
    desiredActivities:c.activities,
    facts:student.profile.facts,
  };
  if (c.campus !== undefined) out.campus = c.campus;
  return out;
}

export const DEMO_CLUB_PROFILES:readonly {subject:DemoStudent['subject']; profile:ClubProfile}[] =
  DEMO_STUDENTS.map(s => ({subject:s.subject, profile:demoClubProfile(s)}));
