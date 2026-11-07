// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {z} from 'zod';
import {createIntegratedApi} from '../../../../api/src/integration.js';
import {MemoryApiRepository} from '../../../../api/src/repository.js';
import {MemorySyntheticClubDemoStore} from '../../../../api/src/dev/synthetic-club-store.js';
import {FileSyntheticClubPosterStore} from '../../../../api/src/modules/opportunities/synthetic-club-posters.js';
import {HufsOwnerApiClient,type BrowserRequest} from '../../integrations/owner-api-client.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerClubBoard} from './OwnerClubBoard.js';
import {ClubModerationPanel} from './ClubModerationPanel.js';
import {createOwnerClubPort,createClubModerationPort} from './ownerClubPort.js';

const at='2026-11-20T00:00:00.000Z',origin='https://synthetic.invalid';
const assetRoot=resolve('packages/fixtures/synthetic/clubs/generated');
const manifest=JSON.parse(readFileSync(join(assetRoot,'manifest.json'),'utf8'));
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{cleanup();vi.restoreAllMocks();await Promise.all(apps.splice(0).map(app=>app.close()));});
const flush=()=>act(async()=>{for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r,0));});
function fixture(){
  const base={sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
    sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
  let actorId='synthetic-admin',role:'ADMIN'|'BETA'|'REVIEWER'='ADMIN';
  const store=new MemorySyntheticClubDemoStore({'synthetic-student':'S01','synthetic-other':'S02'},()=>at);
  const app=createIntegratedApi({allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),now:()=>at,
    auth:{verifySession:async()=>role==='REVIEWER'
      ?{actorId,role,sessionIdHash:base.sessionIdHash,csrfToken:base.csrfToken,sessionExpiresAt:base.sessionExpiresAt,
        verifiedEmail:'synthetic-reviewer@example.invalid',identityProofExpiresAt:base.sessionExpiresAt}
      :({...base,actorId,role}),revokeSession:async()=>{}},adminAuthority:{isApproved:async()=>true},
    syntheticClubs:{source:store.source,publication:store.publication,moderation:store.moderation,
      posters:new FileSyntheticClubPosterStore(assetRoot,manifest)}});
  apps.push(app);
  const request:BrowserRequest=async(path,schema,options={})=>{
    const response=await app.inject({url:path,method:options.method??'GET',
      headers:{origin,'x-csrf-token':options.csrf??'',...(options.body===undefined?{}:{'content-type':'application/json'})},...(options.body===undefined?{}:{payload:JSON.stringify(options.body)})});
    if(response.statusCode>=400)throw new HufsApiError(response.json().error.code,response.statusCode);
    return schema.parse(response.json());
  };
  const api={owner:new HufsOwnerApiClient(request,async()=>({csrfToken:base.csrfToken})),
    getSession:(signal?:AbortSignal)=>request('/api/auth/session',z.unknown(),{signal})};
  return {app,api,store,role:(next:typeof role,id=next==='ADMIN'?'synthetic-admin':'synthetic-student')=>{role=next;actorId=id;}};
}
describe('#123 actual owner/admin browser integration',()=>{
  it('publishes through the UI, serves the generated asset, reranks and hides edited/revoked content',async()=>{
    const h=fixture(),moderation=createClubModerationPort(h.api);
    render(<ClubModerationPanel port={moderation}/>);await flush();
    fireEvent.change(screen.getByLabelText('가상 동아리 이름'),{target:{value:'가상동아리 AI 탐험대'}});
    fireEvent.change(screen.getByLabelText('모집 소개'),{target:{value:'합성 AI 로봇 프로젝트'}});
    fireEvent.click(screen.getByRole('button',{name:'검토 대기 글 만들기'}));await flush();
    let row=screen.getByRole('region',{name:'SYN-CLUB-090 검수'});
    expect(row.textContent).toContain('검토 대기');
    fireEvent.click(within(row).getByRole('button',{name:'승인'}));await flush();
    row=screen.getByRole('region',{name:'SYN-CLUB-090 검수'});expect(row.textContent).toContain('가상 승인');
    cleanup();h.role('BETA');
    const owner=createOwnerClubPort(h.api.owner,new OwnerSessionController(h.api));
    const view=render(<OwnerClubBoard port={owner} navigate={()=>{}}/>);await flush();
    expect(within(screen.getByRole('region',{name:'나에게 맞는 동아리'})).getByText('가상동아리 AI 탐험대')).toBeTruthy();
    const scope=screen.getByRole('combobox',{name:'동아리 범위'}) as HTMLSelectElement;
    expect(scope.value).toBe('ALL');
    fireEvent.change(scope,{target:{value:'INTERUNIVERSITY'}});
    expect(scope.value).toBe('INTERUNIVERSITY');
    expect(screen.getByText(/범위 분류는 기존 합성 공고의 메타데이터/)).toBeTruthy();
    // Local responsive illustrations may appear on cards; the large server PNG stays detail-only.
    expect(document.querySelector('img[src^="/api/synthetic/clubs/"]')).toBeNull();
    view.rerender(<OwnerClubBoard port={owner} id="SYN-CLUB-090" navigate={()=>{}}/>);await flush();
    const image=screen.getByRole('img',{name:/가상 학생 세 명/});
    expect(image.getAttribute('loading')).toBe('lazy');expect(image.getAttribute('width')).toBe('1672');
    expect(image.getAttribute('src')).toBe('/api/synthetic/clubs/SYN-CLUB-090/poster');
    const bytes=await h.app.inject({url:image.getAttribute('src')!});
    expect(bytes.statusCode).toBe(200);expect(bytes.rawPayload.length).toBe(1528702);
    cleanup();h.role('ADMIN');
    render(<ClubModerationPanel port={moderation}/>);await flush();
    row=screen.getByRole('region',{name:'SYN-CLUB-090 검수'});
    fireEvent.click(within(row).getByText('모집 내용 수정'));
    fireEvent.change(within(row).getByLabelText('소개 수정'),{target:{value:'수정 후 다시 검토할 합성 프로젝트'}});
    fireEvent.click(within(row).getByRole('button',{name:'수정 후 재검토'}));await flush();
    expect(screen.getByRole('region',{name:'SYN-CLUB-090 검수'}).textContent).toContain('검토 대기');
    cleanup();h.role('BETA');
    render(<OwnerClubBoard port={createOwnerClubPort(h.api.owner,new OwnerSessionController(h.api))} id="SYN-CLUB-090" navigate={()=>{}}/>);await flush();
    expect(screen.queryByText('수정 후 다시 검토할 합성 프로젝트')).toBeNull();expect(screen.queryByRole('img')).toBeNull();
    cleanup();h.role('ADMIN');
    render(<ClubModerationPanel port={moderation}/>);await flush();
    row=screen.getByRole('region',{name:'SYN-CLUB-090 검수'});
    fireEvent.click(within(row).getByRole('button',{name:'승인'}));await flush();
    row=screen.getByRole('region',{name:'SYN-CLUB-090 검수'});
    fireEvent.click(within(row).getByRole('button',{name:'승인 취소'}));await flush();
    cleanup();h.role('BETA');
    render(<OwnerClubBoard port={createOwnerClubPort(h.api.owner,new OwnerSessionController(h.api))} navigate={()=>{}}/>);await flush();
    expect(screen.queryByText('가상동아리 AI 탐험대')).toBeNull();
    expect((await h.app.inject({url:'/api/synthetic/clubs/SYN-CLUB-090/poster'})).statusCode).toBe(403);
  },20000);
  it('rejects BETA/REVIEWER admin entry and clears creation drafts after permission changes',async()=>{
    const h=fixture();h.role('BETA');
    render(<ClubModerationPanel port={createClubModerationPort(h.api)}/>);await flush();
    expect(screen.getByRole('alert').textContent).toContain('관리자');expect(screen.queryByLabelText('모집 소개')).toBeNull();
    cleanup();h.role('ADMIN');render(<ClubModerationPanel port={createClubModerationPort(h.api)}/>);await flush();
    expect(screen.getByLabelText('모집 소개')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('가상 동아리 이름'),{target:{value:'가상동아리 이전 임시 입력'}});
    fireEvent.change(screen.getByLabelText('합성 모집 ID'),{target:{value:'SYN-CLUB-093'}});
    fireEvent.change(screen.getByLabelText('모집 소개'),{target:{value:'권한 상실 뒤에는 지울 임시 내용'}});
    h.role('REVIEWER');fireEvent.click(screen.getByRole('button',{name:'승인 상태 새로고침'}));await flush();
    expect(screen.queryByLabelText('모집 소개')).toBeNull();expect(screen.getByRole('alert')).toBeTruthy();
    h.role('ADMIN');fireEvent.click(screen.getByRole('button',{name:'승인 상태 새로고침'}));await flush();
    expect((screen.getByLabelText('가상 동아리 이름') as HTMLInputElement).value).toBe('가상동아리 ');
    expect((screen.getByLabelText('합성 모집 ID') as HTMLInputElement).value).toBe('SYN-CLUB-090');
    expect((screen.getByLabelText('모집 소개') as HTMLTextAreaElement).value).toBe('');
  });
  it('never renders a late owner result after switching the live actor',async()=>{
    const h=fixture();h.role('BETA');
    const original=await h.api.owner.listSyntheticClubs();
    let resolve!:(value:typeof original)=>void;
    const session=new OwnerSessionController(h.api);
    render(<OwnerClubBoard port={{session,list:()=>new Promise(r=>{resolve=r;}),detail:(id,signal)=>h.api.owner.getSyntheticClub(id,signal)}} navigate={()=>{}}/>);
    await flush();h.role('BETA','synthetic-other');resolve(original);await flush();
    expect(screen.queryByRole('region',{name:'나에게 맞는 동아리'})).toBeNull();expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('drops a pending administrator list while hidden and reloads when visible',async()=>{
    const h=fixture(),base=createClubModerationPort(h.api),snapshot=await base.list();
    const pending:Array<{signal?:AbortSignal;resolve:(value:typeof snapshot)=>void}>=[];
    const port={...base,list:(signal?:AbortSignal)=>new Promise<typeof snapshot>(resolve=>pending.push({...(signal?{signal}:{}),resolve}))};
    const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
    render(<ClubModerationPanel port={port}/>);await flush();expect(pending).toHaveLength(1);
    visibility.mockReturnValue('hidden');fireEvent(document,new Event('visibilitychange'));await flush();
    expect(pending[0]!.signal?.aborted).toBe(true);
    pending[0]!.resolve(snapshot);await flush();expect(screen.queryByLabelText('모집 소개')).toBeNull();
    visibility.mockReturnValue('visible');fireEvent(document,new Event('visibilitychange'));await flush();
    expect(pending).toHaveLength(2);pending[1]!.resolve(snapshot);await flush();
    expect(screen.getByLabelText('모집 소개')).toBeTruthy();
    expect(screen.getByRole('combobox',{name:'분야'})).toBeTruthy();
    expect(screen.getByRole('combobox',{name:'캠퍼스'})).toBeTruthy();
  });

});
