import {describe,expect,it} from 'vitest';
import {migrationTransactionBody} from '../../apps/api/src/db/migration-plan.js';
describe('reviewed PostgreSQL transaction envelope',()=>{
  it('removes only one real outer BEGIN/COMMIT, preserving quoted functions/comments',()=>{
    const body="CREATE FUNCTION syn() RETURNS text LANGUAGE sql AS $tag$ SELECT 'COMMIT; BEGIN;' $tag$;";
    expect(migrationTransactionBody(`-- BEGIN;\nBEGIN;\n/* nested /* COMMIT; */ comment */\n${body}\nCOMMIT;-- end`)).toContain(body);
  });
  it.each(['BEGIN;SELECT 1;COMMIT;SELECT 2;','BEGIN;COMMIT;BEGIN;COMMIT;',
    'BEGIN;SELECT 1;ROLLBACK;COMMIT;','COMMIT;','BEGIN;SELECT 1;',"SELECT 'unterminated",'/* unterminated',
    "BEGIN;SET standard_conforming_strings=off;SELECT 1;COMMIT;",'RESET ALL;','DISCARD ALL;',
    'SELECT 1;-- comment\rCOMMIT;'])('rejects unsafe or incomplete SQL %s',sql=>{
    expect(()=>migrationTransactionBody(sql)).toThrow();
  });
  it('accepts ordinary reviewed statements and refuses transaction control hidden by comments',()=>{
    expect(migrationTransactionBody("SELECT 'it''s BEGIN;'; SELECT E'COMMIT;\\\' still a string';")).toContain('SELECT');
    expect(()=>migrationTransactionBody('BEGIN; /*guard*/ START TRANSACTION; COMMIT;')).toThrow();
  });
  it.each(['éE','\u00a0E','한E','😀E'])('treats non-ASCII %s as a complete type identifier, not an E-string prefix',name=>{
    const sql=`CREATE DOMAIN ${name} AS text;\nSELECT ${name}`+String.raw`'\'; COMMIT; --';`;
    expect(()=>migrationTransactionBody(sql)).toThrow();
  });
  it.each(['한','é','😀'])('handles Unicode dollar tag %s without hiding transaction commands',tag=>{
    const delimiter=`$${tag}$`;
    expect(()=>migrationTransactionBody(`SELECT ${delimiter}'${delimiter}; COMMIT; --';`)).toThrow();
    expect(migrationTransactionBody(`SELECT ${delimiter}COMMIT; '${delimiter};`)).toContain(delimiter);
  });
});
