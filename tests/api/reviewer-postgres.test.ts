import {describe,expect,it} from 'vitest';
import {PostgresReviewerAccessStore} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import type {ReviewerSqlConnection,ReviewerSqlPool,SqlResult} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';
import {issueReviewerInvitation,digestInviteToken} from '../../apps/api/src/modules/auth/reviewer.js';

const NOW='2026-11-10T00:00:00.000Z';
const BEGIN='2026-11-05T15:00:00.000Z';
const END='2026-12-09T15:00:00.000Z';

function fakeDatabase(){
  const log:Array<{sql:string;params:readonly unknown[]}>=[],rows=new Map<string,Record<string,unknown>>();
  let invitation:Record<string,unknown>|null=null;
  let released=0;
  const client:ReviewerSqlConnection={
    async query(sql,params=[]):Promise<SqlResult>{
      log.push({sql,params});
      if(sql.startsWith('INSERT INTO reviewer_invitations')){
        invitation={id:params[0],starts_at:params[1],ends_at:params[2],
          label:params[3],max_accounts:params[4],token_digest:params[5],
          issued_at:params[6],revoked_at:params[7]};
        return {rows:[]};
      }
      if(sql.includes('WHERE token_digest=$1 FOR UPDATE'))
        return {rows:invitation&&invitation.token_digest===params[0]?
          [structuredClone(invitation)]:[]};
      if(sql.startsWith('SELECT invite_id,actor_id,verified_email')){
        const old=rows.get(String(params[1]));
        return {rows:old?[structuredClone(old)]:[]};
      }
      if(sql.includes('count(*)::integer AS seats'))
        return {rows:[{seats:rows.size}]};
      if(sql.startsWith('INSERT INTO reviewer_enrollments')){
        const record={invite_id:params[0],actor_id:params[1],
          verified_email:params[2],enrolled_at:params[3]};
        rows.set(String(params[1]),record);
        return {rows:[{invite_id:params[0]}]};
      }
      if(sql.includes('JOIN reviewer_enrollments e')){
        const member=rows.get(String(params[0]));
        return {rows:member&&invitation&&member.verified_email===params[1]
          &&invitation.revoked_at===null
          &&Date.parse(String(invitation.starts_at))<=Date.parse(String(params[2]))
          &&Date.parse(String(params[2]))<Date.parse(String(invitation.ends_at))?
          [structuredClone(invitation)]:[]};
      }
      if(sql.startsWith('UPDATE reviewer_invitations')){
        if(!invitation||invitation.id!==params[0])return {rows:[]};
        invitation.revoked_at=params[1];
        return {rows:[{id:invitation.id}]};
      }
      return {rows:[]};
    },
    release:()=>{released++;},
  };
  const pool:ReviewerSqlPool={connect:async()=>client};
  return {pool,log,get released(){return released;}};
}

describe('PostgreSQL shared invite adapter - local transactional fake',()=>{
  it('serializes seat acquisition, allows separate verified sub identities and expires both',async()=>{
    const db=fakeDatabase();
    const store=new PostgresReviewerAccessStore(db.pool);
    const invite=await issueReviewerInvitation(store,{
      startsAt:BEGIN,endsAt:END,label:'Shared evaluation',maxAccounts:2,
    },{now:'2026-10-31T00:00:00.000Z'});
    const digest=digestInviteToken(invite.enrollmentCode);
    expect(db.log[0]?.params[5]).toBe(digest);
    expect(JSON.stringify(db.log)).not.toContain(invite.enrollmentCode);
    expect((await store.redeem({tokenDigest:digest,actorId:'GOOGLE-SUB-1',
      verifiedEmail:'first@example.org',now:NOW}))?.actorId).toBe('GOOGLE-SUB-1');
    expect((await store.redeem({tokenDigest:digest,actorId:'GOOGLE-SUB-2',
      verifiedEmail:'second@example.org',now:NOW}))?.actorId).toBe('GOOGLE-SUB-2');
    expect(await store.redeem({tokenDigest:digest,actorId:'GOOGLE-SUB-3',
      verifiedEmail:'third@example.org',now:NOW})).toBeNull();
    expect((await store.readActive({actorId:'GOOGLE-SUB-2',
      verifiedEmail:'second@example.org',now:NOW}))?.inviteId).toBe(invite.invitationId);
    expect(await store.readActive({actorId:'GOOGLE-SUB-2',
      verifiedEmail:'second@example.org',now:END})).toBeNull();
    expect(db.log.some(x=>x.sql.includes('FOR UPDATE'))).toBe(true);
    expect(db.log.some(x=>x.sql==='COMMIT')).toBe(true);
    expect(await store.revoke(invite.invitationId,NOW)).toBe(true);
    expect(await store.readActive({actorId:'GOOGLE-SUB-1',
      verifiedEmail:'first@example.org',now:NOW})).toBeNull();
    expect(db.released).toBeGreaterThanOrEqual(7);
  });
});
