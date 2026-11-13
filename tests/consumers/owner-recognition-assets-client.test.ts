import {it,expect} from 'vitest';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
const activityId='SYN-ACTIVITY',assetId='asset-'+'a'.repeat(64),scope='b'.repeat(64),sha256='c'.repeat(64),now='2026-11-13T01:00:00Z',expiresAt='2026-11-13T01:02:00Z';
const common={state:'READY',activityId,asOf:now,expiresAt,contextVersion:scope,dataMode:'OWNER_CONSENTED'};
const item={assetId,assetVersion:'original-v1',proofId:'proof-'+'d'.repeat(64),activityId,mimeType:'image/png',size:1,sha256,recordedAt:now,
  provenance:'OWNER_UPLOADED_UNVERIFIED',officiallyRecognized:false,modelInputAllowed:false};
const command={requestId:'00000000-0000-4000-8000-000000000001',contextVersion:scope,mimeType:'image/png' as const,size:1,sha256,fileBase64:'Zg=='};
function harness(response:unknown){const calls:{path:string;init:RequestInit}[]=[];
  const client=new HufsApiClient(async(path,init)=>{calls.push({path,init});return new Response(JSON.stringify(path==='/api/auth/csrf'?{csrfToken:'C'.repeat(32)}:response),{headers:{'content-type':'application/json'}});});
  return {client,calls};
}
it('accepts maximum canonical base64 while rejecting invalid sizes and nonzero unused bits',()=>{
  expect(V.RecognitionAssetIntakeSchema.safeParse({...command,size:2*1024*1024,fileBase64:'A'.repeat(2_796_203)+'='}).success).toBe(true);
  for(const fileBase64 of ['Zg=','Zh==','Zg===','Zg==\n','Zg--','Zg==Zg=='])expect(V.RecognitionAssetIntakeSchema.safeParse({...command,fileBase64}).success).toBe(false);
  expect(V.RecognitionAssetIntakeSchema.safeParse({...command,size:2}).success).toBe(false);
});
it('reads current policy and list only for the requested activity',async()=>{
  const policy={...common,purpose:'PERSONAL_RECOGNITION_EVIDENCE',maxFileBytes:2*1024*1024,maxFilesPerActivity:10,allowedMimeTypes:['image/png']};
  const h=harness(policy);expect(await h.client.owner.getOwnerRecognitionAssetPolicy(activityId)).toEqual(policy);
  expect(h.calls[0]!.path).toBe('/api/owner/features/v2/recognition/'+activityId+'/assets/policy');
  expect(await harness({...common,items:[item]}).client.owner.getOwnerRecognitionAssets(activityId)).toMatchObject({items:[item]});
  await expect(harness({...common,activityId:'SYN-OTHER',items:[]}).client.owner.getOwnerRecognitionAssets(activityId)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
});
it('uploads with fresh CSRF and exact request, context, activity, bytes declaration and hash acknowledgment',async()=>{
  const result={...common,requestId:command.requestId,item},h=harness(result);
  expect(await h.client.owner.uploadOwnerRecognitionAsset(activityId,command)).toEqual(result);
  expect(h.calls.at(-1)).toMatchObject({path:'/api/owner/features/v2/recognition/'+activityId+'/assets',init:{method:'POST',body:JSON.stringify(command),headers:{'x-csrf-token':'C'.repeat(32)}}});
  for(const bad of [{...result,requestId:'00000000-0000-4000-8000-000000000002'},{...result,contextVersion:'e'.repeat(64)},
    {...result,item:{...item,sha256:'e'.repeat(64)}},{...result,item:{...item,size:2}},{...result,item:{...item,mimeType:'application/pdf'}}])
    await expect(harness(bad).client.owner.uploadOwnerRecognitionAsset(activityId,command)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
});
it('returns only bound pending erase receipts and does not route dot segments or malformed inputs',async()=>{
  const result={state:'READY',activityId,assetId,assetVersion:'original-v1',cleanupState:'PENDING',originalErased:true,allComponentsErased:false};
  const h=harness(result);expect(await h.client.owner.eraseOwnerRecognitionAsset(activityId,assetId,{assetVersion:'original-v1'})).toEqual(result);
  expect(h.calls.at(-1)).toMatchObject({path:'/api/owner/features/v2/recognition/'+activityId+'/assets/'+assetId+'/erase',init:{method:'POST'}});
  await expect(harness({...result,assetId:'asset-'+'e'.repeat(64)}).client.owner.eraseOwnerRecognitionAsset(activityId,assetId,{assetVersion:'original-v1'})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  const bad=harness(result);await expect(bad.client.owner.getOwnerRecognitionAssets('..')).rejects.toMatchObject({code:'INVALID_INPUT'});
  await expect(bad.client.owner.uploadOwnerRecognitionAsset(activityId,{...command,fileBase64:'Zh=='})).rejects.toMatchObject({code:'INVALID_INPUT'});expect(bad.calls).toEqual([]);
});
