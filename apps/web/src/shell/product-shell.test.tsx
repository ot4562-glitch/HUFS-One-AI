// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {PageBanner, AreaNav} from './PageBanner.js';
import {AppShell} from './AppShell.js';
import {AREAS} from './areas.js';

afterEach(cleanup);

describe('product shell consistency', () => {
  it('keeps the synthetic-data disclaimer on public demo screens without a transport badge', () => {
    const props = {path: '/', navigate: () => {}, status: null, children: <p>기능 미리보기</p>};
    const view = render(<AppShell {...props} transportLabel={null} selector={<span>시연 사용자 선택</span>}/>);
    expect(screen.getByText('합성 데이터 시연')).toBeTruthy();
    view.rerender(<AppShell {...props} transportLabel={null} selector={null}/>);
    expect(screen.queryByText('합성 데이터 시연')).toBeNull();
    view.rerender(<AppShell {...props} transportLabel="합성 환경" selector={null}/>);
    expect(screen.getByText('합성 데이터 시연')).toBeTruthy();
  });
  it('renders the BETA and synthetic homes with the same direct heading and no invented CTA', () => {
    const {rerender} = render(<PageBanner path="/" title="오늘" navigate={() => {}} headingRef={null} />);
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('오늘');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/가능성을|개인화 홈|시작하기/)).toBeNull();
    rerender(<PageBanner path="/" title="내 실제 학업 자료" navigate={() => {}} headingRef={null} />);
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('내 실제 학업 자료');
  });

  it('preserves the area breadcrumb and makes the nonfunctional original menu opt-in', () => {
    const area = AREAS.find(a => a.id === 'jobs')!;
    render(<><PageBanner path="/opportunities" title="기회" navigate={() => {}} headingRef={null}/>
      <AreaNav area={area} path="/opportunities" navigate={() => {}} /></>);
    expect(within(screen.getByRole('navigation', {name: '현재 위치'})).getByRole('link', {name: '채용/고용24'}).getAttribute('href'))
      .toBe('/area/jobs');
    const nav = screen.getByRole('navigation', {name: '채용/고용24 메뉴'});
    expect(within(nav).getByRole('link', {name: '맞춤 기회'}).getAttribute('href')).toBe('/opportunities');
    const summary = within(nav).getByText(/원래 HUFSAbility 메뉴/);
    const disclosure = summary.closest('details') as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(within(nav).getAllByText('미지원')).toHaveLength(area.observed.length);
    fireEvent.click(summary);
    expect(disclosure.open).toBe(true);
    expect(within(nav).getAllByRole('link')).toHaveLength(area.ours.length + 1);
  });
});
