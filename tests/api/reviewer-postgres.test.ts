import {describe,expect,it} from 'vitest';
import {PostgresReviewerAccessStore} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import type {ReviewerSqlConnection,ReviewerSqlPool,SqlResult} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import {issueReviewerInvitation} from '../../apps/api/src/modules/auth/reviewer.js';

const NOW='2026-12-06T00:00:00.000Z';
const BEGIN='2026-12-05T00:00:00.000Z';
const END='2026-12-12T00:00:00.000Z';
function fakeDatabase(){
 const log:Array<{sql:string;params:readonly unknown[]}>=[];let released=0;
 const state:{row:Record<string,unknown>|null}={row:null};
 const client:ReviewerSqlConnection={
  async query(sql,params=[]):Promise<SqlResult> {
    log.push({sql,params});
    if(sql.startsWith('INSERT INTO')){
      state.row={id:params[0],recipient_email:params[1],starts_at:params[2],
        ends_at:params[3],label:params[4],token_digest:params[5],
        issued_at:params[6],enrolled_actor_id:params[7],enrolled_at:params[8],
        revoked_at:params[9]};
      return {rows:[]};
    }
    if(sql.startsWith('SELECT')&&sql.includes('token_digest=$1')){
      return {rows:state.row&&state.row.token_digest===params[0]?[structuredClone(state.row)]:[]};
    }
    if(sql.startsWith('UPDATE reviewer_invitations')&&sql.includes('SET enrolled_actor_id')){
      if(!state.row)return {rows:[]};
      state.row.enrolled_actor_id=params[1];state.row.enrolled_at=params[2];
      return {rows:[structuredClone(state.row)]};
    }
    if(sql.startsWith('SELECT')&&sql.includes('WHERE enrolled_actor_id=$1')){
      return {rows:state.row?.enrolled_actor_id===params[0]
        &&state.row?.recipient_email===params[1]
        &&state.row?.revoked_at===null
        &&Date.parse(String(state.row?.starts_at))<=Date.parse(String(params[2]))
        &&Date.parse(String(params[2]))<Date.parse(String(state.row?.ends_at))
        ?[structuredClone(state.row)]:[]};
    }
    if(sql.startsWith('UPDATE reviewer_invitations')&&sql.includes('SET revoked_at')){
      if(!state.row||state.row.id!==params[0])return {rows:[]};
      state.row.revoked_at=params[1];return {rows:[{id:state.row.id}]};
    }
    return {rows:[]};
  },
  release:()=>{released+=1;},
 };
 const pool:ReviewerSqlPool={connect:async()=>client};
 return {pool,log,get released(){return released;}};
}
describe('PostgreSQL reviewer adapter - local fake transaction contract',()=>{
 it('binds invitation by verified email, enrolls atomically, persists read + expiry + revocation',async()=>{
  const db=fakeDatabase();
  const store=new PostgresReviewerAccessStore(db.pool);
  const issued=await issueReviewerInvitation(store,{
   recipientEmail:'person@example.edu',startsAt:BEGIN,endsAt:END,label:'Examiner',
  },{now:'2026-11-30T00:00:00.000Z'});
  const digest=(await import('../../apps/api/src/modules/auth/reviewer.js'))
   .digestInviteToken(issued.enrollmentCode);
  expect(db.log.find(c=>c.sql.startsWith('INSERT'))?.params[5]).toBe(digest);
  expect(JSON.stringify(db.log)).not.toContain(issued.enrollmentCode);
  expect(await store.redeem({tokenDigest:digest,actorId:'SUB1',
   verifiedEmail:'wrong@example.edu',now:NOW})).toBeNull();
  const grant=await store.redeem({tokenDigest:digest,actorId:'SUB1',
   verifiedEmail:'person@example.edu',now:NOW});
  expect(grant?.actorId).toBe('SUB1');
  expect(db.log.some(c=>c.sql.includes('FOR UPDATE'))).toBe(true);
  expect(db.log.some(c=>c.sql==='COMMIT')).toBe(true);
  expect((await store.readActive({actorId:'SUB1',verifiedEmail:'person@example.edu',now:NOW}))?.inviteId)
   .toBe(issued.invitationId);
  expect(await store.readActive({actorId:'SUB1',verifiedEmail:'person@example.edu',now:END})).toBeNull();
  expect(await store.revoke(issued.invitationId,NOW)).toBe(true);
  expect(await store.readActive({actorId:'SUB1',verifiedEmail:'person@example.edu',now:NOW})).toBeNull();
  expect(db.released).toBeGreaterThanOrEqual(6);
 });
});
