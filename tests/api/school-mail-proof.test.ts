import {describe,expect,it,vi} from 'vitest';
import {
  createSchoolMailProofService,MemorySchoolMailChallengeStore,SchoolMailProofError,
} from '../../apps/api/src/modules/auth/school-mail-proof.js';
import type {SchoolMailChallenge} from
  '../../apps/api/src/modules/auth/school-mail-proof.js';
import {
  PostgresSchoolMailChallengeStore,PostgresSchoolProofApprover,
} from '../../apps/api/src/modules/auth/school-mail-postgres.js';
import type {ReviewerSqlConnection,ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

const SUBJECT='google-verified-01';
const SCHOOL='student@hufs.ac.kr';
const KEY=Buffer.alloc(32,7); // Synthetic fixed fixture; never use in a live server.
const START=new Date('2026-10-31T12:00:00.000Z');
function harness(options:{approved?:boolean;deliveryFails?:boolean}={}){
  const store=new MemorySchoolMailChallengeStore();
  let clock=new Date(START);
  let outbound:{schoolEmail:string;code:string;expiresAt:string}|null=null;
  const updates:Array<{googleSubject:string;schoolEmail:string;
    verifiedAt:string;validUntil:string}>=[];
  const sender=vi.fn(async(value:{schoolEmail:string;code:string;expiresAt:string})=>{
    outbound=value;
    if(options.deliveryFails)throw new Error('synthetic delivery failed');
  });
  const service=createSchoolMailProofService({
    store,sender:{send:sender},digestKey:KEY,now:()=>clock,
    approver:{
      mayIssue:async(input)=>options.approved!==false
        &&input.googleSubject===SUBJECT&&input.schoolEmail===SCHOOL,
      confirm:async(value)=>{
        updates.push(value);
        return options.approved!==false;
      },
    },
  });
  return {service,store,sender,updates,
    code:()=>outbound?.code??'',
    sent:()=>outbound,
    advance:(milliseconds:number)=>{clock=new Date(clock.getTime()+milliseconds);}};
}
const holder=()=>({googleSubject:SUBJECT,schoolEmail:SCHOOL});

describe('school mailbox challenge: issuer, delivery and 8-digit HMAC proof',()=>{
  it('delivers only to exact school domain; browser receives opaque challenge metadata only',async()=>{
    const h=harness();
    const meta=await h.service.issue(holder());
    expect(meta.challengeId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(meta.expiresAt).toBe('2026-10-31T12:10:00.000Z');
    expect(meta).not.toHaveProperty('code');
    expect(h.code()).toMatch(/^\d{8}$/);
    expect(h.sender).toHaveBeenCalledOnce();
    expect(h.sent()?.schoolEmail).toBe(SCHOOL);
  });

  it('consumes the correct code only once and records only pre-approved evidence',async()=>{
    const h=harness();
    const meta=await h.service.issue(holder());
    const proof={...holder(),challengeId:meta.challengeId,code:h.code()};
    expect(await h.service.verify(proof)).toBe(true);
    expect(await h.service.verify(proof)).toBe(false);
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).toEqual({
      ...holder(),verifiedAt:START.toISOString(),
      validUntil:'2026-10-31T13:00:00.000Z',
    });
  });

  it('limits guessed codes to five checks, then even the correct code is refused',async()=>{
    const h=harness();
    const meta=await h.service.issue(holder());
    const base={...holder(),challengeId:meta.challengeId};
    const wrong=h.code()==='99999999'?'88888888':'99999999';
    for(let i=0;i<5;i++){
      expect(await h.service.verify({...base,code:wrong})).toBe(false);
    }
    expect(await h.service.verify({...base,code:h.code()})).toBe(false);
    expect(h.updates).toHaveLength(0);
  });

  it('hard-expires at the exact tenth minute and rejects altered subject or email',async()=>{
    const h=harness();
    const meta=await h.service.issue(holder());
    const base={...holder(),challengeId:meta.challengeId,code:h.code()};
    expect(await h.service.verify({...base,googleSubject:'another-account'})).toBe(false);
    expect(await h.service.verify({...base,schoolEmail:'another@hufs.ac.kr'})).toBe(false);
    expect(await h.service.verify({...base,challengeId:'A'.repeat(22)})).toBe(false);
    h.advance(600_000);
    expect(await h.service.verify(base)).toBe(false);
  });

  it('denies more than 3 sends per hour per account, even across school mailboxes',async()=>{
    const h=harness();
    const issued=[] as Array<{challengeId:string}>;
    for(let i=0;i<3;i++)issued.push(await h.service.issue(holder()));
    expect(new Set(issued.map(x=>x.challengeId)).size).toBe(3);
    await expect(h.service.issue(holder())).rejects.toBeInstanceOf(SchoolMailProofError);
    expect(h.sender).toHaveBeenCalledTimes(3);
    await expect(h.service.issue({...holder(),schoolEmail:'other@hufs.ac.kr'}))
      .rejects.toBeInstanceOf(SchoolMailProofError);
    h.advance(3600_001);
    expect((await h.service.issue(holder())).challengeId).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('refuses fake school domains, noncanonical emails and missing Google subjects',async()=>{
    const h=harness();
    for(const value of ['student@gmail.com','student@hufs.ac.kr.attacker.test',
      'student@HUFS.AC.KR','stu dent@hufs.ac.kr']){
      await expect(h.service.issue({...holder(),schoolEmail:value})).rejects
        .toBeInstanceOf(SchoolMailProofError);
    }
    await expect(h.service.issue({...holder(),googleSubject:''})).rejects
      .toBeInstanceOf(SchoolMailProofError);
    expect(h.sender).not.toHaveBeenCalled();
    expect(()=>createSchoolMailProofService({
      store:h.store,sender:{send:async()=>{}},
      approver:{mayIssue:async()=>true,confirm:async()=>true},digestKey:Buffer.alloc(8),
    })).toThrow();
  });

  it('rejects an unapproved school address before reserving or sending a code',async()=>{
    const h=harness();
    await expect(h.service.issue({
      ...holder(),schoolEmail:'unlisted@hufs.ac.kr',
    })).rejects.toBeInstanceOf(SchoolMailProofError);
    expect(h.sender).not.toHaveBeenCalled();
    // A refused request should not consume quota for the approved address.
    expect((await h.service.issue(holder())).challengeId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(h.sender).toHaveBeenCalledOnce();
  });

  it('fails closed on an unavailable administrator approval store, before email',async()=>{
    const store=new MemorySchoolMailChallengeStore();
    const sender=vi.fn(async()=>{});
    const service=createSchoolMailProofService({
      store,sender:{send:sender},digestKey:KEY,now:()=>START,
      approver:{
        mayIssue:async()=>{throw new Error('Approval store disconnected');},
        confirm:async()=>true,
      },
    });
    await expect(service.issue(holder())).rejects.toBeInstanceOf(SchoolMailProofError);
    expect(sender).not.toHaveBeenCalled();
  });

  it('cancels an unsent challenge; delivery failure never grants school privileges',async()=>{
    const h=harness({deliveryFails:true});
    await expect(h.service.issue(holder())).rejects.toBeInstanceOf(SchoolMailProofError);
    expect(h.updates).toHaveLength(0);
  });

  it('refuses to send any email before an administrator approves the account/address',async()=>{
    const h=harness({approved:false});
    await expect(h.service.issue(holder())).rejects.toBeInstanceOf(SchoolMailProofError);
    expect(h.sender).not.toHaveBeenCalled();
    expect(h.updates).toHaveLength(0);
  });

  it('stores a keyed code digest rather than raw code in the challenge record',async()=>{
    const collected:SchoolMailChallenge[]=[];
    const real=new MemorySchoolMailChallengeStore();
    let delivered='';
    const service=createSchoolMailProofService({
      store:{
        issue:async value=>{collected.push({...value});return real.issue(value);},
        check:x=>real.check(x),cancel:id=>real.cancel(id),
      },
      sender:{send:async item=>{delivered=item.code;}},
      approver:{mayIssue:async()=>true,confirm:async()=>true},digestKey:KEY,now:()=>START,
    });
    const result=await service.issue(holder());
    expect(collected[0]?.proofDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(collected)).not.toContain(delivered);
    expect(await service.verify({...holder(),challengeId:result.challengeId,
      code:delivered})).toBe(true);
  });
});

describe('Postgres school email proof: atomic SQL and admin-owned approval',()=>{
  it('locks issuance quota with UPSERT and consumes challenge in one UPDATE',async()=>{
    const calls:Array<{sql:string;params:readonly unknown[]}>=[],released:number[]=[];
    const connection:ReviewerSqlConnection={
      query:async(sql,params=[])=>{
        calls.push({sql,params});
        if(sql.includes('INSERT INTO beta_mail_issue_windows'))
          return {rows:[{issued_count:1}]};
        if(sql.includes('INSERT INTO beta_mail_challenges'))
          return {rows:[{challenge_id:'A'.repeat(22)}]};
        if(sql.includes('UPDATE beta_mail_challenges'))
          return {rows:[{accepted:true}]};
        if(sql.includes('UPDATE beta_school_proofs'))
          return {rows:[{google_subject:SUBJECT}]};
        if(sql.includes('SELECT 1 FROM beta_school_proofs'))
          return {rows:[{'?column?':1}]};
        return {rows:[]};
      },
      release:()=>{released.push(1);},
    };
    const pool:ReviewerSqlPool={connect:async()=>connection};
    const store=new PostgresSchoolMailChallengeStore(pool);
    const attempt={
      challengeId:'A'.repeat(22),...holder(),proofDigest:'b'.repeat(64),
      createdAt:START.toISOString(),
      expiresAt:'2026-10-31T12:10:00.000Z',
    };
    expect(await store.issue(attempt)).toBe(true);
    expect(calls.map(x=>x.sql.trim()).some(x=>x==='BEGIN')).toBe(true);
    expect(calls.map(x=>x.sql.trim()).some(x=>x==='COMMIT')).toBe(true);
    const quota=calls.find(x=>x.sql.includes('INSERT INTO beta_mail_issue_windows'));
    expect(quota?.sql).toContain('ON CONFLICT (google_subject)');
    expect(quota?.params).toEqual([SUBJECT,START.toISOString()]);
    expect(await store.check({...holder(),challengeId:attempt.challengeId,
      proofDigest:attempt.proofDigest,now:START.toISOString()})).toBe(true);
    expect(calls.find(x=>x.sql.includes('UPDATE beta_mail_challenges'))?.sql)
      .toContain('used_at IS NULL');
    await store.cancel(attempt.challengeId);
    const approver=new PostgresSchoolProofApprover(pool);
    expect(await approver.mayIssue({...holder(),at:START.toISOString()})).toBe(true);
    const permission=calls.find(x=>x.sql.includes('SELECT 1 FROM beta_school_proofs'));
    expect(permission?.sql).toContain('revoked_at IS NULL');
    expect(permission?.params).toEqual([SUBJECT,SCHOOL,START.toISOString()]);
    expect(await approver.confirm({
      ...holder(),verifiedAt:START.toISOString(),
      validUntil:'2026-10-31T13:00:00.000Z',
    })).toBe(true);
    const statement=calls.find(x=>x.sql.includes('UPDATE beta_school_proofs'));
    expect(statement?.sql).toContain('revoked_at IS NULL');
    expect(statement?.sql).toContain('RETURNING');
    expect(statement?.sql).not.toContain('INSERT');
    expect(released).toHaveLength(5);
  });

  it('refuses exhausted quotas and nonexistent approvals',async()=>{
    const sql:ReviewerSqlConnection={
      query:async()=>({rows:[]}),release:()=>{},
    };
    const pool:ReviewerSqlPool={connect:async()=>sql};
    const store=new PostgresSchoolMailChallengeStore(pool);
    expect(await store.issue({
      challengeId:'A'.repeat(22),...holder(),proofDigest:'b'.repeat(64),
      createdAt:START.toISOString(),expiresAt:'2026-10-31T12:10:00.000Z',
    })).toBe(false);
    expect(await new PostgresSchoolProofApprover(pool).mayIssue({
      ...holder(),at:START.toISOString(),
    })).toBe(false);
    expect(await new PostgresSchoolProofApprover(pool).confirm({
      ...holder(),verifiedAt:START.toISOString(),
      validUntil:'2026-10-31T13:00:00.000Z',
    })).toBe(false);
  });
});
