/** Offline-only seed inventory integrity check. No HTTP, scraping, student data or authorization. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ownPath=fileURLToPath(import.meta.url);
const defaults=new URL('./source-seeds.json',import.meta.url);
const knownStates=new Set(['DISCOVERY_SEED_ONLY','SOURCE_GAP','PRIVATE_INTAKE_REQUIRED']);

function nonempty(value,label){
  assert.equal(typeof value,'string',label+' must be a string');
  assert.ok(value.length>0 && value.trim()===value,label+' must be nonempty and trimmed');
}
function knownHufsUrl(value){
  const url=new URL(value);
  assert.equal(url.protocol,'https:','HTTPS required');
  assert.ok(url.hostname==='hufs.ac.kr'||url.hostname.endsWith('.hufs.ac.kr'),'HUFS domain only');
  assert.equal(url.username,'','credentials in seed URL');
  assert.equal(url.password,'','credentials in seed URL');
  assert.equal(url.hash,'','URL fragment in seed');
  assert.equal(url.port,'','nonstandard port in seed');
  return url;
}

/** These are discovery seeds, never an assertion that a record has been ingested. */
export function validateRegistry(registry){
  assert.equal(registry?.schemaVersion,1);
  assert.equal(registry?.project,'HUFS-One-AI');
  assert.equal(registry?.dataAcquisitionState,'NOT_COLLECTED');
  assert.ok(Array.isArray(registry.sources)&&registry.sources.length>0);
  assert.ok(Array.isArray(registry.domains)&&registry.domains.length>0);
  const sourceIds=new Set(),urls=new Set();
  for(const source of registry.sources){
    nonempty(source.id,'source id');
    assert.match(source.id,/^[A-Z0-9_]+$/);
    assert.ok(!sourceIds.has(source.id),'duplicate source id');
    sourceIds.add(source.id);
    const url=knownHufsUrl(source.url);
    const canonical=url.toString();
    assert.ok(!urls.has(canonical),'duplicate URL');
    urls.add(canonical);
    assert.ok(['PORTAL','CALENDAR','BOARD','INFORMATION','FAQ','SITEMAP','DEPARTMENT_SAMPLE','DOCUMENT'].includes(source.kind),'unknown source kind');
    assert.equal(source.discoveryEvidence,'OFFICIAL_SITE_SEARCH_RESULT');
    assert.equal(source.accessClass,'PUBLIC_ANONYMOUS_CANDIDATE');
    assert.equal(source.robots,'UNVERIFIED');
    assert.equal(source.terms,'UNVERIFIED');
    assert.equal(source.contentAcquired,false);
    assert.equal(source.sourceRevisionId,null);
  }
  const domainIds=new Set(),references=new Set();
  let privateCount=0,unmapped=0,seeded=0;
  for(const domain of registry.domains){
    nonempty(domain.id,'domain id');nonempty(domain.label,'domain label');
    assert.match(domain.id,/^[a-z0-9_]+$/);
    assert.ok(!domainIds.has(domain.id),'duplicate domain id');
    domainIds.add(domain.id);
    assert.ok(Array.isArray(domain.sourceIds));
    assert.ok(Array.isArray(domain.consumers)&&domain.consumers.length>0);
    assert.equal(domain.realRecordsInThisRegistry,0);
    assert.ok(knownStates.has(domain.readiness));
    assert.equal(new Set(domain.sourceIds).size,domain.sourceIds.length,'duplicate source reference');
    for(const ref of domain.sourceIds){
      assert.ok(sourceIds.has(ref),'unrecognized source reference: '+ref);
      references.add(ref);
    }
    if(domain.dataClass==='PRIVATE_OPT_IN'){
      privateCount++;
      assert.equal(domain.readiness,'PRIVATE_INTAKE_REQUIRED');
      assert.equal(domain.sourceIds.length,0,'private user sources must not use public crawls');
    }else{
      assert.equal(domain.dataClass,'PUBLIC_OR_STUDENT_COMMON');
      assert.equal(domain.readiness,domain.sourceIds.length?'DISCOVERY_SEED_ONLY':'SOURCE_GAP');
      if(domain.sourceIds.length)seeded++;else unmapped++;
    }
  }
  assert.equal(references.size,sourceIds.size,'some seeds are not mapped to any domain');
  assert.ok(domainIds.size>=20,'partial product coverage registry');
  return {seedCount:sourceIds.size,domainCount:domainIds.size,seededDomains:seeded,gapDomains:unmapped,privateDomains:privateCount,realRecordsInThisRegistry:0};
}
export async function loadRegistry(file=defaults){
  return JSON.parse(await readFile(file,'utf8'));
}
if(process.argv[1] && resolve(process.argv[1])===ownPath){
  const summary=validateRegistry(await loadRegistry());
  process.stdout.write(JSON.stringify({status:'SEEDS_VALID_NOT_INGESTED',...summary})+'\n');
}
