// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen,within} from '@testing-library/react';
import {HufsAbilityMenu} from './HufsAbilityMenu.js';
afterEach(cleanup);
it('retains all 24 original headings in five groups as unavailable, with four external-only entries',()=>{
  render(<HufsAbilityMenu/>);
  const navigation=screen.getByRole('region',{name:'HUFSAbility 기존 메뉴'});
  expect(within(navigation).getAllByRole('heading',{level:3}).filter(heading=>heading.textContent!=='공개 진입 4영역')).toHaveLength(5);
  expect(within(navigation).getAllByRole('button')).toHaveLength(24);
  expect(within(navigation).getAllByRole('button').every(button=>(button as HTMLButtonElement).disabled)).toBe(true);
  expect(within(navigation).getAllByRole('link')).toHaveLength(5);
});
