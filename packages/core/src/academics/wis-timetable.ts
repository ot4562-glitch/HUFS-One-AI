import {resolveAcademicCourseCodeVNext} from '@hufs-one/contracts';
import type {Weekday} from './plan.js';

/**
 * wis-timetable (#133): reads one HUFS course timetable page that a person saved from the
 * public 강의시간표 lookup (wis.hufs.ac.kr LECTURE2020L.jsp) with the browser's "save page".
 * That host disallows all crawlers in robots.txt, so this only converts pages a person saved;
 * it never fetches anything.
 *
 * Output is one row per listed section with the facts the page states. It keeps the raw code,
 * leaves course/section splitting to resolveAcademicCourseCodeVNext (NEEDS_REVIEW until the code
 * format is confirmed), keeps class periods as numbers because the page gives no clock times,
 * and keeps the notes column raw for review. Instructor names and enrollment counts are dropped.
 * Pure: the caller supplies the file text, file name, and saved time. No clock, network, or storage.
 */

export const WIS_TIMETABLE_PATH = '/src08/jsp/lecture/LECTURE2020L.jsp';
const WIS_HOST = 'wis.hufs.ac.kr';

/** Header cells in page order; a changed layout is refused rather than guessed. */
const EXPECTED_HEADER = [
  'No.', '개설영역', '학년', '학수번호', '교과목명', '강의계획서', '속성 Attributes', '담당교수',
  '학점', '시간', '강의시간/ 강의실', '수강인원/ 제한인원', '사전수강신청/관심강좌신청 (Course Wishlist)', '비고',
] as const;
/** Data rows carry no wishlist cell, so they have one cell fewer than the header. */
const ROW_CELLS = 13;
const COL = {no:0, area:1, grade:2, code:3, title:4, syllabus:5, attrs:6, credits:8, hours:9, meetings:10, note:12} as const;

const DAYS:Readonly<Record<string, Weekday>> = {월:'MON', 화:'TUE', 수:'WED', 목:'THU', 금:'FRI', 토:'SAT', 일:'SUN'};
/** ag_ledg_sessn values on the lookup form. */
const SESSIONS:Readonly<Record<string, TimetableSession>> = {'1':'1', '2':'SUMMER', '3':'2', '4':'WINTER'};
const AREAS:Readonly<Record<string, TimetableArea>> = {'전공':'MAJOR', '이중(부)전공':'DOUBLE_OR_MINOR'};
/**
 * Attribute chips by their CSS modifier, which is the same on the Korean and English tabs.
 * The page script labels the attr--eng chip with the course's language code (ENG, FRE, ...)
 * and with "F" when no language is recorded, so that chip means taught in a foreign language.
 */
const ATTRIBUTE_CLASSES:Readonly<Record<string, TimetableAttribute>> = {
  req:'REQUIRED', eng:'FOREIGN_LANGUAGE', team:'TEAM_TEACHING', online:'ONLINE', pf:'PASS_FAIL',
};
const UNSTATED_LANGUAGE = 'F';

export type TimetableSession = '1'|'SUMMER'|'2'|'WINTER';
export type TimetableArea = 'MAJOR'|'DOUBLE_OR_MINOR'|'OTHER';
export type TimetableAttribute = 'REQUIRED'|'FOREIGN_LANGUAGE'|'TEAM_TEACHING'|'ONLINE'|'PASS_FAIL';

export interface TimetableMeeting {
  day:Weekday;
  /** Class periods (교시) as listed. The page states no clock times for them. */
  periods:number[];
  room:string;
}

export interface TimetableRow {
  no:number;
  area:TimetableArea;
  areaLabel:string;
  gradeYear:number|null;
  rawCode:string;
  code:ReturnType<typeof resolveAcademicCourseCodeVNext>;
  title:string;
  attributes:TimetableAttribute[];
  /** Language code on the foreign-language chip (ENG, FRE, ...); null when none is recorded. */
  instructionLanguage:string|null;
  /** Labels of attribute chips with a CSS class this converter does not know, kept for review. */
  otherAttributes:string[];
  /** 1 unit = 0.5학점; null when the cell is not a whole or half credit. */
  creditUnits:number|null;
  hours:number|null;
  meetings:TimetableMeeting[];
  /** 비고 as written. Prerequisite, 학번, and restriction text is never applied as a rule. */
  note:string;
  /** equivalent: the note names a same or substitute course (동일과목, 대체), e.g. after a curriculum change. */
  noteHints:{prerequisite:boolean; cohort:boolean; restriction:boolean; equivalent:boolean};
  needsReview:boolean;
}

