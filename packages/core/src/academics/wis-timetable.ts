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
export type TimetableCampus = 'SEOUL'|'GLOBAL'|'UNKNOWN';
/** BASIC: a 기초 row whose 개설영역 is one of the 기초 fields the page's own 기초 list names. */
export type TimetableArea = 'MAJOR'|'DOUBLE_OR_MINOR'|'BASIC'|'OTHER';
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
  /** null when unreadable (BAD_GRADE), or when a BASIC row leaves it blank: 기초 rows state no 학년. */
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
  /**
   * ROW_LINK: the row's own syllabus link names the term. PAGE_ONLY: the course has no syllabus,
   * so its cell is empty and only the other rows of the same saved page name the term.
   */
  termEvidence:'ROW_LINK'|'PAGE_ONLY';
  needsReview:boolean;
}

export interface TimetableIssue {
  row?:number;
  code:'NO_ROWS'|'ROW_NUMBER_GAP'|'BAD_CODE'|'BAD_GRADE'|'BAD_CREDITS'|'BAD_HOURS'|'BAD_MEETINGS'|'UNKNOWN_AREA'|'UNKNOWN_ATTRIBUTE'|'NOTE_NEEDS_REVIEW'|'TERM_FROM_PAGE';
  detail:string;
}

export interface TimetableImport {
  source:{system:'HUFS_WIS_LECTURE_TIMETABLE'; savedFromUrl:string; fileName:string; savedAt:string};
  term:{year:number; session:TimetableSession; academicTerm?:string};
  /** Taken from the file name or the caller, not from the page: a saved page does not record it. */
  departmentLabel:string;
  /**
   * Read from the page: the checked 캠퍼스 radio and the department list it loads must agree
   * (H1 with every option "(서울) - …", H2 with every option "(글로벌) - …"); otherwise UNKNOWN.
   */
  campus:TimetableCampus;
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

/**
 * Cut every script block or HTML comment out of the saved page before its text is read as table
 * rows. This is not an HTML sanitizer (nothing here is rendered as HTML); it keeps script source
 * and commented-out markup from being parsed as rows. Matching is case-insensitive, a closing tag
 * may carry spaces or attributes (`</script >`), and in script mode a "<script" inside an HTML
 * comment is left alone with its comment. A "<script" or "<!--" with no closing tag after it is kept
 * as it is, as the earlier regex did: it may be plain text or an attribute value
 * (`title="<script"`), and cutting to the end of the page would drop the table that follows. After
 * each cut the search resumes at the same place, so pieces that meet after a cut ("<scr" + "ipt")
 * are cut as well.
 */
export function withoutBlocks(html:string, kind:'script'|'comment'):string {
  // Only A-Z are lowered, so every index in `lower` is the same index in `out`
  // (String#toLowerCase can change the length, e.g. "İ" becomes two code units).
  const lowerAscii = (s:string) => s.replace(/[A-Z]+/g, letters => letters.toLowerCase());
  let out = html;
  let from = 0;
  // Text before `floor` is a comment kept in script mode; never search back into it.
  let floor = 0;
  for (;;) {
    const lower = lowerAscii(out);
    let start:number;
    let end:number;
    if (kind === 'comment') {
      start = lower.indexOf('<!--', from);
      if (start < 0) return out;
      const close = lower.indexOf('-->', start + 4);
      if (close < 0) return out;
      end = close + 3;
    } else {
      start = lower.indexOf('<script', from);
      if (start < 0) return out;
      // A "<script" written inside an HTML comment is not a tag: keep the comment, skip past it.
      const comment = lower.indexOf('<!--', from);
      if (comment >= 0 && comment < start) {
        const close = lower.indexOf('-->', comment + 4);
        if (close < 0) return out;
        from = floor = close + 3;
        continue;
      }
      if (/[a-z0-9_-]/.test(lower.charAt(start + 7))) { from = start + 1; continue; }
      let close = lower.indexOf('</script', start + 7);
      while (close >= 0 && /[a-z0-9_-]/.test(lower.charAt(close + 8))) close = lower.indexOf('</script', close + 1);
      const gt = close < 0 ? -1 : lower.indexOf('>', close + 8);
      if (gt < 0) return out;
      end = gt + 1;
    }
    out = out.slice(0, start) + out.slice(end);
    from = Math.max(floor, start - 8);
  }
}

function savedFromUrl(html:string):string {
  const match = /<!--\s*saved from url=\(\d+\)(\S+)\s*-->/i.exec(html);
  if (!match) throw new TypeError('not a browser-saved page: no "saved from url" comment');
  const url = new URL(match[1]!);
  if (url.protocol !== 'https:' || url.hostname !== WIS_HOST || url.pathname !== WIS_TIMETABLE_PATH) {
    throw new TypeError(`page was not saved from https://${WIS_HOST}${WIS_TIMETABLE_PATH}`);
  }
  return `${url.origin}${url.pathname}`;
}

const LINK = /lecture_open\('(\d{4})','(\d)','[A-Z]','([^']*)'\)/g;

/**
 * Each row's syllabus cell holds one link naming the queried year, session, and the row's own
 * code, or is empty when the course has no syllabus. Any other content means the layout changed.
 * Every link on the page, card list included, must name the same term.
 */
