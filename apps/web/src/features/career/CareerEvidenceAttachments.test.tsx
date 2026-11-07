// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {
  CareerAssetPageSchema,CareerAssetPolicySchema,CareerAssetReceiptSchema,
  type OwnerWorkspaceRecord,
} from '@hufs-one/contracts';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {CareerEvidenceAttachments,type CareerEvidenceAssetPort} from './CareerEvidenceAttachments.js';

const now='2026-11-07T12:00:00Z';
const record:OwnerWorkspaceRecord={
  itemId:'exp1',version:2,updatedAt:now,
  value:{kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',state:'SELF_REPORTED',
    title:'본인 프로젝트',summary:'기록'},
};
const allowed={
  state:'ALLOWED',experienceId:'exp1',contentVersion:2,
  dataMode:'OWNER_CONSENTED',sourceRightsVersion:'rights-v2',
  purpose:'PERSONAL_CAREER_EVIDENCE',expiresAt:'2030-01-01T00:00:00Z',
  allowedMimeTypes:['image/png','application/pdf'],maxFileBytes:2048,
} as const;
const receipt={
  experienceId:'exp1',contentVersion:2,assetId:'asset1',
  sourceRightsVersion:'rights-v2',size:3,mimeType:'image/png',
  sha256:'a'.repeat(64),recordedAt:now,provenance:'OWNER_UPLOADED_UNVERIFIED',
} as const;
const blocked={state:'BLOCKED',experienceId:'exp1',contentVersion:2,reason:'RIGHTS_NOT_VERIFIED'} as const;

function fixture(policy:unknown=allowed){
  const session=new OwnerSessionController({getSession:async()=>({
    actorId:'owner-1',role:'BETA',schoolMailProofValid:true,betaAllowed:true,
  })});
  const list=vi.fn(async()=>({experienceId:'exp1',contentVersion:2,policy,items:[]}));
  const upload=vi.fn(async()=>receipt);
  const remove=vi.fn(async()=>({removed:true}));
  const port:CareerEvidenceAssetPort={list,upload,remove};
  return {session,port,list,upload,remove};
}
afterEach(()=>cleanup());
describe('#317 owner-rights attachment UX never bypasses #325 server',()=>{
  it('rejects a policy containing another account or revoked attachment metadata',()=>{
    expect(CareerAssetPolicySchema.safeParse({...allowed,experienceId:'other'}).success).toBe(true);
    expect(CareerAssetPageSchema.safeParse({
      experienceId:'exp1',contentVersion:2,policy:{...allowed,experienceId:'other'},items:[],
    }).success).toBe(false);
    expect(CareerAssetPageSchema.safeParse({
      experienceId:'exp1',contentVersion:2,policy:blocked,items:[receipt],
    }).success).toBe(false);
    expect(CareerAssetReceiptSchema.safeParse({...receipt,sourceRightsVersion:'old'}).success).toBe(true);
  });
  it('does not offer any file upload or invoke network when no server-side assets adapter exists',async()=>{
    const f=fixture();
    render(<CareerEvidenceAttachments record={record} session={f.session}/>);
    await f.session.initialize();
    await screen.findByText(/허가된 개인 증빙 파일 저장 API가 연결되지 않아/);
    expect(screen.queryByLabelText(/PNG\/JPEG\/PDF/)).toBeNull();
    expect(f.upload).not.toHaveBeenCalled();
  });
  it('does not show blocked files and refuses uploads without current rights policy',async()=>{
    const f=fixture(blocked);
    render(<CareerEvidenceAttachments record={record} session={f.session} port={f.port}/>);
    await f.session.initialize();
    await screen.findByText(/RIGHTS_NOT_VERIFIED/);
    expect(f.upload).not.toHaveBeenCalled();
    expect(screen.queryByRole('button',{name:'현재 권한으로 증빙 업로드'})).toBeNull();
  });
  it('accepts a bounded PNG only after explicit user file selection and server policy',async()=>{
    const f=fixture();render(<CareerEvidenceAttachments record={record} session={f.session} port={f.port}/>);
    await f.session.initialize();
    const input=await screen.findByLabelText(/허가된 PNG\/JPEG\/PDF/);
    const button=screen.getByRole('button',{name:'현재 권한으로 증빙 업로드'}) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const file=new File([new Uint8Array([1,2,3])],'sample.png',{type:'image/png'});
    fireEvent.change(input,{target:{files:[file]}});
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(()=>expect(f.upload).toHaveBeenCalledTimes(1));
    expect(f.upload.mock.calls[0]![2]).toBe(file);
    expect(f.upload.mock.calls[0]![1]).toMatchObject(allowed);
    expect(screen.queryByText(/학교에서 검증된 자격/)).toBeNull();
  });
  it('rejects oversized, unsafe MIME, non-owner and expired policies',async()=>{
    const f=fixture();render(<CareerEvidenceAttachments record={record} session={f.session} port={f.port}/>);
    await f.session.initialize();
    const input=await screen.findByLabelText(/허가된 PNG\/JPEG\/PDF/);
    const button=screen.getByRole('button',{name:'현재 권한으로 증빙 업로드'}) as HTMLButtonElement;
    fireEvent.change(input,{target:{files:[new File(['text'],'malware.exe',{type:'application/x-msdownload'})]}});
    expect(button.disabled).toBe(true);
    fireEvent.change(input,{target:{files:[new File([new Uint8Array(2500)],'big.png',{type:'image/png'})]}});
    expect(button.disabled).toBe(true);
    expect(f.upload).not.toHaveBeenCalled();
    expect(CareerAssetPolicySchema.safeParse({...allowed,expiresAt:'2020-01-01T00:00:00Z'}).success).toBe(true);
    expect(CareerAssetPageSchema.safeParse({experienceId:'exp1',contentVersion:2,policy:allowed,
      items:[{...receipt,sourceRightsVersion:'stale-rights'}]}).success).toBe(false);
  });
});
