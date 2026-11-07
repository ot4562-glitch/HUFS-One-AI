import {z} from 'zod';

const ExperienceId=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);
const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Version=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1);
const Iso=z.iso.datetime({offset:true});
const Mime=z.enum(['image/png','image/jpeg','application/pdf']);

/** The application NEVER invents media permissions from a user-supplied URL.
 * Only a currently authenticated backend can issue an allowed upload policy. */
export const CareerAssetPolicySchema=z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('BLOCKED'),experienceId:ExperienceId,contentVersion:Version,
    reason:z.enum(['RIGHTS_NOT_VERIFIED','CONSENT_REQUIRED','STORAGE_UNAVAILABLE','REVOKED']),
  }),
  z.strictObject({state:z.literal('ALLOWED'),experienceId:ExperienceId,contentVersion:Version,
    dataMode:z.literal('OWNER_CONSENTED'),sourceRightsVersion:Ref,
    purpose:z.literal('PERSONAL_CAREER_EVIDENCE'),expiresAt:Iso,
    allowedMimeTypes:z.array(Mime).min(1).max(3)
      .refine(v=>new Set(v).size===v.length),
    maxFileBytes:z.number().int().positive().max(2*1024*1024),
  }),
]);
export const CareerAssetReceiptSchema=z.strictObject({
  experienceId:ExperienceId,contentVersion:Version,
  assetId:ExperienceId,sourceRightsVersion:Ref,
  size:z.number().int().positive().max(2*1024*1024),
  mimeType:Mime,sha256:z.string().regex(/^[0-9a-f]{64}$/),
  recordedAt:Iso,provenance:z.literal('OWNER_UPLOADED_UNVERIFIED'),
});
export const CareerAssetPageSchema=z.strictObject({
  experienceId:ExperienceId,contentVersion:Version,
  policy:CareerAssetPolicySchema,items:z.array(CareerAssetReceiptSchema).max(10),
}).superRefine((v,ctx)=>{
  if(v.policy.experienceId!==v.experienceId||v.policy.contentVersion!==v.contentVersion
    ||v.items.some(item=>item.experienceId!==v.experienceId||item.contentVersion!==v.contentVersion)
    ||new Set(v.items.map(item=>item.assetId)).size!==v.items.length)
    ctx.addIssue({code:'custom',message:'Owner asset list is not bound to current experience version'});
  if(v.policy.state==='BLOCKED'&&v.items.length>0)
    ctx.addIssue({code:'custom',message:'Blocked rights must not return any private attachment metadata'});
  if(v.policy.state==='ALLOWED'){
    const rights=v.policy.sourceRightsVersion;
    if(v.items.some(item=>item.sourceRightsVersion!==rights))
      ctx.addIssue({code:'custom',message:'Asset rights version differs from current grant'});
  }
});
export type CareerAssetPolicy=z.infer<typeof CareerAssetPolicySchema>;
export type CareerAssetReceipt=z.infer<typeof CareerAssetReceiptSchema>;
export type CareerAssetPage=z.infer<typeof CareerAssetPageSchema>;
