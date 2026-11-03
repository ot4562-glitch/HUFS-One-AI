// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {CourseCatalogPageSchema,CourseOfferingsPageSchema,OpportunityCatalogPageSchema} from '@hufs-one/contracts';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerCatalogPanel,type OwnerCatalogPort} from './OwnerCatalogPanel.js';

const at='2026-11-03T00:00:00.000Z',actor={actorId:'SYN-OWNER',
  role:'BETA' as const,schoolMailProofValid:true as const,betaAllowed:true as const};
const source={sourceId:'SYN-SOURCE',revisionId:'SYN-REV',
  permissionRef:'SYN-PERM',status:'SYNTHETIC' as const};
const course=(id:string)=>({courseId:id,courseCode:id,title:'가상 코딩 '+id,
  campus:'SEOUL',creditUnits:6,source});
const coursePage=(ids:string[],next:string|null=null)=>CourseCatalogPageSchema.parse({
  asOf:at,items:ids.map(course),nextCursor:next,
});
const opportunityPage=OpportunityCatalogPageSchema.parse({asOf:at,items:[],nextCursor:null});
const offerings=CourseOfferingsPageSchema.parse({
  asOf:at,nextCursor:null,items:[{courseId:'SYN-COURSE-A',term:'2027-1',
    status:'UNKNOWN',source}],
});
function setup(){
  let identity:unknown=actor;
  const session=new OwnerSessionController({getSession:async()=>identity});
  const port:OwnerCatalogPort={session,
    courses:vi.fn(async query=>query.afterId?coursePage(['SYN-COURSE-B']):coursePage(['SYN-COURSE-A'],'SYN-COURSE-A')),
    opportunities:vi.fn(async()=>opportunityPage),
    offerings:vi.fn(async()=>offerings),
    detail:vi.fn(async()=>{throw Error('No synthetic detail approved');}),
  };
  return {port,identity:(value:unknown)=>{identity=value;}};
}
afterEach(cleanup);
describe('BETA owner approved catalog browser',()=>{
  it('loads approved server pages without a public demo selector and requests exact course offering',async()=>{
    const f=setup();render(<OwnerCatalogPanel port={f.port}/>);
    await screen.findByRole('button',{name:/가상 코딩 SYN-COURSE-A/});
    expect(screen.getByText(/현재 BETA 본인이 접근 허용된/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:/가상 코딩 SYN-COURSE-A/}));
    expect(await screen.findByText(/2027-1 · UNKNOWN/)).toBeTruthy();
    expect(f.port.offerings).toHaveBeenCalledWith('SYN-COURSE-A',{limit:20},expect.any(AbortSignal));
  });
  it('pages with same approved asOf and rejects 1-char search before network access',async()=>{
    const f=setup();render(<OwnerCatalogPanel port={f.port}/>);
    await screen.findByRole('button',{name:/가상 코딩 SYN-COURSE-A/});
    fireEvent.click(screen.getByRole('button',{name:'다음 교과목'}));
    expect(await screen.findByRole('button',{name:/가상 코딩 SYN-COURSE-B/})).toBeTruthy();
    expect(f.port.courses).toHaveBeenCalledWith({
      limit:20,afterId:'SYN-COURSE-A',asOf:at},expect.any(AbortSignal));
    const previous=vi.mocked(f.port.courses).mock.calls.length;
    fireEvent.change(screen.getByLabelText('교과목·공고 이름 검색'),{target:{value:'A'}});
    fireEvent.click(screen.getByRole('button',{name:'승인된 자료 조회'}));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',
      '검색어는 비우거나 2~100자로 입력하세요.');
    expect(vi.mocked(f.port.courses).mock.calls.length).toBe(previous);
  });
  it('wipes page, detail and offerings on changed actor or revoked BETA session',async()=>{
    const f=setup();render(<OwnerCatalogPanel port={f.port}/>);
    await screen.findByRole('button',{name:/가상 코딩 SYN-COURSE-A/});
    f.identity({...actor,actorId:'SYN-OTHER'});
    await act(async()=>{await f.port.session.revalidate();});
    expect(screen.queryByText(/가상 코딩 SYN-COURSE-A/)).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('이전 교과목·공고 데이터를 모두 비웠습니다');
  });
});
