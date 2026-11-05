import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {DEMO_AS_OF,DEMO_OPPORTUNITIES,DEMO_SPLIT} from '../../packages/core/src/opportunities/demo-corpus.js';
import {DEMO_LABELS,DEMO_STUDENTS} from '../../packages/core/src/opportunities/demo-profiles.js';
import {buildReviewPackage,emptyReviewTemplate} from '../../packages/core/src/evaluation/review-package.js';
import {createReviewerAuthority,emptyReviewLedger,importSignedReviewBatch,inspectReviewLedger} from '../../packages/core/src/evaluation/review-ledger.js';

function stable(value:any):string{return JSON.stringify(value===null||typeof value!=='object'?value:
  Array.isArray(value)?value.map(v=>JSON.parse(stable(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(stable(value[k]))])));}
const hash=(value:any)=>createHash('sha256').update(stable(value)).digest('hex');
const head='f'.repeat(40),now='2026-11-21T12:00:00.000Z';
function harness(){
  const packet=buildReviewPackage({targetCommit:head}),keys=generateKeyPairSync('ed25519');
  const der=keys.publicKey.export({type:'spki',format:'der'}),keyId=createHash('sha256').update(der).digest('hex');
  const config={schemaVersion:'reviewer-authority-v1',environment:'SYNTHETIC_TEST',registryId:'SYN-AUTHORITY',
    approvalEvidenceId:'SYN-AUTHORITY-EVIDENCE',approvedBy:'SYN-INTEGRATOR',approvedAt:'2026-11-21T00:00:00.000Z',
    reviewers:[{reviewerId:'SYN-REVIEWER',role:'INDEPENDENT_REVIEWER',keyId,publicKeySpki:der.toString('base64'),
      scopes:[{gateId:'D01',packageSha256:packet.packageSha256,targetCommit:head}],
      startsAt:'2026-11-21T00:00:00.000Z',expiresAt:'2026-11-22T00:00:00.000Z',revokedAt:null}]};
  const authority=createReviewerAuthority(config,hash(config)),ledger=emptyReviewLedger(packet);
  const record=(index=0)=>{
    const item=packet.cases[index]!;
    return {reviewId:'SYN-REVIEW-'+index,caseId:item.caseId,caseSha256:item.caseSha256,reviewedAt:now,
      decision:'LABELLED',assessment:{kind:'RECOMMENDATION',relevance:item.draft.relevance,eligibility:'UNKNOWN',
        conditions:item.conditions.map((c:any)=>({evidenceId:c.evidenceId,outcome:'UNKNOWN'}))},
      rationale:'Synthetic protocol test, not a person reading this case.',unknownReason:'Protocol-only assessment.',
      evidence:item.evidence.slice(0,1),reviewEvidenceId:'SYN-D01-CASE-'+index,
      amendsReviewId:null,correctionReason:null,anchor:{selected:false,reason:null}};
  };
  const payload=(records=[record()],previous=ledger.headHash)=>({schemaVersion:'review-submission-v1',gateId:'D01',
    submissionId:'SYN-SUBMISSION-1',signatureId:'SYN-SIGNATURE-1',packageSha256:packet.packageSha256,targetCommit:head,
    reviewerId:'SYN-REVIEWER',signedAt:now,expectedLedgerHead:previous,reviews:records});
  const signed=(value:any)=>({payload:value,signature:{algorithm:'Ed25519',keyId,
    value:sign(null,Buffer.from(stable(value)),keys.privateKey).toString('base64')}});
  return {packet,keys,keyId,config,authority,ledger,record,payload,signed};
}

