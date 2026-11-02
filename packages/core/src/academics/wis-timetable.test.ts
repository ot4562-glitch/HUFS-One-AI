import {describe, expect, it} from 'vitest';
import {importWisTimetable, type TimetableImportRequest} from './wis-timetable.js';

/**
 * Synthetic pages only: the layout mirrors a saved wis.hufs.ac.kr 강의시간표 page, but every
 * code, title, name, room, and note is made up. No real timetable is stored in the repo.
 */
const SAVED = '<!-- saved from url=(0057)https://wis.hufs.ac.kr/src08/jsp/lecture/LECTURE2020L.jsp -->';
const HEADER = ['No.', '개설영역', '학년', '학수번호', '교과목명', '강의계획서', '속성<br>Attributes', '담당교수',
  '학점', '시간', '강의시간/<br>강의실', '수강인원/<br>제한인원', '사전수강신청/관심강좌신청<br>(Course Wishlist)', '비고'];

interface Row {no?:number; area?:string; grade?:string; code:string; title:string; attrs?:string[];
  credits?:string; hours?:string; time?:string; note?:string; year?:string; sessn?:string;
  /** Syllabus cell: a link (default), empty (no syllabus), or other text. */
  syllabus?:'LINK'|'NONE'|'TEXT'; linkCode?:string; titleLinkCode?:string; dropLastCell?:boolean; dropNumberCell?:boolean}

const ATTR_CLASS:Record<string, string> = {'전필':'req', 'R':'req', 'ENG':'eng', 'FRE':'eng', 'F':'eng', '팀티칭':'team', '온라인':'online', 'P/F':'pf'};
const link = (row:Row, code = row.code) =>
  `<a class="btn-plan" href="javascript:lecture_open('${row.year ?? '2026'}','${row.sessn ?? '3'}','A','${code}')">▤</a>`;
const syllabusCell = (row:Row) =>
  row.syllabus === 'NONE' ? '' : row.syllabus === 'TEXT' ? '준비중' : link(row, row.linkCode ?? row.code);
