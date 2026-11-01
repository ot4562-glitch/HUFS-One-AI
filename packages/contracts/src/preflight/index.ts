import {z} from 'zod';
import {SubjectAliasSchema} from '../identity/index.js';

export const PREFLIGHT_CHECKS=['AUTH','INGRESS','DATABASE','DATA_RIGHTS','PROVIDER','INDEPENDENT_REVIEW','BROWSER'] as const;
const Token=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
export const DemoPreflightStateSchema=z.strictObject({
  version:Token,asOf:z.iso.datetime({offset:true}),
  slots:z.array(z.strictObject({subject:SubjectAliasSchema,
    readiness:z.enum(['READY','PARTIAL','PENDING','REVOKED']),
    dataMode:z.enum(['SYNTHETIC','REAL_CONSENTED','MIXED']),
  })).length(5),
  checks:z.array(z.strictObject({id:z.enum(PREFLIGHT_CHECKS),
    state:z.enum(['PASS','FAIL','NOT_RUN']),evidenceRef:Token.optional(),
  })).length(PREFLIGHT_CHECKS.length),
}).superRefine((v,ctx)=>{
  if(new Set(v.slots.map(s=>s.subject)).size!==5)
    ctx.addIssue({code:'custom',path:['slots'],message:'Exactly one slot per subject required'});
  if(new Set(v.checks.map(c=>c.id)).size!==PREFLIGHT_CHECKS.length)
    ctx.addIssue({code:'custom',path:['checks'],message:'Every release gate must be reported once'});
  if(v.checks.some(c=>c.state==='PASS'&&!c.evidenceRef))
    ctx.addIssue({code:'custom',path:['checks'],message:'Passing gates require evidence references'});
});
export type DemoPreflightState=z.infer<typeof DemoPreflightStateSchema>;
export const DemoPreflightReportSchema=DemoPreflightStateSchema.safeExtend({
  readiness:z.enum(['READY','BLOCKED']),
}).superRefine((v,ctx)=>{
  const ready=v.slots.every(s=>s.readiness==='READY')&&v.checks.every(c=>c.state==='PASS');
  if((v.readiness==='READY')!==ready)
    ctx.addIssue({code:'custom',path:['readiness'],message:'Unverified release gates cannot become READY'});
});
export type DemoPreflightReport=z.infer<typeof DemoPreflightReportSchema>;
