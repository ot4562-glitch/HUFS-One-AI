// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {MENU_GROUPS} from './menuCatalog.js';
import {MenuTree} from './MenuTree.js';

afterEach(cleanup);

describe('interactive complete menu', () => {
  it('keeps all original entries on the initial view and searches without inventing links', () => {
    render(<MenuTree path="/menu" navigate={() => {}} variant="page"/>);
    const initial = document.querySelectorAll('.menu--page .menu__item').length;
    expect(initial).toBe(MENU_GROUPS.reduce((sum, group) => sum + group.items.length, 0));
    fireEvent.change(screen.getByRole('searchbox', {name: '메뉴 검색'}), {target: {value: '장학'}});
    expect(document.querySelectorAll('.menu--page .menu__item').length).toBeLessThan(initial);
    fireEvent.click(screen.getByRole('button', {name: '학교 참고 메뉴'}));
    expect(document.querySelectorAll('.menu--page .menu__item.is-off').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', {name: '전체 다시 보기'}));
    expect(document.querySelectorAll('.menu--page .menu__item').length).toBe(initial);
  });
});