export interface TimetableIssue {
  row?:number;
  code:'NO_ROWS'|'ROW_NUMBER_GAP'|'BAD_CODE'|'BAD_GRADE'|'BAD_CREDITS'|'BAD_HOURS'|'BAD_MEETINGS'|'UNKNOWN_AREA'|'UNKNOWN_ATTRIBUTE'|'NOTE_NEEDS_REVIEW';
  detail:string;
}

export interface TimetableImport {
  source:{system:'HUFS_WIS_LECTURE_TIMETABLE'; savedFromUrl:string; fileName:string; savedAt:string};
  term:{year:number; session:TimetableSession; academicTerm?:string};
  /** Taken from the file name or the caller, not from the page: a saved page does not record it. */
  departmentLabel:string;
  /** One department page is not the whole term catalog. */
  coverage:'ONE_DEPARTMENT_PAGE';
  codeFormat:{reviewed:boolean; consistentWithCourse7Section2:boolean};
  rows:TimetableRow[];
  issues:TimetableIssue[];
}

export interface TimetableImportRequest {
  html:string;
  fileName:string;
  /** When the person saved the page, e.g. the file's modified time. */
  savedAt:string;
  /** Overrides the file name's leading token, e.g. "DEPT" in "DEPT_2026-2_강의시간표.html". */
  departmentLabel?:string;
  /** Set only after a person has confirmed the 7-character course + 2-digit section format. */
  codeFormatReviewed?:boolean;
}

const ENTITIES:Readonly<Record<string, string>> = {amp:'&', lt:'<', gt:'>', quot:'"', apos:'\'', nbsp:' ', '#39':'\''};

function decode(text:string):string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name:string) => {
    if (name in ENTITIES) return ENTITIES[name]!;
    if (/^#x/i.test(name)) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
    return whole;
  });
}

const cellText = (cell:string):string => decode(cell.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const cells = (row:string, tag:'td'|'th'):string[] =>
  [...row.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'))].map(match => match[1]!);

function savedFromUrl(html:string):string {
  const match = /<!--\s*saved from url=\(\d+\)(\S+)\s*-->/i.exec(html);
  if (!match) throw new TypeError('not a browser-saved page: no "saved from url" comment');
  const url = new URL(match[1]!);
  if (url.protocol !== 'https:' || url.hostname !== WIS_HOST || url.pathname !== WIS_TIMETABLE_PATH) {
    throw new TypeError(`page was not saved from https://${WIS_HOST}${WIS_TIMETABLE_PATH}`);
  }
  return `${url.origin}${url.pathname}`;
}

/** The syllabus links carry the queried year and session; every row must agree. */
function pageTerm(rows:readonly string[][]):{year:number; session:TimetableSession} {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const match of row[COL.syllabus]!.matchAll(/lecture_open\('(\d{4})','(\d)'/g)) seen.add(`${match[1]}:${match[2]}`);
  }
  if (seen.size !== 1) throw new TypeError(`page rows name ${seen.size === 0 ? 'no' : 'more than one'} year and session`);
  const [year, code] = [...seen][0]!.split(':') as [string, string];
  const session = SESSIONS[code];
  if (!session) throw new TypeError(`unknown session code ${code}`);
  return {year:Number(year), session};
}

function fileTerm(fileName:string):string|undefined {
  return /(?:^|[_\s-])((?:19|20|21)\d{2}-(?:1|2|S|W))(?=[_.\s]|$)/.exec(fileName)?.[1];
}

/**
 * "수 1 2 (1310)" or several days before one room, "화 5 6 목 6 (C309)": a room applies to every
 * day listed since the previous room. A day left without a room, or any leftover text, is unreadable.
 */
function meetings(text:string):TimetableMeeting[]|null {
  if (text === '') return [];
  const found:TimetableMeeting[] = [];
  let pending:{day:Weekday; periods:number[]}[] = [];
  let consumed = '';
  for (const match of text.matchAll(/([월화수목금토일])((?:\s+\d{1,2})+)|\(([^)]*)\)/g)) {
    consumed += match[0];
    if (match[1] !== undefined) {
      pending.push({day:DAYS[match[1]]!, periods:match[2]!.trim().split(/\s+/).map(Number)});
      continue;
    }
    if (pending.length === 0) return null;
    for (const group of pending) found.push({...group, room:match[3]!.trim()});
    pending = [];
  }
  if (pending.length > 0) return null;
  return consumed.replace(/\s+/g, '') === text.replace(/\s+/g, '') ? found : null;
}