describe('independent recommendation review package',()=>{
  it('derives 200 cases from the existing corpus, fixed split and single demo time',()=>{
    const packet=buildReviewPackage({targetCommit:head});
    expect(packet.datasetId).toBe('syn-corpus-v1');expect(packet.demoAsOf).toBe(DEMO_AS_OF);
    expect(packet.cases).toHaveLength(200);expect(packet.sources).toHaveLength(40);expect(packet.profiles).toHaveLength(5);
    expect(packet.cases.filter((c:any)=>c.split==='TUNING')).toHaveLength(100);
    expect(packet.cases.filter((c:any)=>c.split==='REPORT')).toHaveLength(100);
    for(const c of packet.cases){
      expect(c.split).toBe(DEMO_SPLIT[c.opportunityId]);expect(c.draft.relevance).toBe(DEMO_LABELS[c.profileId as keyof typeof DEMO_LABELS][c.opportunityId]);
      expect(c.draft.reviewerRole).toBe('TRACK_OWNER_SELF');
      const original=packet.sources.find((s:any)=>s.sourceId===c.sourceId)!;
      expect(createHash('sha256').update(original.text).digest('hex')).toBe(c.originalSha256);
      for(const e of c.evidence)expect(original.paragraphs.find((p:any)=>p.id===e.span.paragraphId)!.text.slice(e.span.start,e.span.end)).toBe(e.span.quote);
    }
    expect(new Set(packet.cases.map((c:any)=>c.opportunityId))).toEqual(new Set(DEMO_OPPORTUNITIES.map(o=>o.id)));
    expect(new Set(packet.cases.map((c:any)=>c.profileId))).toEqual(new Set(DEMO_STUDENTS.map(p=>p.subject)));
    expect(buildReviewPackage({targetCommit:head})).toEqual(packet);
  });
  it('exports blank independent labels and leaves all 200 human cases pending',()=>{
    const packet=buildReviewPackage({targetCommit:head}),template=emptyReviewTemplate(packet);
    expect(template.reviews).toHaveLength(200);
    expect(template.reviews.every((r:any)=>r.decision==='NOT_RUN'&&r.assessment===null&&r.reviewedAt===null)).toBe(true);
    const report=inspectReviewLedger(emptyReviewLedger(packet),packet,{now});
    expect(report.independentHumanLabelled).toBe(0);expect(report.pendingHumanCases).toBe(200);
    expect(report.independentGoldReview).toBe('PENDING');expect(report.syntheticSignedCases).toBe(0);
  });
});

describe('signed review import and immutable history',()=>{
  it('accepts cryptographically verified synthetic review without claiming human gold',()=>{
    const x=harness(),next=importSignedReviewBatch(x.ledger,x.packet,x.signed(x.payload()),{authority:x.authority,now});
    expect(x.ledger.entries).toHaveLength(0);expect(next.entries).toHaveLength(1);
    const report=inspectReviewLedger(next,x.packet,{authority:x.authority,now});
    expect(report.syntheticSignedCases).toBe(1);expect(report.independentHumanLabelled).toBe(0);
    expect(report.pendingHumanCases).toBe(200);expect(report.independentGoldReview).toBe('PENDING');
  });
  it('needs an independently trusted authority, not a reviewer name or a claimed human flag',()=>{
    const x=harness(),batch=x.signed(x.payload());
    expect(()=>importSignedReviewBatch(x.ledger,x.packet,batch,{now})).toThrow();
    expect(()=>importSignedReviewBatch(x.ledger,x.packet,{...batch,humanReviewed:true},{authority:x.authority,now})).toThrow();
    expect(()=>createReviewerAuthority(x.config,'0'.repeat(64))).toThrow();
  });
  it.each(['signature','scope','self-review','expired','revoked','source span','missing condition','same submission different bytes'] as const)
  ('refuses %s',kind=>{
    const x=harness();let config=structuredClone(x.config),record=x.record(),batch=x.signed(x.payload([record]));
    if(kind==='signature')batch.signature.value='A'.repeat(86)+'==';
    if(kind==='scope')config.reviewers[0]!.scopes[0]!.packageSha256='b'.repeat(64);
    if(kind==='self-review'){
      config.reviewers[0]!.reviewerId='github:qamarrchae';const p=x.payload();p.reviewerId='github:qamarrchae';batch=x.signed(p);
    }
    if(kind==='expired')config.reviewers[0]!.expiresAt='2026-11-21T01:00:00.000Z';
    if(kind==='revoked')(config.reviewers[0] as any).revokedAt='2026-11-21T01:00:00.000Z';
    if(kind==='source span'){record.evidence[0]!.span.quote='Invented quote';batch=x.signed(x.payload([record]));}
    if(kind==='missing condition'){record.assessment.conditions=[];batch=x.signed(x.payload([record]));}
    const authority=createReviewerAuthority(config,hash(config));
    if(kind==='same submission different bytes'){
      const first=importSignedReviewBatch(x.ledger,x.packet,batch,{authority,now}),p=x.payload();
      p.reviews[0]!.rationale='Different signed content, same submission identity.';
      expect(()=>importSignedReviewBatch(first,x.packet,x.signed(p),{authority,now})).toThrow();return;
    }
    expect(()=>importSignedReviewBatch(x.ledger,x.packet,batch,{authority,now})).toThrow();
  });
  it('is idempotent for exact signed replays and requires CAS plus correction lineage',()=>{
    const x=harness(),batch=x.signed(x.payload()),first=importSignedReviewBatch(x.ledger,x.packet,batch,{authority:x.authority,now});
    expect(importSignedReviewBatch(first,x.packet,batch,{authority:x.authority,now})).toEqual(first);
    const row=x.record();row.reviewId='SYN-REVIEW-CORRECTION';row.assessment.relevance=((row.assessment.relevance+1)%3) as 0|1|2;
    (row as any).amendsReviewId='SYN-REVIEW-0';(row as any).correctionReason='The independently re-read scope changes this label.';
    const p=x.payload([row],first.headHash);p.submissionId='SYN-SUBMISSION-2';p.signatureId='SYN-SIGNATURE-2';
    const second=importSignedReviewBatch(first,x.packet,x.signed(p),{authority:x.authority,now});
    expect(second.entries).toHaveLength(2);expect(second.entries[1]!.previousHash).toBe(first.headHash);
    const stale={...p,submissionId:'SYN-SUBMISSION-3',expectedLedgerHead:x.ledger.headHash};
    expect(()=>importSignedReviewBatch(second,x.packet,x.signed(stale),{authority:x.authority,now})).toThrow();
    const tampered=structuredClone(second);tampered.entries[0]!.submission.payload.reviews[0]!.rationale='tampered';
    expect(()=>inspectReviewLedger(tampered,x.packet,{authority:x.authority,now})).toThrow();
  });
  it('never upgrades 200 test signatures into 200 independent human labels',()=>{
    const x=harness(),records=x.packet.cases.map((_v:any,index:number)=>x.record(index));
    const ledger=importSignedReviewBatch(x.ledger,x.packet,x.signed(x.payload(records)),{authority:x.authority,now});
    const report=inspectReviewLedger(ledger,x.packet,{authority:x.authority,now});
    expect(report.syntheticSignedCases).toBe(200);expect(report.independentHumanLabelled).toBe(0);
    expect(report.independentGoldReview).toBe('PENDING');expect(report.pendingHumanCases).toBe(200);
  });
});

