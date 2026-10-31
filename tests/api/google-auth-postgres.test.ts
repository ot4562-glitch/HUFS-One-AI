import {describe,expect,it} from 'vitest';
import {PostgresGoogleAuthStore} from
  '../../apps/api/src/modules/auth/google-auth-postgres.js';
import type {ReviewerSqlPool,ReviewerSqlConnection} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';
import type {GoogleAuthSession,GoogleLoginAttempt} from
  '../../apps/api/src/modules/auth/google-auth-store.js';
import {MemoryGoogleAuthStore} from '../../apps/api/src/modules/auth/google-auth-store.js';

const NOW='2026-10-31T12:00:00.000Z';
const LATER='2026-10-31T12:05:00.000Z';
const DIGEST='a'.repeat(64);
const BROWSER_DIGEST='b'.repeat(64);
const state:GoogleLoginAttempt={
  stateDigest:DIGEST,browserDigest:BROWSER_DIGEST,
  nonce:'N'.repeat(43),codeVerifier:'V'.repeat(43),
  intent:'REVIEWER',createdAt:NOW,expiresAt:LATER,
};
const actor={
  actorId:'google:test-person',role:'REVIEWER' as const,
  sessionIdHash:DIGEST,sessionExpiresAt:LATER,
  identityProofExpiresAt:LATER,verifiedEmail:'judge@example.org',
  csrfToken:'C'.repeat(43),
};
const session:GoogleAuthSession={
  tokenDigest:DIGEST,createdAt:NOW,actor,
};

describe('Postgres OIDC persistence: SQL atomicity and fail-closed reads',()=>{
  it('uses atomic DELETE RETURNING for one-time state, hash-only sessions and revocation',async()=>{
    const statements:Array<{sql:string;args:readonly unknown[]}>=[],released:string[]=[];
    let first=true;
    let active=true;
    const connection:ReviewerSqlConnection={
      query:async(sql,params=[])=>{
        statements.push({sql,args:params});
        if(sql.includes('DELETE FROM google_login_attempts')){
          if(!first)return {rows:[]};
          first=false;
          return {rows:[{
            state_digest:DIGEST,browser_digest:BROWSER_DIGEST,
            nonce:state.nonce,code_verifier:state.codeVerifier,
            intent:'REVIEWER',created_at:NOW,expires_at:LATER,
          }]};
        }
        if(sql.includes('SELECT token_digest')){
          return {rows:active?[{
            token_digest:DIGEST,actor_payload:actor,created_at:NOW,
          }]:[]};
        }
        if(sql.includes('UPDATE google_app_sessions'))active=false;
        return {rows:[]};
      },
      release:()=>released.push('released'),
    };
    const pool:ReviewerSqlPool={connect:async()=>connection};
    const store=new PostgresGoogleAuthStore(pool);
    await store.putAttempt(state);
    expect(await store.consumeAttempt(DIGEST)).toEqual(state);
    expect(await store.consumeAttempt(DIGEST)).toBeNull();
    expect(statements.filter(s=>s.sql.includes('DELETE FROM google_login_attempts')))
      .toHaveLength(2);
    expect(statements.some(s=>s.sql.includes('DELETE FROM google_login_attempts')
      &&s.sql.includes('RETURNING')&&s.args[0]===DIGEST)).toBe(true);
    await store.createSession(session);
    expect(JSON.stringify(statements)).not.toContain('session-cookie-bearer');
    expect((await store.readSession(DIGEST,NOW))?.actor.role).toBe('REVIEWER');
    await store.revokeSession(DIGEST,NOW);
    expect(await store.readSession(DIGEST,NOW)).toBeNull();
    expect(released).toHaveLength(7);
    expect(statements.some(s=>s.sql.includes('UPDATE google_app_sessions')
      &&s.sql.includes('revoked_at'))).toBe(true);
  });

  it('forbids any ADMIN identity from the Google OIDC session store',async()=>{
    const admin:GoogleAuthSession={
      tokenDigest:DIGEST,createdAt:NOW,
      actor:{
        actorId:'google:unapproved-admin',role:'ADMIN',
        sessionIdHash:DIGEST,sessionExpiresAt:LATER,
        schoolMailProofExpiresAt:LATER,betaAllowed:true,
        csrfToken:'C'.repeat(43),
      },
    };
    let writes=0;
    const db:ReviewerSqlConnection={
      query:async sql=>{
        if(sql.includes('INSERT INTO google_app_sessions'))writes++;
        return {rows:sql.includes('SELECT token_digest')?[{
          token_digest:DIGEST,actor_payload:admin.actor,created_at:NOW,
        }]:[]};
      },
      release:()=>{},
    };
    const store=new PostgresGoogleAuthStore({connect:async()=>db});
    await expect(new MemoryGoogleAuthStore().createSession(admin))
      .rejects.toThrow(/role|admin/i);
    await expect(store.createSession(admin)).rejects.toThrow(/role|admin/i);
    expect(writes).toBe(0);
    expect(await store.readSession(DIGEST,NOW)).toBeNull();
  });

  it('does not return malformed, spoofed or stale actor data on DB reads',async()=>{
    let payload:unknown={
      ...actor,role:'ADMIN',betaAllowed:true,
      schoolMailProofExpiresAt:LATER,
    };
    const connection:ReviewerSqlConnection={
      query:async(sql)=>({rows:sql.includes('SELECT token_digest')?[{
        token_digest:DIGEST,actor_payload:payload,created_at:NOW,
      }]:[]}),
      release:()=>{},
    };
    const store=new PostgresGoogleAuthStore({
      connect:async()=>connection,
    });
    expect(await store.readSession(DIGEST,NOW)).toBeNull();
    payload={...actor,role:'REVIEWER',sessionIdHash:'wrong'};
    expect(await store.readSession(DIGEST,NOW)).toBeNull();
    payload={...actor,identityProofExpiresAt:'2026-01-01T00:00:00.000Z'};
    expect(await store.readSession(DIGEST,NOW)).toBeNull();
    expect(await store.readSession('invalid',NOW)).toBeNull();
    await expect(store.createSession({...session,actor:{
      ...actor,sessionIdHash:'wrong',
    }})).rejects.toThrow(/digest/);
  });
});
