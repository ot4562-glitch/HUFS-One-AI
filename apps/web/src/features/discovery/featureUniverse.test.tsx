// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {AREAS} from '../../shell/areas.js';
import {MENU_GROUPS} from '../../shell/menuCatalog.js';
import {FeatureUniverse, ProductRail, FEATURE_INVENTORY, buildFeatureInventory} from './FeatureUniverse.js';

afterEach(cleanup);

describe('complete feature universe', () => {
  it('enumerates every canonical catalog entry, every area screen, and every observed school menu', () => {
    const inventory = buildFeatureInventory();
    const ids = new Set(inventory.map(feature => feature.id));
    expect(ids.size).toBe(inventory.length);
    for (const group of MENU_GROUPS) for (const item of group.items) {
      expect(ids.has('catalog-' + group.id + '-' + item.id), item.label).toBe(true);
      if (item.route) expect(inventory.some(feature => feature.route === item.route), item.route).toBe(true);
    }
    for (const area of AREAS) {
      for (const screen of area.ours)
        expect(inventory.some(feature => feature.route === screen.route), screen.route).toBe(true);
      for (const label of area.observed)
        expect(inventory.some(feature => feature.label === label && feature.access === 'unavailable'), label).toBe(true);
    }
    for (const route of ['/graduation/what-if', '/settings', '/career', '/demo-profile',
      '/owner-intake', '/owner-ai', '/clubs/admin', '/reviewer/invite'])
      expect(inventory.some(feature => feature.route === route), route).toBe(true);
    expect(inventory.some(feature => feature.label === '로컬 합성 계정 실험실' && feature.access === 'local')).toBe(true);
    expect(FEATURE_INVENTORY.length).toBe(inventory.length);
  });

  it('only presents real routes as links and never makes missing school functions clickable', () => {
    render(<FeatureUniverse navigate={vi.fn()}/>);
    const unsupported = document.querySelectorAll('.feature-universe__item--unavailable');
    expect(unsupported.length).toBeGreaterThan(10);
    for (const element of unsupported) expect(element.querySelector('a')).toBeNull();
    const owner = FEATURE_INVENTORY.find(feature => feature.route === '/owner-scholarships')!;
    expect(owner.access).toBe('owner');
    expect(screen.getAllByText('본인 인증·승인 자료 필요').length).toBeGreaterThan(0);
    expect(document.querySelector('.feature-universe__item--owner a[href="/owner-scholarships"]')).not.toBeNull();
    expect(document.querySelector('.feature-universe__item--local a')).toBeNull();
  });

  it('filters by search, access and category and returns to all entries', () => {
    render(<FeatureUniverse navigate={vi.fn()}/>);
    const count = () => document.querySelectorAll('.feature-universe__item').length;
    const all = count();
    expect(all).toBe(FEATURE_INVENTORY.length);
    fireEvent.change(screen.getByRole('searchbox', {name: '기능 검색'}), {target: {value: '교환학생'}});
    expect(count()).toBeGreaterThan(0);
    expect(count()).toBeLessThan(all);
    fireEvent.click(screen.getByRole('button', {name: '학교 원본·미지원'}));
    expect(count()).toBeLessThan(all);
    fireEvent.click(screen.getByRole('button', {name: '검색 조건 초기화'}));
    expect(count()).toBe(all);
    fireEvent.change(screen.getByRole('combobox', {name: '분류'}), {target: {value: 'HUFS One AI 확장'}});
    expect(count()).toBe(MENU_GROUPS.find(group => group.id === 'hufs-one-ai')!.items.length);
  });

  it('offers real navigable paths on the editorial product tiles', () => {
    const navigate = vi.fn();
    render(<ProductRail navigate={navigate}/>);
    expect(document.querySelectorAll('.product-rail__tile a')).toHaveLength(4);
    fireEvent.click(screen.getByRole('link', {name: /FAQ·학사 안내/}));
    expect(navigate).toHaveBeenCalledWith('/faq');
    expect(document.querySelector('.product-rail__tile a[href="/opportunities"]')).not.toBeNull();
  });
});
