#!/usr/bin/env node
// Converts HUFS 강의시간표 pages that a person saved from the browser (wis.hufs.ac.kr, which
// disallows crawlers) into JSON for #133. It reads only the files given and fetches nothing.
// Output goes to local_only/ by default, which Git ignores: do not commit saved pages or output.
//
//   node tools/import_wis_timetable.mjs <DEPT_2026-2_강의시간표.html>... [--out <dir>] [--dept <label>]
//     [--csv [--campus <label>]]
//
// --csv also writes, per page, the 8-column CSV for the operator-saved curriculum import and a
// hand-off manifest with the saved page and CSV SHA-256, capture time, converter version,
// coverage, the rows withheld because they need review, and per-course 이수구분 and notes the
// CSV cannot hold. --campus only confirms the campus the page shows. It grants no permission
// and uploads nothing.
//
// Needs Node 23.6 or later (runs the TypeScript core directly) and `npm run build:contracts`.
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {importWisTimetable} from '../packages/core/src/academics/wis-timetable.ts';
import {toSavedCurriculumCsv, WIS_TIMETABLE_CONVERTER_VERSION} from '../packages/core/src/academics/wis-timetable-csv.ts';

const args = process.argv.slice(2);
const files = [];
let out = 'local_only/academics/timetables';
let dept;
let csv = false;
let campus;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--dept') dept = args[++i];
  else if (args[i] === '--csv') csv = true;
  else if (args[i] === '--campus') campus = args[++i];
  else files.push(args[i]);
}
if (files.length === 0) {
  console.error('usage: node tools/import_wis_timetable.mjs <saved page.html>... [--out <dir>] [--dept <label>] [--csv [--campus <label>]]');
  process.exit(2);
}

const sha256 = value => createHash('sha256').update(value).digest('hex');
mkdirSync(out, {recursive:true});
let failed = 0;
for (const file of files) {
  try {
    const bytes = readFileSync(file);
    const result = importWisTimetable({
      html:bytes.toString('utf8'),
      fileName:basename(file),
      savedAt:statSync(file).mtime.toISOString(),
      ...(dept ? {departmentLabel:dept} : {}),
    });
    const stem = basename(file).replace(/\.html?$/i, '');
    const target = join(out, `${stem}.json`);
    writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
    const review = result.rows.filter(row => row.needsReview).length;
    const notes = result.issues.filter(issue => issue.code === 'NOTE_NEEDS_REVIEW').length;
    let exported = '';
    if (csv) {
      const page = toSavedCurriculumCsv(result, campus ? {campus} : {});
      writeFileSync(join(out, `${stem}.csv`), page.csv);
      writeFileSync(join(out, `${stem}.handoff.json`), `${JSON.stringify({
        fileName:basename(file), sourceUrl:result.source.savedFromUrl,
        savedArtifactSha256:sha256(bytes), normalizedCsvSha256:sha256(page.csv),
        capturedAt:result.source.savedAt, converterVersion:WIS_TIMETABLE_CONVERTER_VERSION,
        departmentLabel:result.departmentLabel, term:result.term.academicTerm ?? null, campus:page.campus,
        coverage:result.coverage, codeFormat:result.codeFormat,
        rows:page.rows, withheld:page.withheld, details:page.details,
      }, null, 2)}\n`);
      exported = `, csv ${page.rows} rows (${page.withheld.length} withheld)`;
    }
    console.log(`${basename(file)}: ${result.departmentLabel} ${result.term.year}-${result.term.session}, `
      + `${result.rows.length} rows, ${review} rows need review, ${notes} notes to review${exported} -> ${resolve(target)}`);
  } catch (error) {
    failed += 1;
    console.error(`${basename(file)}: refused: ${error.message}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
