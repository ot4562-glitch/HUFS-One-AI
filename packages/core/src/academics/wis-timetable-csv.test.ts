import {describe, expect, it} from 'vitest';
import type {TimetableImport, TimetableRow} from './wis-timetable.js';
import {SAVED_CURRICULUM_CSV_HEADERS, toSavedCurriculumCsv} from './wis-timetable-csv.js';

/** Synthetic only: made-up codes, titles, and department label. */
const row = (no:number, over:Partial<TimetableRow> = {}):TimetableRow => ({
  no, area:'MAJOR', areaLabel:'전공', gradeYear:2, rawCode:`SYN0${no}0101`, code:{status:'NEEDS_REVIEW'}, title:`가상 과목 ${no}`,
  attributes:[], instructionLanguage:null, otherAttributes:[], creditUnits:6, hours:3,
  meetings:[{day:'MON', periods:[1, 2], room:'0101'}], note:'',
  noteHints:{prerequisite:false, cohort:false, restriction:false, equivalent:false}, termEvidence:'ROW_LINK', needsReview:false, ...over,
});
const page = (rows:TimetableRow[], over:Partial<TimetableImport> = {}):TimetableImport => ({
  source:{system:'HUFS_WIS_LECTURE_TIMETABLE', savedFromUrl:'https://wis.hufs.ac.kr/src08/jsp/lecture/LECTURE2020L.jsp',
    fileName:'SYNDEPT_2026-2_강의시간표.html', savedAt:'2026-11-02T09:47:00.000Z'},
  term:{year:2026, session:'2', academicTerm:'2026-2'}, departmentLabel:'SYNDEPT', campus:'UNKNOWN', coverage:'ONE_DEPARTMENT_PAGE',
  codeFormat:{reviewed:false, consistentWithCourse7Section2:true}, rows, issues:[], ...over,
});

describe('toSavedCurriculumCsv', () => {
  it('writes one line per section in the import header order, with 개설영역 as written', () => {
    const out = toSavedCurriculumCsv(page([
      row(1, {attributes:['REQUIRED', 'FOREIGN_LANGUAGE'], instructionLanguage:'ENG', note:'21학번부터 전필',
        noteHints:{prerequisite:false, cohort:true, restriction:false, equivalent:false}}),
      row(2, {areaLabel:'이중(부)전공', area:'DOUBLE_OR_MINOR', creditUnits:3}),
    ]));
    expect(out.csv.split('\n')).toEqual([
      SAVED_CURRICULUM_CSV_HEADERS.join(','),
      'SYN010101,가상 과목 1,3,전공,SYNDEPT,2026-2,UNKNOWN,UNKNOWN',
      'SYN020101,가상 과목 2,1.5,이중(부)전공,SYNDEPT,2026-2,UNKNOWN,UNKNOWN',
      '',
    ]);
    expect(out).toMatchObject({rows:2, campus:'UNKNOWN', withheld:[]});
    // 이수구분 and notes travel beside the CSV, one entry per exported line.
    expect(out.details).toEqual([
      {rawCode:'SYN010101', completion:'REQUIRED', attributes:['REQUIRED', 'FOREIGN_LANGUAGE'], instructionLanguage:'ENG',
        note:'21학번부터 전필', noteHints:{prerequisite:false, cohort:true, restriction:false, equivalent:false}},
      {rawCode:'SYN020101', completion:'NOT_STATED', attributes:[], instructionLanguage:null, note:'',
        noteHints:{prerequisite:false, cohort:false, restriction:false, equivalent:false}},
    ]);
  });

  it('takes the campus the page shows and refuses a stated campus that disagrees', () => {
    const seoul = page([row(1)], {campus:'SEOUL'});
    expect(toSavedCurriculumCsv(seoul).csv.split('\n')[1]).toBe('SYN010101,가상 과목 1,3,전공,SYNDEPT,2026-2,SEOUL,UNKNOWN');
    expect(toSavedCurriculumCsv(seoul, {campus:'SEOUL'}).campus).toBe('SEOUL');
    expect(() => toSavedCurriculumCsv(seoul, {campus:'GLOBAL'})).toThrow(/does not match the page/);
  });

  it('never turns an UNKNOWN page campus into a stated campus', () => {
    const unknown = page([row(1)]);
    for (const campus of ['SEOUL', 'GLOBAL', '서울', 'anything']) {
      expect(() => toSavedCurriculumCsv(unknown, {campus})).toThrow(/does not match the page, which shows UNKNOWN/);
    }
    expect(toSavedCurriculumCsv(unknown, {campus:'UNKNOWN'}).csv.split('\n')[1]).toBe('SYN010101,가상 과목 1,3,전공,SYNDEPT,2026-2,UNKNOWN,UNKNOWN');
  });

  it('quotes cells with commas or quotes', () => {
    const out = toSavedCurriculumCsv(page([row(1, {title:'가상 "입문", 실습'})], {campus:'SEOUL'}));
    expect(out.csv.split('\n')[1]).toBe('SYN010101,"가상 ""입문"", 실습",3,전공,SYNDEPT,2026-2,SEOUL,UNKNOWN');
  });

  it('withholds rows the CSV cannot mark for review instead of sending them as clean', () => {
    const out = toSavedCurriculumCsv(page([
      row(1),
      row(2, {termEvidence:'PAGE_ONLY', needsReview:true}),
      row(3, {needsReview:true}),
      row(4, {creditUnits:null, needsReview:true}),
      row(5, {title:'=가상'}),
      row(6, {rawCode:'SYN BAD'}),
    ]));
    expect(out.rows).toBe(1);
    expect(out.details.map(detail => detail.rawCode)).toEqual(['SYN010101']);
    expect(out.withheld).toEqual([
      {no:2, rawCode:'SYN020101', reason:'TERM_FROM_PAGE'},
      {no:3, rawCode:'SYN030101', reason:'NEEDS_REVIEW'},
      {no:4, rawCode:'SYN040101', reason:'NEEDS_REVIEW'},
      {no:5, rawCode:'SYN050101', reason:'CELL_NOT_ACCEPTED'},
      {no:6, rawCode:'SYN BAD', reason:'CELL_NOT_ACCEPTED'},
    ]);
  });

  it('withholds a whole season-term page, which the import cannot label', () => {
    const out = toSavedCurriculumCsv(page([row(1), row(2)], {term:{year:2026, session:'SUMMER'}}));
    expect(out).toMatchObject({rows:0, withheld:[{no:1, reason:'NOT_A_REGULAR_TERM'}, {no:2, reason:'NOT_A_REGULAR_TERM'}]});
  });

  it('refuses a campus or department label the import would reject', () => {
    expect(() => toSavedCurriculumCsv(page([row(1)]), {campus:''})).toThrow(/campus/);
    expect(() => toSavedCurriculumCsv(page([row(1)], {departmentLabel:'+DEPT'}))).toThrow(/department label/);
  });
});