const tr = (row:Row, index:number) => {
  // Like the real page, the title cell also opens the syllabus, except for a course without one.
  const title = row.syllabus === 'NONE' ? row.title
    : `<div onclick="javascript:lecture_open('${row.year ?? '2026'}','${row.sessn ?? '3'}','A','${row.titleLinkCode ?? row.code}')">${row.title}</div>`;
  const cells = [`${row.no ?? index + 1}`, row.area ?? '전공', row.grade ?? '2', row.code, title, syllabusCell(row),
    row.attrs?.length ? `<div class="attr-cell">${row.attrs.map(a => `<span class="attr attr--${ATTR_CLASS[a] ?? 'x'}">${a}</span>`).join('')}</div>` : '<span class="attr-none">–</span>',
    '가상 교수', row.credits ?? '3', row.hours ?? '3', row.time ?? '화 3 4 5 (0101)', '10 / 30', `<span class="col-note">${row.note ?? ''}</span>`];
  const kept = cells.slice(row.dropNumberCell ? 1 : 0, row.dropLastCell ? -1 : undefined);
  return `<tr>${kept.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
};
/** The real page also draws one card per course, with the same code and, if any, the syllabus link. */
const card = (row:Row) => `<div class="sch-card"><div class="sch-card-top"><div>
  <div class="sch-card-code">${row.code} · ${row.area ?? '전공'} ${row.grade ?? '2'}</div><div class="sch-card-name">${row.title}</div></div>
  ${row.syllabus === 'NONE' ? '' : link(row)}</div></div>`;

const page = (rows:readonly Row[], over:{header?:string[]; saved?:string; cards?:readonly Row[]} = {}) => `<!DOCTYPE html>
${over.saved ?? SAVED}
<html><body><script>var tpl = '<tr><td>'+(i+1)+'</td><td>x</td></tr>';</script>
<table><thead><tr>${(over.header ?? HEADER).map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows.map(tr).join('\n')}</tbody></table>
<div class="sch-cards">${(over.cards ?? rows).map(card).join('\n')}</div></body></html>`;

const ROWS:Row[] = [
  {code:'SYN010101', title:'가상 영어작문', grade:'1', credits:'2', hours:'2', attrs:['전필', 'ENG'], time:'수 1 2 (0101)',
    note:'21학번부터 전필. 가상 배치고사 미응시자 수강 불가.'},
  {code:'SYN010102', title:'가상 영어작문', grade:'1', credits:'2', hours:'2', attrs:['전필', 'ENG'], time:'목 7 8 (0202)',
    note:'1전공 우선수강(가상 안내).'},
  {code:'SYN020101', title:'가상 언어학 입문 &amp; 실습', area:'이중(부)전공', attrs:['ENG'], time:'월 3 4 (0303) 수 3 (0303)',
    note:'선수강 과목: 가상 프로그래밍(1). 1전공 수강금지'},
];

const request = (html:string, over:Partial<TimetableImportRequest> = {}):TimetableImportRequest => ({
  html, fileName:'SYNDEPT_2026-2_강의시간표.html', savedAt:'2026-11-02T09:47:00.000Z', ...over,
});

describe('importWisTimetable', () => {
  it('turns each listed section into one row with the facts the page states', () => {
    const result = importWisTimetable(request(page(ROWS)));
    expect(result).toMatchObject({
      source:{system:'HUFS_WIS_LECTURE_TIMETABLE', savedFromUrl:'https://wis.hufs.ac.kr/src08/jsp/lecture/LECTURE2020L.jsp',
        fileName:'SYNDEPT_2026-2_강의시간표.html', savedAt:'2026-11-02T09:47:00.000Z'},
      term:{year:2026, session:'2', academicTerm:'2026-2'},
      departmentLabel:'SYNDEPT', coverage:'ONE_DEPARTMENT_PAGE',
    });
    expect(result.rows[0]).toEqual({
      no:1, area:'MAJOR', areaLabel:'전공', gradeYear:1, rawCode:'SYN010101', code:{status:'NEEDS_REVIEW'},
      title:'가상 영어작문', attributes:['REQUIRED', 'FOREIGN_LANGUAGE'], instructionLanguage:'ENG', otherAttributes:[], creditUnits:4, hours:2,
      meetings:[{day:'WED', periods:[1, 2], room:'0101'}],
      note:'21학번부터 전필. 가상 배치고사 미응시자 수강 불가.',
      noteHints:{prerequisite:false, cohort:true, restriction:true, equivalent:false}, termEvidence:'ROW_LINK', needsReview:false,
    });
    expect(result.rows[1]).toMatchObject({attributes:['REQUIRED', 'FOREIGN_LANGUAGE'], otherAttributes:[],
      noteHints:{prerequisite:false, cohort:false, restriction:false, equivalent:false}});
    const plain = importWisTimetable(request(page([{code:'SYN050101', title:'가상 무속성'}])));
    expect(plain.rows[0]).toMatchObject({attributes:[], otherAttributes:[], needsReview:false});
    expect(plain.issues).toEqual([]);
    const same = importWisTimetable(request(page([{code:'SYN070101', title:'가상 입문', note:'가상 개론(1)과 동일과목'}])));
    expect(same.rows[0]!.noteHints.equivalent).toBe(true);
    expect(same.issues.map(issue => issue.code)).toEqual(['NOTE_NEEDS_REVIEW']);
    const more = importWisTimetable(request(page([
      {code:'SYN060101', title:'가상 온라인', attrs:['온라인', 'P/F', 'F']},
      {code:'SYN080101', title:'가상 불어강독', attrs:['R', 'FRE']},
    ])));
    expect(more.rows[0]).toMatchObject({attributes:['ONLINE', 'PASS_FAIL', 'FOREIGN_LANGUAGE'], instructionLanguage:null, otherAttributes:[], needsReview:false});
    expect(more.rows[1]).toMatchObject({attributes:['REQUIRED', 'FOREIGN_LANGUAGE'], instructionLanguage:'FRE', needsReview:false});
    expect(result.rows[2]).toMatchObject({
      area:'DOUBLE_OR_MINOR', title:'가상 언어학 입문 & 실습', creditUnits:6,
      meetings:[{day:'MON', periods:[3, 4], room:'0303'}, {day:'WED', periods:[3], room:'0303'}],
      noteHints:{prerequisite:true, cohort:false, restriction:true, equivalent:false},
    });
    expect(result.issues.map(issue => [issue.row, issue.code])).toEqual([[1, 'NOTE_NEEDS_REVIEW'], [3, 'NOTE_NEEDS_REVIEW']]);
  });

  it('applies one room to every day listed before it', () => {
    const shared = importWisTimetable(request(page([
      {code:'SYN090101', title:'가상 A', time:'화 5 6 목 6 (0309)'},
      {code:'SYN090201', title:'가상 B', time:'월 1 2 (0101) 수 3 4 금 5 (0202)'},
      {code:'SYN090301', title:'가상 C', time:'화 5 6 (0309) 목 6'},
      {code:'SYN090401', title:'가상 D', time:'(0309) 화 5 6'},
    ])));
    expect(shared.rows.map(row => row.meetings)).toEqual([
      [{day:'TUE', periods:[5, 6], room:'0309'}, {day:'THU', periods:[6], room:'0309'}],
      [{day:'MON', periods:[1, 2], room:'0101'}, {day:'WED', periods:[3, 4], room:'0202'}, {day:'FRI', periods:[5], room:'0202'}],
      [],
      [],
    ]);
    expect(shared.issues.map(issue => [issue.row, issue.code])).toEqual([[3, 'BAD_MEETINGS'], [4, 'BAD_MEETINGS']]);
  });

  it('keeps no instructor name or enrollment count', () => {
    const text = JSON.stringify(importWisTimetable(request(page(ROWS))));
    expect(text).not.toMatch(/가상 교수|10 \/ 30/);
  });

  it('splits course and section only after the code format is reviewed', () => {
    const before = importWisTimetable(request(page(ROWS)));
    expect(before.codeFormat).toEqual({reviewed:false, consistentWithCourse7Section2:true});
    expect(before.rows.every(row => row.code.status === 'NEEDS_REVIEW')).toBe(true);
    const after = importWisTimetable(request(page(ROWS), {codeFormatReviewed:true}));
    expect(after.rows.map(row => row.code)).toEqual([
      {status:'RESOLVED', canonicalCourseId:'SYN0101', sectionId:'01'},
      {status:'RESOLVED', canonicalCourseId:'SYN0101', sectionId:'02'},
      {status:'RESOLVED', canonicalCourseId:'SYN0201', sectionId:'01'},
    ]);
    const clash = importWisTimetable(request(page([...ROWS, {code:'SYN010103', title:'다른 가상 과목'}])));
    expect(clash.codeFormat.consistentWithCourse7Section2).toBe(false);
  });

  it('reads the term from the page and refuses a file name that disagrees', () => {
    expect(importWisTimetable(request(page(ROWS), {fileName:'SYNDEPT.html'})).term.academicTerm).toBe('2026-2');
    expect(() => importWisTimetable(request(page(ROWS), {fileName:'SYNDEPT_2026-1_강의시간표.html'}))).toThrow(/file name says 2026-1/);
    expect(() => importWisTimetable(request(page([...ROWS, {code:'SYN030101', title:'가상', sessn:'1'}]))))
      .toThrow(/more than one year and session/);
    const summer = importWisTimetable(request(page(ROWS.map(row => ({...row, sessn:'2'}))), {fileName:'SYNDEPT_2026-S.html'}));
    expect(summer.term).toEqual({year:2026, session:'SUMMER'});
  });

  it('refuses a page not saved from the timetable lookup or with a changed layout', () => {
    expect(() => importWisTimetable(request(page(ROWS, {saved:''})))).toThrow(/saved from url/);
    expect(() => importWisTimetable(request(page(ROWS, {saved:'<!-- saved from url=(0030)https://example.test/x.jsp -->'})))).toThrow(/not saved from/);
    const moved = [...HEADER];
    [moved[8], moved[9]] = [moved[9]!, moved[8]!];
    expect(() => importWisTimetable(request(page(ROWS, {header:moved})))).toThrow(/refusing to guess columns/);
  });

  it('flags cells it cannot read instead of dropping the row', () => {
    const odd = importWisTimetable(request(page([
      {code:'SYN-BAD', title:'가상 A', credits:'세 학점', time:'추후공지', area:'교양', attrs:['원격']},  // class attr--x
      {no:5, code:'SYN040101', title:'가상 B', time:''},
    ])));
    expect(odd.rows).toHaveLength(2);
    expect(odd.rows[0]).toMatchObject({creditUnits:null, meetings:[], area:'OTHER', otherAttributes:['원격'], needsReview:true});
    expect(odd.rows[1]).toMatchObject({meetings:[], needsReview:true});
    expect(odd.issues.map(issue => [issue.row, issue.code])).toEqual([
      [1, 'BAD_CODE'], [1, 'BAD_CREDITS'], [1, 'BAD_MEETINGS'], [1, 'UNKNOWN_AREA'], [1, 'UNKNOWN_ATTRIBUTE'], [5, 'ROW_NUMBER_GAP'],
    ]);
  });

  it('reports an empty page without inventing rows', () => {
    const empty = importWisTimetable(request(page([])));
    expect(empty).toMatchObject({rows:[], term:{year:2026, session:'2', academicTerm:'2026-2'}, issues:[{code:'NO_ROWS'}]});
    expect(() => importWisTimetable(request(page([]), {fileName:'SYNDEPT.html'}))).toThrow(/names no term/);
  });

  it('refuses an empty table saved while the card list still shows courses', () => {
    const cards = `<div class="sch-card"><a href="javascript:lecture_open('2026','3','A','SYN010101')">▤</a></div>`;
    const half = page([]).replace('</body>', `${cards}</body>`);
    expect(() => importWisTimetable(request(half))).toThrow(/save the page again/);
  });

  it('refuses a data row with missing cells instead of dropping it', () => {
    expect(() => importWisTimetable(request(page([...ROWS, {code:'SYN090101', title:'가상 마지막', dropLastCell:true}]))))
      .toThrow(/row 4 has 12 cells/);
  });

  it('refuses a table that lists fewer courses than its card list', () => {
    expect(() => importWisTimetable(request(page(ROWS.slice(0, 2), {cards:ROWS})))).toThrow(/1 course\(s\) missing from the table/);
    // A last row that lost its number cell is not a data row, so the card list is what catches it.
    expect(() => importWisTimetable(request(page([...ROWS, {code:'SYN090101', title:'가상 마지막', dropNumberCell:true}]))))
      .toThrow(/table and card list disagree/);
    expect(() => importWisTimetable(request(page(ROWS, {cards:ROWS.slice(0, 2)})))).toThrow(/1 only in the table/);
  });

  it('keeps a course without a syllabus but marks its term as taken from the page', () => {
    const result = importWisTimetable(request(page([...ROWS, {code:'SYN090101', title:'가상 무계획서', syllabus:'NONE'}])));
    expect(result.rows[3]).toMatchObject({rawCode:'SYN090101', termEvidence:'PAGE_ONLY', needsReview:true});
    expect(result.rows.slice(0, 3).every(row => row.termEvidence === 'ROW_LINK')).toBe(true);
    expect(result.issues.filter(issue => issue.code === 'TERM_FROM_PAGE').map(issue => issue.row)).toEqual([4]);
    expect(() => importWisTimetable(request(page(ROWS.map(row => ({...row, syllabus:'NONE' as const}))))))
      .toThrow(/no year and session/);
  });

  it('refuses a syllabus cell it cannot read or a link for another course', () => {
    expect(() => importWisTimetable(request(page([...ROWS, {code:'SYN090101', title:'가상', syllabus:'TEXT'}]))))
      .toThrow(/without a readable term link/);
    expect(() => importWisTimetable(request(page([...ROWS, {code:'SYN090101', title:'가상', linkCode:'SYN010101'}]))))
      .toThrow(/row 4 has a link that does not name its own course code/);
    expect(() => importWisTimetable(request(page([...ROWS, {code:'SYN090101', title:'가상', titleLinkCode:'SYN010101'}]))))
      .toThrow(/row 4 has a link that does not name its own course code/);
  });

  it('refuses a card list left over from another term', () => {
    const stale = ROWS.map(row => ({...row, year:'2026', sessn:'1'}));
    expect(() => importWisTimetable(request(page(ROWS, {cards:stale})))).toThrow(/more than one year and session/);
  });
});
