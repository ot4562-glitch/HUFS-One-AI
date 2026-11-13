// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {App} from '../App.js';
import {DemoController} from '../app/index.js';
import {SyntheticDemoClient} from '../dev/syntheticDemoClient.js';
import {appPages} from '../pages/index.js';
import {FEATURE_INVENTORY} from '../features/discovery/FeatureUniverse.js';
import type {HistoryPort} from './router.js';

afterEach(cleanup);

function fixedHistory(): HistoryPort {
  const port = {
    location: {pathname: '/'},
    history: {pushState: (_state: unknown, _title: string, path?: string | URL | null) => {
      port.location.pathname = String(path);
    }},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return port;
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
});

describe('employment-support business layout', () => {
  it('places approved-view data before feature navigation, without deleting the full menu inventory', async () => {
    render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'BUSINESS-LAYOUT')}
      historyPort={fixedHistory()} pages={appPages} />);
    await settle();

    const selector = screen.getByRole('group', {name: /시연 대상 선택/});
    fireEvent.click(within(selector).getAllByRole('radio')[0]!);
    await settle();

    const main = document.getElementById('main')!;
    const summary = main.querySelector('.summary');
    const dashboard = main.querySelector('.modules');
    const rail = main.querySelector('.product-rail');
    const directory = main.querySelector('.home-directory') as HTMLDetailsElement;
    expect(summary).not.toBeNull();
    expect(dashboard).not.toBeNull();
    expect(rail).not.toBeNull();
    expect(directory).not.toBeNull();
    expect(Boolean(summary!.compareDocumentPosition(dashboard!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(dashboard!.compareDocumentPosition(rail!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(rail!.compareDocumentPosition(directory) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(directory.open).toBe(false);
    expect(directory.querySelectorAll('.feature-universe__item')).toHaveLength(FEATURE_INVENTORY.length);

    fireEvent.click(directory.querySelector('summary')!);
    expect(directory.open).toBe(true);
    expect(directory.querySelector('a[href="/opportunities"]')).not.toBeNull();
  });

  it('maintains independent-project disclosure, all five mobile routes and real navigation targets', () => {
    render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'BUSINESS-NAV')}
      historyPort={fixedHistory()} pages={appPages} />);
    const nav = screen.getByRole('navigation', {name: '주요 메뉴'});
    expect(within(nav).getAllByRole('link').map(link => link.textContent))
      .toEqual(['오늘', '기회', '경험', '졸업', '보관함']);
    expect(document.querySelectorAll('.gnb__item')).toHaveLength(11);
    expect(screen.getAllByText(/학교 공식 서비스 아님|학교 공식 서비스가 아닌/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.product-rail__tile a')).toHaveLength(4);
  });

  it('uses current synthetic source deadlines in the factual hero and anchors only existing sections', async () => {
    render(<App controller={new DemoController(new SyntheticDemoClient({delayMs: 0}), 'SOURCE-BRIEF')}
      historyPort={fixedHistory()} pages={appPages} />);
    await settle();
    fireEvent.click(within(screen.getByRole('group', {name: /시연 대상 선택/})).getAllByRole('radio')[0]!);
    await settle();

    const brief = screen.getByRole('region', {name: '오늘 확인할 일'});
    const links = within(brief).getAllByRole('link');
    expect(links.some(link => link.getAttribute('href') === '/opportunities')).toBe(true);
    expect(links.some(link => link.getAttribute('href') === '/applications')).toBe(true);
    const sectionLinks = within(screen.getByRole('navigation', {name: '오늘 화면의 섹션 바로가기'})).getAllByRole('link');
    expect(sectionLinks).toHaveLength(4);
    for (const link of sectionLinks) {
      const target = link.getAttribute('href')!;
      expect(target.startsWith('#')).toBe(true);
      expect(document.getElementById(target.slice(1)), target).not.toBeNull();
    }
    const list = brief.querySelectorAll('.work-brief__list li');
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(3);
    expect(brief.textContent).toMatch(/D-[0-9]+|오늘 마감/);
  });
});
