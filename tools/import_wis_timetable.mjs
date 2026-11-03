#!/usr/bin/env node
// Converts HUFS 강의시간표 pages that a person saved from the browser (wis.hufs.ac.kr, which
// disallows crawlers) into JSON for #133. It reads only the files given and fetches nothing.
// Output goes to local_only/ by default, which Git ignores: do not commit saved pages or output.
//
//   node tools/import_wis_timetable.mjs <DEPT_2026-2_강의시간표.html>... [--out <dir>] [--dept <label>]
//
// Needs Node 23.6 or later (runs the TypeScript core directly) and `npm run build:contracts`.
import {mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {importWisTimetable} from '../packages/core/src/academics/wis-timetable.ts';

const args = process.argv.slice(2);
const files = [];
let out = 'local_only/academics/timetables';
let dept;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--dept') dept = args[++i];
  else files.push(args[i]);
}
if (files.length === 0) {
  console.error('usage: node tools/import_wis_timetable.mjs <saved page.html>... [--out <dir>] [--dept <label>]');
  process.exit(2);
}

mkdirSync(out, {recursive:true});
let failed = 0;
for (const file of files) {
  try {
    const result = importWisTimetable({
      html:readFileSync(file, 'utf8'),
      fileName:basename(file),
      savedAt:statSync(file).mtime.toISOString(),
      ...(dept ? {departmentLabel:dept} : {}),
    });
    const target = join(out, `${basename(file).replace(/\.html?$/i, '')}.json`);
    writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
    const review = result.rows.filter(row => row.needsReview).length;
    const notes = result.issues.filter(issue => issue.code === 'NOTE_NEEDS_REVIEW').length;
    console.log(`${basename(file)}: ${result.departmentLabel} ${result.term.year}-${result.term.session}, `
      + `${result.rows.length} rows, ${review} rows need review, ${notes} notes to review -> ${resolve(target)}`);
  } catch (error) {
    failed += 1;
    console.error(`${basename(file)}: refused: ${error.message}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