describe('retained adjudication after authority expires',()=>{
 it('retains readable unverified history while no expired record counts as human',()=>{
  const x=harness(),first=importSignedReviewBatch(x.ledger,x.packet,x.signed(x.payload()),{authority:x.authority,now});
  const keys=generateKeyPairSync('ed25519'),der=keys.publicKey.export({type:'spki',format:'der'}),keyId=createHash('sha256').update(der).digest('hex');
  const config={...x.config,reviewers:[...x.config.reviewers,{...x.config.reviewers[0]!,reviewerId:'SYN-ADJUDICATOR',
    role:'GOLD_ADJUDICATOR',keyId,publicKeySpki:der.toString('base64')}]};
  const authority=createReviewerAuthority(config,hash(config)),row:any=x.record();row.reviewId='SYN-ADJUDICATED';
  row.amendsReviewId='SYN-REVIEW-0';row.correctionReason='Independent adjudicator reconsidered the evidence.';
  const payload={...x.payload([row],first.headHash),submissionId:'SYN-ADJ-SUB',signatureId:'SYN-ADJ-SIG',reviewerId:'SYN-ADJUDICATOR'};
  const signed={payload,signature:{algorithm:'Ed25519',keyId,value:sign(null,Buffer.from(stable(payload)),keys.privateKey).toString('base64')}};
  const second=importSignedReviewBatch(first,x.packet,signed,{authority,now});
  expect(inspectReviewLedger(second,x.packet,{authority,now:'2026-11-23T00:00:00.000Z'})).toMatchObject({
    independentHumanLabelled:0,syntheticSignedCases:0,unverifiedCurrentRecords:1});
  expect(inspectReviewLedger(second,x.packet,{now})).toMatchObject({independentHumanLabelled:0,unverifiedCurrentRecords:1});
 });
});
