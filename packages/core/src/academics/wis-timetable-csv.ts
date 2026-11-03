import type {TimetableAttribute, TimetableImport, TimetableRow} from './wis-timetable.js';

/**
 * toSavedCurriculumCsv (#133): one converted timetable page as the 8-column CSV that the
 * operator-saved curriculum import (apps/api permitted-curriculum `importSavedCurriculum`,
 * OPERATOR_SAVED) accepts. One line per listed section; the raw 9-character code is kept, so
 * sections never collide. category is the page's 개설영역 text as written. The page states no
 * 학번, so cohort is UNKNOWN; campus is the one the page shows (TimetableImport.campus), and a
 * stated campus is only checked against it.
 *
 * The CSV has no column for 이수구분, notes, or review flags, so they travel beside it in
 * `details`, one entry per exported line, and a row that needs review (for example a course
 * without a syllabus link, termEvidence PAGE_ONLY) is withheld and listed, never sent as if it
 * were clean. Rules in notes stay NEEDS_REVIEW on the import side.
 * Pure: no hashing, files, or network. The local CLI adds the original/CSV hashes.
 */

/** Bump when the converter or this export changes output for the same saved page. */
export const WIS_TIMETABLE_CONVERTER_VERSION = 'hufs-wis-timetable-2';

/** Must equal apps/api permitted-curriculum `courseCsvHeaders`; a test keeps them in step. */
export const SAVED_CURRICULUM_CSV_HEADERS = ['courseCode', 'courseName', 'credits', 'category', 'major', 'semester', 'campus', 'cohort'] as const;

export type WithheldReason = 'NEEDS_REVIEW'|'TERM_FROM_PAGE'|'NOT_A_REGULAR_TERM'|'CELL_NOT_ACCEPTED';

/** What the CSV line cannot hold, kept for the same course code. */
export interface SavedCurriculumDetail {
  rawCode:string;
  /** 이수구분 as the page states it: 전필 when the REQUIRED chip is shown; nothing is inferred otherwise. */
  completion:'REQUIRED'|'NOT_STATED';
  attributes:TimetableAttribute[];
  instructionLanguage:string|null;
  /** 비고 as written; prerequisite, 학번, and equivalent-course text is never applied as a rule. */
  note:string;
  noteHints:TimetableRow['noteHints'];
}

export interface SavedCurriculumCsv {
  csv:string;
  rows:number;
  campus:string;
  details:SavedCurriculumDetail[];
  withheld:{no:number; rawCode:string; reason:WithheldReason}[];
}

/** The import refuses the whole CSV on an empty cell, a cell over 200 characters, or a leading = + @. */
const acceptable = (cell:string) => cell.trim() !== '' && cell.trim().length <= 200 && !/^[=+@]/.test(cell.trim());

function quote(cell:string):string {
  return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

export function toSavedCurriculumCsv(page:TimetableImport, options:{campus?:string} = {}):SavedCurriculumCsv {
  // A stated campus may only confirm what the page shows. It never turns UNKNOWN into a campus.
  if (options.campus !== undefined && options.campus !== page.campus) {
    throw new TypeError(`campus ${options.campus} does not match the page, which shows ${page.campus}`);
  }
  const campus = page.campus;
  if (!acceptable(page.departmentLabel)) throw new TypeError('department label is not accepted by the import');
  const lines = [SAVED_CURRICULUM_CSV_HEADERS.join(',')];
  const details:SavedCurriculumDetail[] = [];
  const withheld:SavedCurriculumCsv['withheld'] = [];
  for (const row of page.rows) {
    const hold = (reason:WithheldReason) => withheld.push({no:row.no, rawCode:row.rawCode, reason});
    if (!page.term.academicTerm) { hold('NOT_A_REGULAR_TERM'); continue; }
    if (row.termEvidence === 'PAGE_ONLY') { hold('TERM_FROM_PAGE'); continue; }
    if (row.needsReview || row.creditUnits === null) { hold('NEEDS_REVIEW'); continue; }
    const cells = [row.rawCode, row.title, String(row.creditUnits / 2), row.areaLabel, page.departmentLabel,
      page.term.academicTerm, campus, 'UNKNOWN'];
    if (!cells.every(acceptable) || !/^[A-Za-z0-9_.-]{1,40}$/.test(row.rawCode)) { hold('CELL_NOT_ACCEPTED'); continue; }
    lines.push(cells.map(quote).join(','));
    details.push({rawCode:row.rawCode, completion:row.attributes.includes('REQUIRED') ? 'REQUIRED' : 'NOT_STATED',
      attributes:[...row.attributes], instructionLanguage:row.instructionLanguage, note:row.note, noteHints:{...row.noteHints}});
  }
  return {csv:`${lines.join('\n')}\n`, rows:lines.length - 1, campus, details, withheld};
}
