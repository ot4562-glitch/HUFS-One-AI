import type {Notice} from './notice.js';
import {DEMO_AS_OF} from '../opportunities/demo-corpus.js';

/**
 * A12.1 demo academic notices — 10 SYNTHETIC notices (graduation 3, scholarship 3, course/exchange 4).
 * Fictional issuers ("시연가상학과"), ids SYN-NOT-*, evidence EV-SYN-*. A12.2 archetypes keep
 * SYN-NOT-001 (student vs admin deadline) and SYN-NOT-002 (course reform, approval shown as unverified).
 * Dates are relative to the shared DEMO_AS_OF (opportunities/demo-corpus.ts). Titles read like real notices;
 * test intent lives in DEMO_NOTICE_NOTES.
 */
const AS_OF = Date.parse(DEMO_AS_OF);
const d = (days:number, hours = 0) => new Date(AS_OF + days * 86_400_000 + hours * 3_600_000).toISOString();
const base = (n:string, over:Partial<Notice>):Notice => ({
  id:`SYN-NOT-${n}`, sourceSnapshotId:`SYN-NSRC-${n}-r1`, title:'', issuer:'시연가상학과', category:'GENERAL',
  verificationState:'VERIFIED', evidenceRefs:[`EV-SYN-NOT-${n}`], publishedAt:d(-7), ...over,
});

export const DEMO_NOTICES:readonly Notice[] = [
  // graduation ×3
  base('001', {title:'가상 졸업인증 서류 제출 안내', category:'ACADEMIC',
    requirementRefs:['SYN-REQ-GRAD-CERT'], studentDeadline:d(4, 9), adminReportDeadline:d(2)}),
  base('003', {title:'가상 졸업시험 시행 안내 (2026-2 졸업예정자)', category:'ACADEMIC',
    requirementRefs:['SYN-REQ-GRAD-EXAM'], graduationTermScope:['2026-2'], studentDeadline:d(10, 9), eventSessions:[{start:d(15, 1), end:d(15, 4)}]}),
  base('004', {title:'가상 외국인 유학생 졸업 한국어 시험 안내', category:'ACADEMIC',
    requirementRefs:['SYN-REQ-GRAD-KOR'], admissionTypes:['FOREIGN'], studentDeadline:d(21, 9)}),
  // scholarship ×3
  base('005', {title:'가상 성적우수 장학 신청', category:'SCHOLARSHIP',
    scholarshipConditions:['직전학기 평점 3.5 이상'], studentDeadline:d(8, 9)}),
  base('006', {title:'가상 교외 재단 장학생 모집', category:'SCHOLARSHIP', studentDeadline:d(12, 9)}),
  base('007', {title:'가상 장학 신청 안내', category:'SCHOLARSHIP', studentDeadline:d(-2, 9)}),
  // course / exchange ×4
  base('002', {title:'가상 교과개편·대체과목 안내', category:'ACADEMIC', verificationState:'CANDIDATE',
    courseRefs:['SYN-C-STAT201'], studentDeadline:d(6, 9)}),
  base('008', {title:'가상 수강정정 기간 안내', category:'ACADEMIC', courseRefs:['SYN-C-STAT201', 'SYN-C-MEDIA101'], studentDeadline:d(3, 9)}),
  base('009', {title:'가상 교환학생 파견 모집 (글로벌캠퍼스)', category:'EXCHANGE', campus:'GLOBAL', studentDeadline:d(18, 9)}),
  base('010', {title:'가상 데이터 진로 특강 안내', category:'CAREER', topicCodes:['DATA_ANALYTICS', 'AI_ML'], eventSessions:[{start:d(9, 5), end:d(9, 7)}]}),
];

/** Test-intent notes by id (moved out of titles after the UI consumer review on PR #60). */
export const DEMO_NOTICE_NOTES:Readonly<Record<string, string>> = {
  'SYN-NOT-001':'학생 제출 마감과 학과 보고 마감이 다름',
  'SYN-NOT-005':'성적 조건이 있으나 성적 미수집 → 적용 UNKNOWN',
  'SYN-NOT-007':'DEMO_AS_OF 기준 학생 마감 경과(overdue)',
  'SYN-NOT-002':'검증 전(CANDIDATE) 초안 → 검토 대기',
};