function units(text:string):number|null {
  if (!/^\d{1,2}(\.5)?$/.test(text)) return null;
  return Number(text) * 2;
}

export function importWisTimetable(input:TimetableImportRequest):TimetableImport {
  if (!Number.isFinite(Date.parse(input.savedAt))) throw new TypeError('savedAt must be a datetime');
  const html = input.html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const url = savedFromUrl(input.html);

  const rowsHtml = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => match[1]!);
  const header = rowsHtml.map(row => cells(row, 'th').map(cellText)).find(row => row.includes('학수번호'));
  if (!header || header.length !== EXPECTED_HEADER.length || header.some((label, i) => label !== EXPECTED_HEADER[i])) {
    throw new TypeError('timetable header differs from the known layout; refusing to guess columns');
  }
  const raw = rowsHtml.map(row => cells(row, 'td')).filter(row => row.length === ROW_CELLS && /^\d+$/.test(cellText(row[COL.no]!)));

  const issues:TimetableIssue[] = [];
  const departmentLabel = input.departmentLabel ?? input.fileName.split(/[_\s]/)[0]!;
  if (!/^[A-Za-z0-9가-힣&().-]{1,40}$/.test(departmentLabel)) throw new TypeError('department label is missing or malformed');

  if (raw.length === 0) {
    // The page also draws a card list. An empty table next to course links means the table was
    // saved before it finished drawing; reporting NO_ROWS would read as "nothing offered".
    const elsewhere = [...html.matchAll(/lecture_open\(/g)].length;
    if (elsewhere > 0) {
      throw new TypeError(`the table is empty but the page links ${elsewhere} courses elsewhere; save the page again once the table shows them`);
    }
    const term = fileTerm(input.fileName);
    if (!term) throw new TypeError('page lists no rows and the file name names no term');
    issues.push({code:'NO_ROWS', detail:'the saved page lists no courses'});
    const [year, session] = term.split('-') as [string, string];
    const mapped:TimetableSession = session === 'S' ? 'SUMMER' : session === 'W' ? 'WINTER' : session as '1'|'2';
    return result(url, input, {year:Number(year), session:mapped}, departmentLabel, [], issues);
  }

  const term = pageTerm(raw);
  const named = fileTerm(input.fileName);
  const pageLabel = `${term.year}-${term.session === 'SUMMER' ? 'S' : term.session === 'WINTER' ? 'W' : term.session}`;
  if (named !== undefined && named !== pageLabel) throw new TypeError(`file name says ${named} but the page lists ${pageLabel}`);

  const rows = raw.map((row, index):TimetableRow => {
    const text = row.map(cellText);
    const no = Number(text[COL.no]);
    const flag = (code:TimetableIssue['code'], detail:string) => issues.push({row:no, code, detail});
    if (no !== index + 1) flag('ROW_NUMBER_GAP', `row ${index + 1} is numbered ${no}`);

    const rawCode = text[COL.code]!.toUpperCase();
    if (!/^[A-Z0-9]{9}$/.test(rawCode)) flag('BAD_CODE', `course code "${text[COL.code]}"`);
    const gradeYear = /^[1-6]$/.test(text[COL.grade]!) ? Number(text[COL.grade]) : null;
    if (gradeYear === null) flag('BAD_GRADE', `grade "${text[COL.grade]}"`);
    const creditUnits = units(text[COL.credits]!);
    if (creditUnits === null) flag('BAD_CREDITS', `credits "${text[COL.credits]}"`);
    const hours = /^\d{1,2}$/.test(text[COL.hours]!) ? Number(text[COL.hours]) : null;
    if (hours === null) flag('BAD_HOURS', `hours "${text[COL.hours]}"`);
    const parsedMeetings = meetings(text[COL.meetings]!);
    if (parsedMeetings === null) flag('BAD_MEETINGS', `times "${text[COL.meetings]}"`);

    const areaLabel = text[COL.area]!;
    const area = AREAS[areaLabel] ?? 'OTHER';
    if (area === 'OTHER') flag('UNKNOWN_AREA', `area "${areaLabel}"`);

    // Only spans whose class list has the exact token "attr"; "attr-none" holds the empty-cell dash.
    const chips = [...row[COL.attrs]!.matchAll(/<span\b[^>]*class="((?:[^"]*\s)?attr(?:\s[^"]*)?)"[^>]*>([\s\S]*?)<\/span>/gi)]
      .map(match => ({kind:/\battr--([a-z]+)\b/.exec(match[1]!)?.[1] ?? '', label:cellText(match[2]!)}));
    const attributes:TimetableAttribute[] = [];
    const otherAttributes:string[] = [];
    let instructionLanguage:string|null = null;
    for (const chip of chips) {
      const attribute = ATTRIBUTE_CLASSES[chip.kind];
      if (!attribute) {
        otherAttributes.push(chip.label);
        continue;
      }
      attributes.push(attribute);
      if (attribute === 'FOREIGN_LANGUAGE' && chip.label !== UNSTATED_LANGUAGE) instructionLanguage = chip.label;
    }
    if (otherAttributes.length > 0) flag('UNKNOWN_ATTRIBUTE', `attributes ${otherAttributes.join(', ')}`);

    const note = text[COL.note]!;
    const noteHints = {
      // "우선수강" (priority enrollment) also contains 선수, so it is excluded.
      prerequisite:/(?<!우)선수/.test(note),
      cohort:/\d{2}\s*학번/.test(note),
      restriction:/금지|불가|제한/.test(note),
      equivalent:/동일\s*과목|대체/.test(note),
    };
    if (noteHints.prerequisite || noteHints.cohort || noteHints.equivalent) {
      flag('NOTE_NEEDS_REVIEW', 'note states a prerequisite, 학번, or equivalent-course rule');
    }

    return {
      no, area, areaLabel, gradeYear, rawCode,
      code:resolveAcademicCourseCodeVNext({rawCode, sourceFormatReviewed:input.codeFormatReviewed === true, approvedFormat:'COURSE_7_SECTION_2'}),
      title:text[COL.title]!,
      attributes:[...new Set(attributes)],
      instructionLanguage,
      otherAttributes,
      creditUnits, hours,
      meetings:parsedMeetings ?? [],
      note, noteHints,
      needsReview:issues.some(issue => issue.row === no && issue.code !== 'NOTE_NEEDS_REVIEW'),
    };
  });
  return result(url, input, term, departmentLabel, rows, issues);
}

function result(
  savedFrom:string, input:TimetableImportRequest, term:{year:number; session:TimetableSession},
  departmentLabel:string, rows:TimetableRow[], issues:TimetableIssue[],
):TimetableImport {
  // A hint for the person reviewing the code format, never applied by itself.
  const titles = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = titles.get(row.rawCode.slice(0, 7)) ?? new Set<string>();
    set.add(row.title);
    titles.set(row.rawCode.slice(0, 7), set);
  }
  const consistent = rows.length > 0 && rows.every(row => /^[A-Z0-9]{7}\d{2}$/.test(row.rawCode))
    && [...titles.values()].every(set => set.size === 1);
  return {
    source:{system:'HUFS_WIS_LECTURE_TIMETABLE', savedFromUrl:savedFrom, fileName:input.fileName, savedAt:input.savedAt},
    term:{...term, ...(term.session === '1' || term.session === '2' ? {academicTerm:`${term.year}-${term.session}`} : {})},
    departmentLabel,
    coverage:'ONE_DEPARTMENT_PAGE',
    codeFormat:{reviewed:input.codeFormatReviewed === true, consistentWithCourse7Section2:consistent},
    rows,
    issues,
  };
}