function pageTerm(rows:readonly string[][], html:string):{year:number; session:TimetableSession; linkless:Set<number>} {
  const linkless = new Set<number>();
  rows.forEach((row, index) => {
    const no = cellText(row[COL.no]!);
    // The title cell links the same course too; any link in the row must name the row's own code.
    const own = cellText(row[COL.code]!).toUpperCase();
    if (row.some(cell => [...cell.matchAll(LINK)].some(match => match[3]!.toUpperCase() !== own))) {
      throw new TypeError(`row ${no} has a link that does not name its own course code`);
    }
    const links = [...row[COL.syllabus]!.matchAll(LINK)];
    if (links.length === 0) {
      if (cellText(row[COL.syllabus]!) !== '') throw new TypeError(`row ${no} has a syllabus cell without a readable term link`);
      linkless.add(index);
      return;
    }
    if (links.length > 1 || links[0]![3]!.toUpperCase() !== cellText(row[COL.code]!).toUpperCase()) {
      throw new TypeError(`row ${no} syllabus link does not name its own course code`);
    }
  });
  const seen = new Set([...html.matchAll(LINK)].map(match => `${match[1]}:${match[2]}`));
  if (seen.size !== 1) throw new TypeError(`page links name ${seen.size === 0 ? 'no' : 'more than one'} year and session`);
  const [year, code] = [...seen][0]!.split(':') as [string, string];
  const session = SESSIONS[code];
  if (!session) throw new TypeError(`unknown session code ${code}`);
  return {year:Number(year), session, linkless};
}

/** Course codes in the card list, which the page draws once per table row. */
function cardCodes(html:string):string[] {
  return [...html.matchAll(/<div\b[^>]*class="sch-card-code"[^>]*>([\s\S]*?)<\/div>/gi)]
    .map(match => cellText(match[1]!).split('·')[0]!.trim().toUpperCase());
}

/** The table must list exactly the courses the card list shows, so a dropped row cannot go unnoticed. */
function assertComplete(rows:readonly string[][], html:string):void {
  const count = (codes:readonly string[]) => {
    const map = new Map<string, number>();
    for (const code of codes) map.set(code, (map.get(code) ?? 0) + 1);
    return map;
  };
  const table = count(rows.map(row => cellText(row[COL.code]!).toUpperCase()));
  const cards = count(cardCodes(html));
  const missing = [...cards].filter(([code, n]) => (table.get(code) ?? 0) < n).map(([code]) => code);
  const extra = [...table].filter(([code, n]) => (cards.get(code) ?? 0) < n).map(([code]) => code);
  if (missing.length > 0 || extra.length > 0) {
    throw new TypeError(`table and card list disagree (${missing.length} course(s) missing from the table, `
      + `${extra.length} only in the table); save the page again`);
  }
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
  const html = withoutBlocks(input.html, 'script');
  const url = savedFromUrl(input.html);

  const rowsHtml = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => match[1]!);
  const header = rowsHtml.map(row => cells(row, 'th').map(cellText)).find(row => row.includes('학수번호'));
  if (!header || header.length !== EXPECTED_HEADER.length || header.some((label, i) => label !== EXPECTED_HEADER[i])) {
    throw new TypeError('timetable header differs from the known layout; refusing to guess columns');
  }
  // A data row starts with its number. One with the wrong number of cells is refused, not skipped.
  const raw = rowsHtml.map(row => cells(row, 'td')).filter(row => row.length > 0 && /^\d+$/.test(cellText(row[0]!)));
  for (const row of raw) {
    if (row.length !== ROW_CELLS) throw new TypeError(`row ${cellText(row[0]!)} has ${row.length} cells, not ${ROW_CELLS}; save the page again`);
  }

  const issues:TimetableIssue[] = [];
  const departmentLabel = input.departmentLabel ?? input.fileName.split(/[_\s]/)[0]!;
  if (!/^[A-Za-z0-9가-힣&().-]{1,40}$/.test(departmentLabel)) throw new TypeError('department label is missing or malformed');

  if (raw.length === 0) {
    // The page also draws a card list. An empty table next to course links means the table was
    // saved before it finished drawing; reporting NO_ROWS would read as "nothing offered".
    const elsewhere = Math.max([...html.matchAll(/lecture_open\(/g)].length, cardCodes(html).length);
    if (elsewhere > 0) {
      throw new TypeError(`the table is empty but the page lists ${elsewhere} courses elsewhere; save the page again once the table shows them`);
    }
    const term = fileTerm(input.fileName);
    if (!term) throw new TypeError('page lists no rows and the file name names no term');
    issues.push({code:'NO_ROWS', detail:'the saved page lists no courses'});
    const [year, session] = term.split('-') as [string, string];
    const mapped:TimetableSession = session === 'S' ? 'SUMMER' : session === 'W' ? 'WINTER' : session as '1'|'2';
    return result(url, input, {year:Number(year), session:mapped}, departmentLabel, [], issues);
  }

  assertComplete(raw, html);
  const {linkless, ...term} = pageTerm(raw, html);
  const named = fileTerm(input.fileName);
  const pageLabel = `${term.year}-${term.session === 'SUMMER' ? 'S' : term.session === 'WINTER' ? 'W' : term.session}`;
  if (named !== undefined && named !== pageLabel) throw new TypeError(`file name says ${named} but the page lists ${pageLabel}`);

  const basic = basicFields(html);
  const rows = raw.map((row, index):TimetableRow => {
    const text = row.map(cellText);
    const no = Number(text[COL.no]);
    const flag = (code:TimetableIssue['code'], detail:string) => issues.push({row:no, code, detail});
    if (no !== index + 1) flag('ROW_NUMBER_GAP', `row ${index + 1} is numbered ${no}`);
    const termEvidence = linkless.has(index) ? 'PAGE_ONLY' : 'ROW_LINK';
    if (termEvidence === 'PAGE_ONLY') flag('TERM_FROM_PAGE', 'no syllabus link; the term comes only from the other rows of this page');

    const rawCode = text[COL.code]!.toUpperCase();
    if (!/^[A-Z0-9]{9}$/.test(rawCode)) flag('BAD_CODE', `course code "${text[COL.code]}"`);
    const areaLabel = text[COL.area]!;
    const area = AREAS[areaLabel] ?? (basic.has(areaLabel) ? 'BASIC' : 'OTHER');
    const gradeYear = /^[1-6]$/.test(text[COL.grade]!) ? Number(text[COL.grade]) : null;
    if (gradeYear === null && !(area === 'BASIC' && text[COL.grade] === '')) flag('BAD_GRADE', `grade "${text[COL.grade]}"`);
    const creditUnits = units(text[COL.credits]!);
    if (creditUnits === null) flag('BAD_CREDITS', `credits "${text[COL.credits]}"`);
    const hours = /^\d{1,2}$/.test(text[COL.hours]!) ? Number(text[COL.hours]) : null;
    if (hours === null) flag('BAD_HOURS', `hours "${text[COL.hours]}"`);
    const parsedMeetings = meetings(text[COL.meetings]!);
    if (parsedMeetings === null) flag('BAD_MEETINGS', `times "${text[COL.meetings]}"`);
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
      note, noteHints, termEvidence,
      needsReview:issues.some(issue => issue.row === no && issue.code !== 'NOTE_NEEDS_REVIEW'),
    };
  });
  return result(url, input, term, departmentLabel, rows, issues);
}

