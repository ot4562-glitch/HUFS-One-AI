// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FeatureAdditions as C} from '@hufs-one/contracts';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerV2CatalogPanel,type OwnerV2CatalogPort} from './OwnerV2CatalogPanel.js';

const AT='2026-11-10T00:00:00Z';
const WHO='SYN-OWNER-A';
const identity=(actorId=WHO)=>({actorId,role:'BETA' as const,
  schoolMailProofValid:true as const,betaAllowed:true as const});
const item=(id:string):C.OpportunityCatalogItem=>({
  id,title:'합성 장학 '+id,summary:'권리 검증용 합성 내용',
  category:'SCHOLARSHIP',campus:'SEOUL',topicCodes:[],
  eligibility:'UNKNOWN',permitted:true,
  sourceUrl:'https://example.org/notices/'+id,
  source:{sourceId:'SYN-SOURCE',revisionId:'SYN-REV',status:'VERIFIED',
    rights:'CLEARED',verifiedAt:'2026-11-01T00:00:00Z',
    effectiveFrom:'2026-01-01T00:00:00Z',evidenceSpanIds:['p-1']},
});
const cursor='SYN-OPAQUE-CURSOR-16CHARS';
function ready(ids:string[],next:string|null){
  return C.OwnerV2CatalogResponseSchema.parse({
    state:'READY',sourceVersion:'SYN-REV',
    page:{items:ids.map(item),nextCursor:next,hasMore:next!==null,
      totalInAuthorizedScope:2,scope:'PERMITTED_APPROVED_SNAPSHOT',at:AT},
  });
}
function fixture(){
  let actor=WHO,connected=true;
  const session=new OwnerSessionController({getSession:async()=>identity(actor)});
  const search=vi.fn(async(query:Parameters<OwnerV2CatalogPort['search']>[0])=>{
    if(!connected)return C.OwnerV2CatalogResponseSchema.parse({
      state:'NOT_CONNECTED',asOf:AT,
    });
    return query?.cursor?ready(['SYN-OP-2'],null):ready(['SYN-OP-1'],cursor);
  });
  const port:OwnerV2CatalogPort={session,search};
  return {port,search,session,changeIdentity:(v:string)=>{actor=v;},
    disconnect:()=>{connected=false;}};
}
afterEach(cleanup);

describe('#447 owner V2 catalog actual form and signed-page interaction',()=>{
  it('uses all selected filters and sends identical filters plus cursor/asOf on continuation',async()=>{
    const f=fixture();
    render(<OwnerV2CatalogPanel port={f.port}/>);
    await screen.findByRole('button',{name:'검색'});
    fireEvent.change(screen.getByLabelText('승인된 공고에서 검색'),
      {target:{value:'장학'}});
    fireEvent.change(screen.getByLabelText('공고 유형'),
      {target:{value:'SCHOLARSHIP'}});
    fireEvent.change(screen.getByLabelText('캠퍼스'),
      {target:{value:'SEOUL'}});
    fireEvent.change(screen.getByLabelText('지원 자격 판정'),
      {target:{value:'UNKNOWN'}});
    fireEvent.change(screen.getByLabelText('마감일 이전 (한국 시간)'),
      {target:{value:'2026-11-30'}});
    fireEvent.click(screen.getByLabelText('마감된 공고 포함'));
    fireEvent.click(screen.getByRole('button',{name:'검색'}));
    expect(await screen.findByText('합성 장학 SYN-OP-1')).toBeTruthy();
    const first=f.search.mock.calls[0]?.[0];
    expect(first).toMatchObject({q:'장학',category:'SCHOLARSHIP',campus:'SEOUL',
      eligibility:'UNKNOWN',includeClosed:true,
      deadlineBefore:'2026-11-30T23:59:59.999+09:00',
      pageSize:10});
    fireEvent.click(screen.getByRole('button',{name:'다음 승인 페이지'}));
    expect(await screen.findByText('합성 장학 SYN-OP-2')).toBeTruthy();
    await waitFor(()=>expect(f.search).toHaveBeenCalledTimes(2));
    expect(f.search.mock.calls[1]?.[0]).toEqual({
      ...first,cursor,asOf:AT,
    });
    expect(screen.queryByText('합성 장학 SYN-OP-1')).toBeNull();
  });
  it('clears private results and old signed cursor on a filter change',async()=>{
    const f=fixture();
    render(<OwnerV2CatalogPanel port={f.port}/>);
    await screen.findByRole('button',{name:'검색'});
    fireEvent.click(screen.getByRole('button',{name:'검색'}));
    expect(await screen.findByText('합성 장학 SYN-OP-1')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('캠퍼스'),{target:{value:'GLOBAL'}});
    expect(screen.queryByText('합성 장학 SYN-OP-1')).toBeNull();
    expect(screen.queryByRole('button',{name:'다음 승인 페이지'})).toBeNull();
    expect(f.search).toHaveBeenCalledTimes(1);
  });
  it('keeps live mode NOT_CONNECTED instead of showing synthetic fallback results',async()=>{
    const f=fixture();f.disconnect();
    render(<OwnerV2CatalogPanel port={f.port}/>);
    await screen.findByRole('button',{name:'검색'});
    fireEvent.click(screen.getByRole('button',{name:'검색'}));
    expect((await screen.findByRole('status')).textContent).toContain('NOT_CONNECTED');
    expect(screen.queryByText('합성 장학 SYN-OP-1')).toBeNull();
  });
  it('removes previous owner results on identity change',async()=>{
    const f=fixture();
    render(<OwnerV2CatalogPanel port={f.port}/>);
    await screen.findByRole('button',{name:'검색'});
    fireEvent.click(screen.getByRole('button',{name:'검색'}));
    expect(await screen.findByText('합성 장학 SYN-OP-1')).toBeTruthy();
    f.changeIdentity('SYN-OWNER-B');
    await act(async()=>{await f.session.revalidate();});
    expect(screen.queryByText('합성 장학 SYN-OP-1')).toBeNull();
    expect(screen.queryByRole('button',{name:'다음 승인 페이지'})).toBeNull();
  });
});
