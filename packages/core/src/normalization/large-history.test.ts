import {expect,it} from 'vitest';
import {selectCurrentRevisions,type RevisionRecord} from './revisions.js';

it('keeps every superseded revision and the final head in a large immutable history',()=>{
  const revisions=Object.freeze(Array.from({length:4000},(_,i)=>Object.freeze({
    revisionId:'R'+String(i).padStart(4,'0'),sourceId:'SYN-HISTORY',
    ...(i?{supersedes:'R'+String(i-1).padStart(4,'0')}:{ }),
    status:'ACTIVE',changeKind:'CORRECTED',provenance:'SYNTHETIC',permissionRef:'SYN-PERMISSION',
    fetchedAt:'2026-11-01T00:00:00.000Z',lastVerifiedAt:'2026-11-02T00:00:00.000Z',
  } satisfies RevisionRecord)));
  const result=selectCurrentRevisions(revisions,'2026-11-03T00:00:00.000Z');
  expect(result.current.get('SYN-HISTORY')?.revisionId).toBe('R3999');
  expect(result.quarantined).toHaveLength(3999);
  expect(result.quarantined[0]).toEqual({revisionId:'R0000',sourceId:'SYN-HISTORY',reason:'SUPERSEDED'});
  expect(result.quarantined.at(-1)).toEqual({revisionId:'R3998',sourceId:'SYN-HISTORY',reason:'SUPERSEDED'});
  const reversed=selectCurrentRevisions([...revisions].reverse(),'2026-11-03T00:00:00.000Z');
  expect(reversed.quarantined).toEqual(result.quarantined);
  expect(revisions[0]?.revisionId).toBe('R0000');
});
