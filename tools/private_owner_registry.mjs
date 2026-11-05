/** Run after npm run build:api. No raw errors/values are ever printed.
 * node tools/private_owner_registry.mjs status
 * node tools/private_owner_registry.mjs attest attestation.json HEAD
 * node tools/private_owner_registry.mjs verify registry.json HEAD
 * attestation.json is an operator-authored restricted input containing explicit
 * bindings [{formsDisplayName,courseFilename,actorId,identityRef,method,evidenceRef}], evidenceRef,
 * verifiedAt, localReview:'VERIFIED'. No mapping is guessed by this tool.
 */
import {randomUUID} from 'node:crypto';
import Papa from 'papaparse';
import {validateCourseCsv} from '@hufs-one/contracts';
import {attestRegistry,registrySummary,resolveOwnerIntake,sourceDigest,formRowDigest,createRestrictedOwnerDirectory} from '../dist/apps/api/src/modules/private-intake/owner-registry.js';
import {readRestrictedJson,writeRestrictedJson,verifyRestrictedStorage,loadGitIntake} from './private_registry_io.mjs';
const print=value=>process.stdout.write(JSON.stringify(value)+'\n');
async function main(){
  const [command='status',filename='registry.json',revision='HEAD']=process.argv.slice(2);
  const now=new Date().toISOString();
  if(command==='status'){
    let registry=null;
    try{registry=attestRegistry(await readRestrictedJson('registry.json'),now);}catch{}
    print({...registrySummary(registry),storage:await verifyRestrictedStorage()?'ACL_VERIFIED':'NOT_VERIFIED'});return;
  }
  if(command==='verify'){
    const registry=attestRegistry(await readRestrictedJson(filename),now);
    resolveOwnerIntake(registry,{actorRef:'local-owner-operator',...loadGitIntake(revision)},now);
    print({...registrySummary(registry),sourceBindings:'VERIFIED',externalAuthentication:'NOT_RUN'});return;
  }
  if(command==='audit'){
    const r=attestRegistry(await readRestrictedJson(filename),now);
    const sources=loadGitIntake(revision);
    const directory=createRestrictedOwnerDirectory({loadRegistry:()=>readRestrictedJson(filename),
      verifyStorage:verifyRestrictedStorage,loadSources:async()=>loadGitIntake(revision)});
    let resolvedCount=0,rejectedCount=0,duplicateIssueCount=0,repeatedCourseGroups=0,transcriptNeedsReviewCount=0;
    const issueCounts={};
    for(const owner of r.owners){
      const result=await directory.resolve(owner.actorId);
      if(result)resolvedCount++;else rejectedCount++;
      if(result?.transcript.state==='NEEDS_REVIEW')transcriptNeedsReviewCount++;
      const file=sources.courseFiles.find(f=>f.filename===owner.mapping.courseFilename);
      const validation=validateCourseCsv(file?.content??'');
      for(const issue of validation.issues)issueCounts[issue.code]=(issueCounts[issue.code]??0)+1;
      duplicateIssueCount+=validation.issues.filter(i=>i.code==='COURSE_DUPLICATE_REVIEW').length;
      const terms=new Map();
      for(const row of validation.records){const set=terms.get(row.courseCode)||new Set();set.add(row.term);terms.set(row.courseCode,set);}
      repeatedCourseGroups+=[...terms.values()].filter(terms=>terms.size>1).length;
    }
    print({resolvedCount,rejectedCount,transcriptNeedsReviewCount,dataValidationStatus:rejectedCount||transcriptNeedsReviewCount?'NEEDS_REVIEW':'VALIDATED_STUDENT_REVIEW_PENDING',
      duplicateIssueCount,repeatedCourseGroups,issueCounts,offeringStatus:'UNKNOWN',rulesStatus:'NEEDS_REVIEW',personalValuesLogged:0});return;
  }
  if(command!=='attest')throw new Error('INVALID_COMMAND');
  const attestation=await readRestrictedJson(filename);
  if(!Array.isArray(attestation.bindings)||attestation.bindings.length!==4||attestation.localReview!=='VERIFIED')throw new Error('ATTESTATION_REQUIRED');
  const source=loadGitIntake(revision);
  const parsed=Papa.parse(source.formsCsv.replace(/^\uFEFF/,''),{skipEmptyLines:'greedy'});
  if(parsed.errors.length||parsed.data.length!==5)throw new Error('SOURCE_BINDING');
  // The session actor ID must come from a verified BETA identity attestation.
  // Random local-owner UUIDs are not usable by real authenticated accounts.
  const ownerIds=attestation.bindings.map(binding=>binding.actorId);
  const identityRefs=attestation.bindings.map(binding=>binding.identityRef);
  if(new Set(ownerIds).size!==4||new Set(identityRefs).size!==4
    ||ownerIds.some(v=>typeof v!=='string'||!/^[A-Za-z0-9_.:@-]{2,128}$/.test(v))
    ||identityRefs.some(v=>typeof v!=='string'||!/^[A-Za-z0-9_.:@-]{2,128}$/.test(v)))
    throw new Error('IDENTITY_ATTESTATION_REQUIRED');
  const owners=attestation.bindings.map(binding=>{
    const matches=parsed.data.slice(1).filter(row=>row[6]?.trim().normalize('NFKC')===binding.formsDisplayName?.trim().normalize('NFKC'));
    const file=source.courseFiles.find(f=>f.filename===binding.courseFilename);
    if(matches.length!==1||!file)throw new Error('SOURCE_BINDING');
    return {subjectKey:'owner-'+randomUUID(),actorId:binding.actorId,
      storageNamespace:'space-'+randomUUID(),identityRef:binding.identityRef,
      mapping:{method:binding.method,evidenceRef:binding.evidenceRef,verifiedAt:attestation.verifiedAt,
        formsRowSha256:formRowDigest(matches[0]),courseFilename:file.filename,courseSha256:sourceDigest(file.content),sourceVersion:1},
      consents:{selectedClova:'VERIFIED',refinedPrivateNcp:'VERIFIED',reviewedPseudonymousPresentation:'VERIFIED',localReview:'VERIFIED'},
      consentEvidenceRef:attestation.evidenceRef,revokedAt:null};
  });
  const registry=attestRegistry({schemaVersion:1,revision:1,formsSha256:sourceDigest(source.formsCsv),
    consentConfirmation:{verifiedAt:attestation.verifiedAt,evidenceRef:attestation.evidenceRef,confirmedCount:4},
    historicalGitPublication:'PENDING',internalSystemCollection:'PENDING',owners},now);
  resolveOwnerIntake(registry,{actorRef:'local-owner-operator',...source},now);
  await writeRestrictedJson('registry.json',registry);
  print({...registrySummary(registry),sourceBindings:'VERIFIED',externalAuthentication:'NOT_RUN'});
}
main().catch(()=>{print({status:'BLOCKED',code:'REGISTRY_OR_ATTESTATION_INVALID',personalValuesLogged:0});process.exitCode=1;});
