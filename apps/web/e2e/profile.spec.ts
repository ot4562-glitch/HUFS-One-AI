import {expect, test} from '@playwright/test';

/** #132 blank demo account, SYNTHETIC dev mode only, 360px, keyboard first. */
const errors: string[] = [];
test.beforeEach(async ({page}) => {
  errors.length = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
});
test.afterEach(() => expect(errors).toEqual([]));

test('360px keyboard: 설정 beside the switcher → blank profile → errors → save → reset', async ({page}) => {
  await page.setViewportSize({width: 360, height: 800});
  await page.goto('/');
  const settings = page.locator('.app__account').getByRole('link', {name: '설정'});
  await expect(settings).toBeVisible();
  await settings.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', {level: 2, name: '시연 계정 설정'})).toBeVisible();
  await expect(page.getByText(/아직 아무것도 설정하지 않았어요/)).toBeVisible();
  await expect(page.getByLabel(/^주전공/)).toHaveValue('');
  await expect(page.getByLabel(/^취득 학점/)).toHaveValue('');

  // Save with nothing entered: errors on the fields, nothing saved.
  await page.getByRole('button', {name: '저장'}).click();
  await expect(page.getByLabel(/^주전공/)).toHaveAttribute('aria-invalid', 'true');

  // Fill by keyboard.
  await page.getByLabel(/^주전공/).fill('가상통계학과');
  await page.getByLabel(/^취득 학점/).fill('0');
  await page.getByRole('group', {name: /^내 관심 분야/}).getByRole('checkbox', {name: '데이터 분석'}).focus();
  await page.keyboard.press('Space');
  await page.getByRole('radio', {name: '있음'}).focus();
  await page.keyboard.press('Space');
  await page.getByLabel(/^이중전공 학과/).fill('가상경영학과');
  await page.getByRole('button', {name: '저장'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('저장된 설정 · 주전공 가상통계학과 · 취득 0학점')).toBeVisible();

  const o = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, width: innerWidth}));
  expect(o.scroll).toBeLessThanOrEqual(o.width);

  // Reset needs confirmation, then everything is blank again.
  await page.getByRole('button', {name: '시연 계정 초기화'}).click();
  await page.getByRole('alert').getByRole('button', {name: '초기화'}).click();
  await expect(page.getByText(/아직 아무것도 설정하지 않았어요/)).toBeVisible();
  await expect(page.getByLabel(/^주전공/)).toHaveValue('');
});
