// @vitest-environment jsdom
import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {PUBLIC_CAREER_REFERENCE_SOURCES} from '@hufs-one/contracts';
import {OfficialCareerReferences} from './OfficialCareerReferences.js';

afterEach(()=>cleanup());
describe('student private career external official navigation',()=>{
  it('does not issue any API request or share owner profile/interest/grade parameters',()=>{
    render(<OfficialCareerReferences/>);
    expect(screen.getByRole('heading',{name:'외부 공식 진로·채용 참고처'})).toBeTruthy();
    const links=screen.getAllByRole('link');
    expect(links).toHaveLength(PUBLIC_CAREER_REFERENCE_SOURCES.length);
    for(const [i,link] of links.entries()){
      const expected=PUBLIC_CAREER_REFERENCE_SOURCES[i]!;
      const a=link as HTMLAnchorElement;
      expect(a.href).toBe(expected.url);
      expect(a.target).toBe('_blank');
      expect(a.rel).toContain('noopener');
      expect(a.rel).toContain('noreferrer');
      expect(new URL(a.href).search).toBe('');
      expect(a.href).not.toMatch(/actor|student|grade|apiKey|access-key|csrf|session/i);
    }
    expect(screen.getByText(/학생 기록·관심·지원 단계는 외부에 전송하지 않습니다/)).toBeTruthy();
  });
  it('does not claim official academic approval or live provider integration',()=>{
    render(<OfficialCareerReferences/>);
    expect(screen.getByText(/채용 공고 수집·게시 또는 실시간 추천 기능은 아닙니다/)).toBeTruthy();
    expect(screen.getByText(/별도의 검증된 서버 API, 출처별 이용권, 관리자 검토/)).toBeTruthy();
  });
});
