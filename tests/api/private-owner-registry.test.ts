import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import Papa from 'papaparse';
import {makeSyntheticIntake} from './synthetic-intake-fixture.js';
import {attestRegistry,registrySummary,resolveOwnerIntake,mayAccessOwner,sourceDigest,formRowDigest,createRestrictedOwnerDirectory} from '../../apps/api/src/modules/private-intake/owner-registry.js';

const now='2026-11-02T00:00:00.000Z';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function fixture(){
  const intake=makeSyntheticIntake();
  const rows=Papa.parse<string[]>(intake.formsCsv,{skipEmptyLines:'greedy'}).data.slice(1);
  const owners=intake.formsOptions.expectedSubjectKeys.map((subjectKey,i)=>({
    subjectKey,actorId:'synthetic-login-'+i,storageNamespace:'synthetic-space-'+i,
    identityRef:'synthetic-person-'+i,
    mapping:{method:'SUBJECT_CONFIRMATION',evidenceRef:'synthetic-attestation-'+i,verifiedAt:now,
      formsRowSha256:formRowDigest(rows[i]!),courseFilename:intake.courseFiles[i]!.filename,
      courseSha256:sourceDigest(intake.courseFiles[i]!.content),sourceVersion:1},
    consents:{selectedClova:'VERIFIED',refinedPrivateNcp:'VERIFIED',reviewedPseudonymousPresentation:'VERIFIED',localReview:'VERIFIED'},
    consentEvidenceRef:'synthetic-consent-'+i,revokedAt:null,
  }));
  return {intake,registry:{schemaVersion:1,revision:1,formsSha256:hash(intake.formsCsv),
    consentConfirmation:{verifiedAt:now,evidenceRef:'synthetic-four-consents',confirmedCount:4},
    historicalGitPublication:'PENDING',internalSystemCollection:'PENDING',owners}};
}
describe('restricted owner registry (synthetic only)',()=>{
  it('keeps confirmed consent separate from missing identity attestation',()=>{
    expect(registrySummary(null)).toEqual({ownersReady:0,mapping:'PENDING',
      confirmedConsentCounts:{selectedClova:4,refinedPrivateNcp:4,reviewedPseudonymousPresentation:4},historicalGitPublication:'PENDING',internalSystemCollection:'PENDING'});
  });
  it('binds verified identities to row contents and exact source hashes, independent of row order',()=>{
    const {intake,registry}=fixture();
    const approved=attestRegistry(registry,now);
    const loaded=resolveOwnerIntake(approved,intake,now);
    expect(loaded.formsOptions.expectedSubjectKeys).toHaveLength(4);
    expect(loaded.approvedFileBindings).toEqual(intake.approvedFileBindings);
    expect(mayAccessOwner(approved,'synthetic-login-0',registry.owners[1]!.subjectKey,'LOCAL_REVIEW',now)).toBe(false);
    expect(mayAccessOwner(approved,'synthetic-login-0',registry.owners[0]!.subjectKey,'SELECTED_CLOVA',now)).toBe(true);
    expect(()=>resolveOwnerIntake(approved,{...intake,formsCsv:intake.formsCsv+'\n'},now)).toThrow('SOURCE_BINDING');
  });
  it('rejects duplicated identities, reused rows and files, future attestations and revoked owners',()=>{
    for(const field of ['actorId','identityRef','storageNamespace'] as const){
      const {registry}=fixture();registry.owners[1]![field]=registry.owners[0]![field];
      expect(()=>attestRegistry(registry,now)).toThrow('REGISTRY_INVALID');
    }
    const {registry,intake}=fixture();registry.owners[1]!.mapping.formsRowSha256=registry.owners[0]!.mapping.formsRowSha256;
    expect(()=>attestRegistry(registry,now)).toThrow('REGISTRY_INVALID');
    const future=fixture();future.registry.owners[0]!.mapping.verifiedAt='2027-01-01T00:00:00.000Z';
    expect(()=>attestRegistry(future.registry,now)).toThrow('REGISTRY_INVALID');
    const revoked={...registry,owners:fixture().registry.owners.map((o,i)=>({...o,revokedAt:i===0?now:null}))};
    const approved=attestRegistry(revoked,now);
    expect(mayAccessOwner(approved,'synthetic-login-0',revoked.owners[0]!.subjectKey,'LOCAL_REVIEW',now)).toBe(false);
    expect(()=>resolveOwnerIntake(approved,intake,now)).toThrow('OWNER_REVOKED');
  });
  it('rejects tampered course source and never identifies by a matching filename',()=>{
    const {registry,intake}=fixture();const approved=attestRegistry(registry,now);
    intake.courseFiles[0]!.content+='\n';
    expect(()=>resolveOwnerIntake(approved,intake,now)).toThrow('SOURCE_BINDING');
  });
  it('isolates per-owner revocation and rechecks after source reads',async()=>{
    const {registry,intake}=fixture();
    const raw:unknown={...registry,owners:registry.owners.map((o,i)=>({...o,revokedAt:i===1?now:null}))};
    let current=raw;
    const directory=createRestrictedOwnerDirectory({loadRegistry:async()=>current,
      verifyStorage:async()=>true,loadSources:async()=>intake,now:()=>now});
    expect(await directory.resolve('synthetic-login-0')).toMatchObject({actorId:'synthetic-login-0',transcript:{state:'STUDENT_REVIEW_PENDING'}});
    expect(await directory.resolve('synthetic-login-1')).toBeNull();
    current={...registry,owners:registry.owners.map((o,i)=>({...o,revokedAt:i===0?now:null}))};
    expect(await directory.resolve('synthetic-login-0')).toBeNull();
    const raced=createRestrictedOwnerDirectory({loadRegistry:async()=>current,
      verifyStorage:async()=>true,loadSources:async()=>{current={...registry,revision:2};return intake;},now:()=>now});
    current=registry;
    expect(await raced.resolve('synthetic-login-0')).toBeNull();
  });
  it('preserves an attested owner profile while quarantining an invalid transcript',async()=>{
    const {registry,intake}=fixture();
    intake.courseFiles[0]!.content='invalid,invalid\nprivate,source';
    registry.owners[0]!.mapping.courseSha256=sourceDigest(intake.courseFiles[0]!.content);
    const directory=createRestrictedOwnerDirectory({loadRegistry:async()=>registry,
      verifyStorage:async()=>true,loadSources:async()=>intake,now:()=>now});
    expect(await directory.resolve('synthetic-login-0')).toMatchObject({actorId:'synthetic-login-0',
      transcript:{state:'NEEDS_REVIEW',records:[],issueCodes:['HEADER_MISMATCH','HEADER_DUPLICATE']}});
  });
});
