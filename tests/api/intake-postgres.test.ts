import {describe,expect,it} from 'vitest';
import {PostgresRestrictedIntakeImport} from
  '../../apps/api/src/modules/academics/intake-postgres.js';
import {makeSyntheticIntake} from './synthetic-intake-fixture.js';

function local(approved=true){
  let connections=0,permissions=0;
  const service=new PostgresRestrictedIntakeImport({connect:async()=>{
    connections++;
    throw new Error('Preview must not open a DB connection');
  }},{mayProcess:async()=>{permissions++;return approved;}},
  ()=> '2026-10-31T00:00:00.000Z');
  return {service,connections:()=>connections,permissions:()=>permissions};
}
describe('TASK-07 private intake preparation (synthetic inputs only)',()=>{
  it('previews exactly four safely bound forms+course inputs without DB or raw data',async()=>{
    const h=local(),input=makeSyntheticIntake();
    const result=await h.service.preview(input);
    expect(result).toMatchObject({ready:true,formRowCount:4,
      nextState:'STUDENT_REVIEW_PENDING'});
    expect(Object.values(result.courseRowCounts)).toEqual([1,1,1,1]);
    expect(Object.values(result.creditCheckBySubject)).toEqual(['MATCH','MATCH','MATCH','MATCH']);
    expect(result.previewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('가상 기초과목');
    expect(JSON.stringify(result)).not.toContain('가상작성자');
    expect(h.connections()).toBe(0);
    expect(h.permissions()).toBe(4);
    expect((await h.service.preview(input)).previewHash).toBe(result.previewHash);
  });
  it('refuses parsing any potentially private text without operator+student purpose permission',async()=>{
    const h=local(false);
    await expect(h.service.preview(makeSyntheticIntake())).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(h.connections()).toBe(0);
  });
  it('never marks ambiguous or nonconsenting source documents as ready',async()=>{
    const h=local(),input=makeSyntheticIntake();
    const bad={...input,formsCsv:input.formsCsv.replace('"예"','"아니오"')};
    const result=await h.service.preview(bad);
    expect(result.ready).toBe(false);
    expect(result.issues.map(i=>i.code)).toContain('CONSENT_DENIED');
    expect(result).not.toHaveProperty('participants');
  });
  it('invalidates old preview receipts when operator, private alias or filename binding changes',async()=>{
    const h=local(),input=makeSyntheticIntake();
    const baseline=await h.service.preview(input);
    const changedActor=await h.service.preview({...input,actorRef:'SYN-OTHER-OPERATOR'});
    const changedAliases=await h.service.preview({...input,formsOptions:{
      ...input.formsOptions,subjectByDisplayName:{
        ...input.formsOptions.subjectByDisplayName,'synthetic-extra-alias':'SYN-INT-A',
      },
    }});
    const changedProof=await h.service.preview({...input,approvedFileBindings:
      input.approvedFileBindings.map((x,i)=>i===0
        ?{...x,verificationSource:'OWNER_STATEMENT' as const}:x)});
    for(const altered of [changedActor,changedAliases,changedProof])
      expect(altered.previewHash).not.toBe(baseline.previewHash);
  });
  it('rejects an unverified file swap even when all four files are present',async()=>{
    const h=local(),input=makeSyntheticIntake();
    const changed={...input,courseFiles:[...input.courseFiles].map((f,i)=>i===0
      ?{...f,filename:'이수과목_타인.csv'}:f)};
    const result=await h.service.preview(changed);
    expect(result.ready).toBe(false);
    expect(result.issues.map(i=>i.code)).toContain('UNAPPROVED_FILENAME');
  });
  it('flags a self-reported total mismatch for human review without asserting graduation',async()=>{
    const h=local(),input=makeSyntheticIntake();
    const edited={...input,formsCsv:input.formsCsv.replace('\"2\",\"0\"','\"9\",\"0\"')};
    const result=await h.service.preview(edited);
    expect(result.ready).toBe(true); // parse-ready is NOT student-verified/DEMO_READY
    expect(Object.values(result.creditCheckBySubject)).toContain('MISMATCH');
    expect(result.nextState).toBe('STUDENT_REVIEW_PENDING');
  });
  it('never applies a changed hash without matching preview receipt',async()=>{
    const input=makeSyntheticIntake(),h=local();
    const expectedVersions=Object.fromEntries(input.formsOptions.expectedSubjectKeys.map(x=>[x,0]));
    const result=await h.service.preview(input);
    await expect(h.service.apply(input,{previewHash:'f'.repeat(64),expectedVersions}))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
  });
  it('requires an explicit boolean purpose authorization',async()=>{
    await expect(local('yes' as unknown as boolean).service.preview(makeSyntheticIntake()))
      .rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it.each(['connection','row lock','revision write'] as const)(
    'rolls back the entire import when purpose rights are revoked during the %s',async stage=>{
      let allowed=true,released=0;
      const commands:string[]=[];
      const service=new PostgresRestrictedIntakeImport({connect:async()=>{
        if(stage==='connection')allowed=false;
        return {release:()=>{released++;},query:async(sql:string)=>{
          commands.push(sql);
          if(sql.includes('SELECT current_version')){
            if(stage==='row lock')allowed=false;
            return {rows:[{current_version:0,current_batch_sha256:null}]};
          }
          if(sql.includes('INSERT INTO api_intake_revisions')){
            if(stage==='revision write')allowed=false;
            return {rows:[{import_version:1}]};
          }
          if(sql.includes('UPDATE api_intake_heads'))return {rows:[{current_version:1}]};
          return {rows:[]};
        }};
      }},{mayProcess:async()=>allowed},()=> '2026-10-31T00:00:00.000Z');
      const input=makeSyntheticIntake(),preview=await service.preview(input);
      const expectedVersions=Object.fromEntries(input.formsOptions.expectedSubjectKeys.map(x=>[x,0]));
      await expect(service.apply(input,{previewHash:preview.previewHash,expectedVersions}))
        .rejects.toMatchObject({code:'FORBIDDEN'});
      expect(commands).toContain('ROLLBACK');
      expect(commands).not.toContain('COMMIT');
      expect(released).toBe(1);
    });
  it('uses the completion-time clock when rechecking purpose rights before commit',async()=>{
    let now='2026-10-31T00:00:00.000Z';
    const commands:string[]=[];
    const service=new PostgresRestrictedIntakeImport({connect:async()=>({
      release:()=>{},query:async(sql:string)=>{
        commands.push(sql);
        if(sql.includes('SELECT current_version'))
          return {rows:[{current_version:0,current_batch_sha256:null}]};
        if(sql.includes('INSERT INTO api_intake_revisions')){
          now='2026-10-31T00:01:00.000Z';
          return {rows:[{import_version:1}]};
        }
        if(sql.includes('UPDATE api_intake_heads'))return {rows:[{current_version:1}]};
        return {rows:[]};
      },
    })},{mayProcess:async input=>input.now<'2026-10-31T00:01:00.000Z'},()=>now);
    const input=makeSyntheticIntake(),preview=await service.preview(input);
    const expectedVersions=Object.fromEntries(input.formsOptions.expectedSubjectKeys.map(x=>[x,0]));
    await expect(service.apply(input,{previewHash:preview.previewHash,expectedVersions}))
      .rejects.toMatchObject({code:'FORBIDDEN'});
    expect(commands).toContain('ROLLBACK');
    expect(commands).not.toContain('COMMIT');
  });
});