/**
 * The 기초 field list the page loads when its 기초 tab is open (select ag_basic_fld_cd), without the
 * campus suffix and the "전체" choice. Empty on other tabs, so no 개설영역 is read as 기초 there.
 * Only a real name attribute counts (any quoting, any attribute order; not data-name or a longer
 * name), lists inside HTML comments are ignored, and two lists that disagree count as none.
 */
function basicFields(html:string):Set<string> {
  const page = withoutBlocks(html, 'comment');
  const lists = [...page.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)]
    .filter(match => /(?:^|\s)name\s*=\s*(?:"ag_basic_fld_cd"|'ag_basic_fld_cd'|ag_basic_fld_cd(?=[\s/>]|$))/i.test(match[1]!))
    .map(match => [...match[2]!.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)]
      .map(option => cellText(option[1]!).replace(/\s*\((?:서울|글로벌)\)$/, ''))
      .filter(label => label !== '' && label !== '전체'));
  const keys = new Set(lists.map(list => JSON.stringify([...new Set(list)].sort())));
  return keys.size === 1 ? new Set(lists[0]) : new Set();
}

const CAMPUS_RADIO:Readonly<Record<string, TimetableCampus>> = {H1:'SEOUL', H2:'GLOBAL'};
const CAMPUS_PREFIX:Readonly<Record<string, TimetableCampus>> = {'(서울)':'SEOUL', '(글로벌)':'GLOBAL'};

function pageCampus(html:string):TimetableCampus {
  const checked = [...html.matchAll(/<input\b[^>]*\bname="campus_sect"[^>]*>/gi)]
    .filter(match => /\bchecked\b/i.test(match[0]))
    .map(match => /\bvalue="([^"]*)"/i.exec(match[0])?.[1] ?? '');
  const byRadio = checked.length === 1 ? CAMPUS_RADIO[checked[0]!] : undefined;
  const list = /<select\b[^>]*\bname="ag_crs_strct_cd"[^>]*>([\s\S]*?)<\/select>/i.exec(html)?.[1] ?? '';
  const labels = [...list.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map(match => cellText(match[1]!)).filter(label => label !== '');
  const prefixes = new Set(labels.map(label => CAMPUS_PREFIX[label.split(' ')[0]!]));
  const byList = labels.length > 0 && prefixes.size === 1 ? [...prefixes][0] : undefined;
  return byRadio !== undefined && byRadio === byList ? byRadio : 'UNKNOWN';
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
    campus:pageCampus(withoutBlocks(input.html, 'script')),
    coverage:'ONE_DEPARTMENT_PAGE',
    codeFormat:{reviewed:input.codeFormatReviewed === true, consistentWithCourse7Section2:consistent},
    rows,
    issues,
  };
}
