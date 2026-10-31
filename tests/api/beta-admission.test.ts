import {describe,expect,it} from 'vitest';
import {
  createBetaAdmissionPolicy,createBetaSessionRechecker,MemoryBetaAdmissionStore,
} from '../../apps/api/src/modules/auth/beta-admission.js';
import type {BetaAdmissionProof} from
  '../../apps/api/src/modules/auth/beta-admission.js';
import {PostgresBetaAdmissionStore} from
  '../../apps/api/src/modules/auth/beta-admission-postgres.js';
import type {ReviewerSqlConnection,ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';
import type {GoogleVerifiedIdentity} from
  '../../apps/api/src/modules/auth/google-oidc.js';

const NOW=new Date('2026-10-31T12:00:00.000Z');
const now=()=>new Date(NOW);
const example:GoogleVerifiedIdentity={
  googleSubject:'local-google-sub-A',
  verifiedEmail:'example@hufs.ac.kr',
  identityProofExpiresAt:'2026-10-31T13:00:00.000Z',
  issuer:'https://accounts.google.com',
  hostedDomain:'hufs.ac.kr',
  schoolWorkspaceVerified:true,
};
const approval:BetaAdmissionProof={
  googleSubject:example.googleSubject,
  schoolEmail:example.verifiedEmail,
  method:'SIGNED_WORKSPACE',
  proofVerifiedAt:'2026-10-31T11:30:00.000Z',
  proofExpiresAt:'2026-10-31T12:30:00.000Z',
  approvedUntil:'2026-11-07T00:00:00.000Z',
  revokedAt:null,
};
function harness(x:BetaAdmissionProof=approval){
  const store=new MemoryBetaAdmissionStore();
  store.setApproved(x);
  return {store,authorize:createBetaAdmissionPolicy(store,{now})};
}
describe('HUFS beta admission must bind Google sub, verified school email, independent proof and allowlist',()=>{
  it('allows the explicitly approved signed Workspace identity until its shortest proof expiry',async()=>{
    const {authorize}=harness();
    await expect(authorize(example)).resolves.toEqual({
      googleSubject:example.googleSubject,
      verifiedEmail:example.verifiedEmail,
      proofMethod:'SIGNED_WORKSPACE',
      schoolMailProofExpiresAt:approval.proofExpiresAt,
    });
  });
  it('accepts a trusted stored MAILBOX_OTP proof for an approved school email without Workspace hd',async()=>{
    const {authorize}=harness({...approval,method:'MAILBOX_OTP'});
    expect(await authorize({...example,hostedDomain:null,schoolWorkspaceVerified:false}))
      .toMatchObject({proofMethod:'MAILBOX_OTP',verifiedEmail:example.verifiedEmail});
  });
  it('rejects Gmail, spoofed domain, mismatched Google sub, and altered email',async()=>{
    const {authorize}=harness();
    expect(await authorize({...example,verifiedEmail:'example@gmail.com'})).toBeNull();
    expect(await authorize({...example,verifiedEmail:'example@hufs.ac.kr.evil.test'})).toBeNull();
    expect(await authorize({...example,googleSubject:'other-subject'})).toBeNull();
    expect(await authorize({...example,verifiedEmail:'another@hufs.ac.kr'})).toBeNull();
  });
  it('does not treat bare @hufs.ac.kr email as a valid signed Workspace claim',async()=>{
    const {authorize}=harness();
    expect(await authorize({...example,schoolWorkspaceVerified:false,hostedDomain:null})).toBeNull();
  });
  it('rejects revoked, stale, future, oversized and expired OTP evidence',async()=>{
    const invalid:BetaAdmissionProof[]=[
      {...approval,revokedAt:'2026-10-31T11:35:00.000Z'},
      {...approval,proofExpiresAt:'2026-10-31T12:00:00.000Z'},
      {...approval,proofVerifiedAt:'2026-10-31T13:00:00.000Z',
        proofExpiresAt:'2026-10-31T13:30:00.000Z'},
      {...approval,proofVerifiedAt:'2026-10-30T10:00:00.000Z',
        proofExpiresAt:'2026-10-31T12:30:00.000Z'},
      {...approval,approvedUntil:'2026-10-31T12:00:00.000Z'},
    ];
    for(const entry of invalid){
      const {authorize}=harness(entry);
      expect(await authorize(example)).toBeNull();
    }
  });
  it('rejects expiring Google identity and zero-time proof',async()=>{
    const {authorize}=harness();
    expect(await authorize({...example,identityProofExpiresAt:'2026-10-31T12:00:00.000Z'})).toBeNull();
    const other=harness({...approval,proofVerifiedAt:approval.proofExpiresAt});
    expect(await other.authorize(example)).toBeNull();
  });
  it('rechecks beta approval on every request and blocks mid-session revocation',async()=>{
    const {store}=harness();
    const recheck=createBetaSessionRechecker(store,{now});
    const actor={
      actorId:'google:'+example.googleSubject,role:'BETA' as const,
      sessionIdHash:'S'.repeat(64),sessionExpiresAt:example.identityProofExpiresAt,
      csrfToken:'C'.repeat(43),schoolMailProofExpiresAt:approval.proofExpiresAt,
      betaAllowed:true,verifiedSchoolEmail:example.verifiedEmail,
      schoolProofMethod:'SIGNED_WORKSPACE' as const,
    };
    expect(await recheck(actor)).toBe(true);
    store.setApproved({...approval,revokedAt:'2026-10-31T11:59:00.000Z'});
    expect(await recheck(actor)).toBe(false);
    store.setApproved({...approval,method:'MAILBOX_OTP',revokedAt:null});
    expect(await recheck(actor)).toBe(false);
    store.setApproved(approval);
    expect(await recheck({...actor,actorId:'google:some-other-sub'})).toBe(false);
    expect(await recheck({...actor,verifiedSchoolEmail:'wrong@hufs.ac.kr'})).toBe(false);
    expect(await recheck({...actor,verifiedSchoolEmail:undefined})).toBe(false);
  });
  it('fails closed on broken database reads and malformed records',async()=>{
    const faulty=createBetaAdmissionPolicy({
      readApproved:async()=>{throw new Error('DB unavailable');},
    },{now});
    await expect(faulty(example)).resolves.toBeNull();
    const store=new MemoryBetaAdmissionStore();
    expect(()=>store.setApproved({...approval,schoolEmail:'fake@gmail.com'})).not.toThrow();
    expect(await createBetaAdmissionPolicy(store,{now})(example)).toBeNull();
  });
});

describe('PostgreSQL beta grant reads',()=>{
  it('queries only an active subject/email/proof pair using placeholders, never inserts',async()=>{
    const calls:Array<{sql:string;values:readonly unknown[]}>=[],released:number[]=[];
    const connection:ReviewerSqlConnection={
      query:async(sql,values=[])=>{
        calls.push({sql,values});
        return {rows:[{
          google_subject:approval.googleSubject,
          school_email:approval.schoolEmail,
          method:approval.method,
          proof_verified_at:approval.proofVerifiedAt,
          proof_expires_at:approval.proofExpiresAt,
          approved_until:approval.approvedUntil,
          revoked_at:null,
        }]};
      },
      release:()=>{released.push(1);},
    };
    const pool:ReviewerSqlPool={connect:async()=>connection};
    const adapter=new PostgresBetaAdmissionStore(pool);
    expect(await createBetaAdmissionPolicy(adapter,{now})(example)).not.toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.values).toEqual([example.googleSubject,example.verifiedEmail,NOW.toISOString()]);
    expect(calls[0]?.sql).toContain('revoked_at IS NULL');
    expect(calls[0]?.sql).toContain('LIMIT 1');
    expect(released).toHaveLength(1);
  });
  it('returns no approved record when DB returned nothing',async()=>{
    const sql:ReviewerSqlConnection={query:async()=>({rows:[]}),release:()=>{}};
    expect(await new PostgresBetaAdmissionStore({
      connect:async()=>sql,
    }).readApproved({googleSubject:'x',schoolEmail:'x@hufs.ac.kr',at:NOW.toISOString()}))
      .toBeNull();
  });
});
