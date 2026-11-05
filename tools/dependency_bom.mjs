/**
 * Deterministic CycloneDX 1.6 pre-build dependency BOM from the offline audit.
 * Specification: https://cyclonedx.org/docs/1.6/json/
 * No registry calls, package execution, full-image claim or release approval.
 */
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditDependencyLicenses} from './audit_dependency_licenses.mjs';

const properties = values => Object.entries(values).map(([name,value])=>({
  name:'hufs:'+name,value:typeof value === 'string'?value:JSON.stringify(value),
}));
function component(entry){
  const knownName = entry.name !== 'UNKNOWN';
  const names = knownName?entry.name.split('/'):['Unresolved dependency'];
  const scoped = names.length === 2;
  const identity = knownName&&entry.version !== 'UNKNOWN';
  return {
    type:'library','bom-ref':'urn:hufs:dependency:'+entry.packageRef,
    ...(scoped?{group:names[0]}:{}),name:names.at(-1),
    ...(entry.version !== 'UNKNOWN'?{version:entry.version}:{}),
    ...(identity?{purl:'pkg:npm/'+names.map(encodeURIComponent).join('/')+'@'+encodeURIComponent(entry.version)}:{}),
    // A license name records the declaration. Do not pretend an arbitrary
    // declaration string is a validated SPDX identifier/expression.
    ...(entry.license.evidence === 'PRESENT'?{licenses:[{license:{name:entry.license.declaration}}]}:{}),
    // Manifest/license digests are evidence properties, never package artifact hashes.
    properties:properties({
      direct:entry.direct,usage:entry.usage,optional:entry.optional,
      sourceKind:entry.source.kind,
      ...(entry.source.origin?{registryOrigin:entry.source.origin}:{}),
      declaredRegistryIntegrity:entry.integrity,
      installedMetadataStatus:entry.installedMetadataStatus,
      ...(entry.installedMetadataSha256?{installedMetadataSha256:entry.installedMetadataSha256}:{}),
      licenseEvidence:entry.license.evidence,
      lockfileLicenseDeclaration:entry.license.declaredInLockfile,
      installedLicenseDeclaration:entry.license.declaredInInstalledPackage,
      licenseAndNoticeFileEvidence:entry.evidenceFiles,
    }),
  };
}

export function buildDependencyBom(root){
  const report=auditDependencyLicenses(root);
  const bom={
    bomFormat:'CycloneDX',specVersion:'1.6',version:1,
    // Timestamp/serial are optional. Omitting them makes this evidence reproducible.
    metadata:{
      lifecycles:[{phase:'pre-build'}],
      component:{type:'application',name:'HUFS One AI',
        'bom-ref':'urn:hufs:lockfile:'+report.lockfileSha256},
      properties:properties({
        evidenceScope:report.scope,lockfileSha256:report.lockfileSha256,
        inventoryStatus:report.inventoryStatus,releaseDecision:report.releaseDecision,
        dependencyGraph:'NOT_VERIFIED',...report.gates,
      }),
    },
    components:report.packages.map(component)
      .sort((left,right)=>left['bom-ref'].localeCompare(right['bom-ref'],'en')),
  };
  // Absence of a graph means unknown relationships, never a fabricated empty graph.
  return {bom,exitCode:report.inventoryStatus === 'COMPLETE_WITHIN_SCOPE'?0:1};
}

if(process.argv[1]&&resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);
    if(args.length !== 0&&(args.length !== 2||args[0] !== '--root'||!args[1]))throw Error();
    const {bom,exitCode}=buildDependencyBom(args[1]??dirname(dirname(fileURLToPath(import.meta.url))));
    process.stdout.write(JSON.stringify(bom)+'\n');
    process.exitCode=exitCode;
  }catch{
    process.stdout.write(JSON.stringify({status:'UNAVAILABLE',
      reason:'DEPENDENCY_BOM_UNAVAILABLE',releaseDecision:'RELEASE_BLOCKED'})+'\n');
    process.exitCode=2;
  }
}
