import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {courseCsvHeaders, importSavedCurriculum} from '../../apps/api/src/modules/curriculum/permitted-curriculum.js';
import {importWisTimetable} from '../../packages/core/src/academics/wis-timetable.js';
import {SAVED_CURRICULUM_CSV_HEADERS, toSavedCurriculumCsv, WIS_TIMETABLE_CONVERTER_VERSION}
  from '../../packages/core/src/academics/wis-timetable-csv.js';

/**
 * #133 hand-off: a synthetic saved timetable page, converted and exported, must pass the
 * operator-saved curriculum import unchanged. No real page or student data is used.
 */
const NOW = '2026-11-03T00:00:00.000Z';
const URL = 'https://wis.hufs.ac.kr/src08/jsp/lecture/LECTURE2020L.jsp';
const HEADER = ['No.', '개설영역', '학년', '학수번호', '교과목명', '강의계획서', '속성<br>Attributes', '담당교수',
  '학점', '시간', '강의시간/<br>강의실', '수강인원/<br>제한인원', '사전수강신청/관심강좌신청<br>(Course Wishlist)', '비고'];
const course = (no:number, code:string, title:string, attrs:string, credits:string, syllabus = true) => {
  const link = `lecture_open('2026','3','A','${code}')`;
  return {
    row:`<tr><td>${no}</td><td>전공</td><td>3</td><td class="col-code">${code}</td>`
      + `<td class="align_left">${syllabus ? `<div onclick="javascript:${link}">${title}</div>` : title}</td>`
      + `<td>${syllabus ? `<a class="btn-plan" href="javascript:${link}">▤</a>` : ''}</td><td>${attrs}</td><td>가상 교수</td>`
      + `<td>${credits}</td><td>3</td><td>화 3 4 (0101)</td><td>10 / 30</td><td><span class="col-note"></span></td></tr>`,
    card:`<div class="sch-card"><div class="sch-card-code">${code} · 전공 3</div>${syllabus ? `<a class="btn-plan" href="javascript:${link}">▤</a>` : ''}</div>`,
  };
};
const rows = [
  course(1, 'SYN010101', '가상 세미나, 실습', '<div class="attr-cell"><span class="attr attr--req">전필</span></div>', '3'),
  course(2, 'SYN010102', '가상 세미나, 실습', '<span class="attr-none">–</span>', '3'),
  course(3, 'SYN020101', '가상 "고급" 읽기', '<span class="attr-none">–</span>', '1.5'),
  course(4, 'SYN030101', '가상 계획서 없음', '<span class="attr-none">–</span>', '3', false),
];
const CAMPUS = '<input name="campus_sect" type="radio" value="H1" checked=""><input name="campus_sect" type="radio" value="H2">'
  + '<select name="ag_crs_strct_cd"><option>&nbsp;(서울)&nbsp;-&nbsp;가상학과&nbsp;</option><option>(서울) - 가상학부</option></select>';
const html = `<!-- saved from url=(0057)${URL} -->\n<html><body>${CAMPUS}<table><thead><tr>${HEADER.map(h => `<th>${h}</th>`).join('')}</tr></thead>`
  + `<tbody>${rows.map(r => r.row).join('')}</tbody></table>${rows.map(r => r.card).join('')}</body></html>`;
const hash = (value:string|Uint8Array) => createHash('sha256').update(value).digest('hex');

describe('saved timetable hand-off to the operator-saved curriculum import', () => {
  it('uses exactly the import CSV header', () => {
    expect([...SAVED_CURRICULUM_CSV_HEADERS]).toEqual([...courseCsvHeaders]);
  });

  it('imports the exported CSV with its hashes and keeps codes, titles, and credits intact', async () => {
    const original = Buffer.from(html, 'utf8');
    const converted = importWisTimetable({html, fileName:'SYNDEPT_2026-2_강의시간표.html', savedAt:NOW});
    expect(converted.campus).toBe('SEOUL');
    const exported = toSavedCurriculumCsv(converted);
    expect(exported.withheld).toEqual([{no:4, rawCode:'SYN030101', reason:'TERM_FROM_PAGE'}]);
    const capture={capturedAt:NOW,term:'2026-2',campus:converted.campus,scope:converted.departmentLabel,
      converterVersion:WIS_TIMETABLE_CONVERTER_VERSION,permissionRef:'SYN-PERMISSION',permissionVersion:'1'};
    const permission = {...capture,sourceUrl:URL, permissionRef:'SYN-PERMISSION', permissionVersion:'1',
      permissionEvidenceUrl:'https://wis.hufs.ac.kr/synthetic-terms', verifiedAt:NOW, expiresAt:'2026-12-01T00:00:00.000Z',
      edition:'SYN-2026-2', sourceKind:'OFFERINGS' as const, collection:'ALLOWED' as const, retention:'ALLOWED' as const,
      terms:'ALLOWED' as const, revoked:false as const, acquisitionMethod:'OPERATOR_SAVED' as const, robots:'NOT_APPLICABLE' as const,
      savedArtifactSha256:hash(original), normalizedCsvSha256:hash(exported.csv), capturedAt:NOW,
      converterVersion:WIS_TIMETABLE_CONVERTER_VERSION, redistribution:'DENIED' as const};
    const revision = await importSavedCurriculum({sourceUrl:URL, originalBytes:original, csv:exported.csv,capture,
      authority:{resolveSaved:async () => permission}, now:() => NOW});
    expect(revision.duplicateRows).toBe(0);
    expect(revision.courses.map(c => [c.courseCode, c.courseName, c.creditUnits, c.category, c.semester, c.campus, c.cohort,
      c.collectionStatus, c.offeringStatus, c.rulesStatus])).toEqual([
      ['SYN010101', '가상 세미나, 실습', 6, '전공', '2026-2', 'SEOUL', 'UNKNOWN', 'COLLECTED', 'CONFIRMED', 'NEEDS_REVIEW'],
      ['SYN010102', '가상 세미나, 실습', 6, '전공', '2026-2', 'SEOUL', 'UNKNOWN', 'COLLECTED', 'CONFIRMED', 'NEEDS_REVIEW'],
      ['SYN020101', '가상 "고급" 읽기', 3, '전공', '2026-2', 'SEOUL', 'UNKNOWN', 'COLLECTED', 'CONFIRMED', 'NEEDS_REVIEW'],
    ]);
    expect(exported.details.find(detail => detail.rawCode === 'SYN010101')?.completion).toBe('REQUIRED');
    expect(revision.manualCapture).toMatchObject({converterVersion:WIS_TIMETABLE_CONVERTER_VERSION, redistribution:'DENIED'});
    expect(JSON.stringify(revision)).not.toMatch(/가상 교수|10 \/ 30|<html>/);
  });
});
