import {expect, test, type Page} from '@playwright/test';

/** SYNTHETIC dev mode only. Selects a demo subject through the accordion like a user would. */
async function pick(page: Page, index: number) {
  const accordion = page.locator('details.selector');
  if (!(await accordion.evaluate(d => (d as HTMLDetailsElement).open))) await page.locator('.selector__summary').click();
  await page.getByRole('group', {name: /시연 대상 선택/}).getByRole('radio').nth(index).check();
  await page.locator('.selector__summary').click(); // close again
}

async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
    offenders: Array.from(document.querySelectorAll('body *'))
      .filter(e => e.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 5).map(e => e.className),
  }));
}

const errors: string[] = [];
test.beforeEach(async ({page}) => {
  errors.length = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
});
test.afterEach(() => expect(errors).toEqual([]));

for (const width of [320, 360, 390, 768, 1440]) {
  test(`no horizontal overflow at ${width}px on 오늘·졸업·보관함·설정`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.goto('/');
    await expect(page.getByRole('note').first()).toContainText('합성 모의 연결');
    await pick(page, 0);
    await expect(page.getByRole('status').first()).toContainText('시연 대상: 가상 학생 1');
    await expect(page.getByRole('region', {name: '내 주요 일정'}).getByRole('button').first()).toBeVisible();
    for (const tab of ['졸업', '보관함']) {
      await page.getByRole('navigation', {name: '주요 메뉴'}).getByRole('link', {name: tab}).click();
      await expect(page.getByRole('heading', {level: 1})).toHaveText(tab);
      const o = await noHorizontalOverflow(page);
      expect(o.offenders, `${tab} @${width}`).toEqual([]);
      expect(o.scroll).toBeLessThanOrEqual(o.width);
    }
    await page.getByRole('link', {name: '설정'}).click();
    expect((await noHorizontalOverflow(page)).offenders).toEqual([]);
  });
}

test('keyboard only: skip link, open selector, choose a subject, reach the tabs', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/');
  await expect(page.locator('.selector__summary')).toBeVisible(); // app mounted
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', {name: '본문으로 건너뛰기'})).toBeFocused();
  await page.keyboard.press('Tab'); // logo
  await page.keyboard.press('Tab'); // 전체 메뉴 (#124)
  await page.keyboard.press('Tab'); // 설정
  await page.keyboard.press('Tab'); // selector summary
  await expect(page.locator('.selector__summary')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', {name: /시연 대상 선택/}).getByRole('radio').first()).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page.getByRole('status').first()).toContainText('시연 대상: 가상 학생 1');
  const focusRing = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(focusRing).not.toBe('none');
});

test("switching S01 → S02 shows only S02's cards, and a 403 subject shows nothing", async ({page}) => {
  await page.goto('/');
  await pick(page, 0);
  const featured = page.getByRole('region', {name: '나에게 맞춘 공고'}).getByRole('heading', {level: 3});
  await expect(featured).toHaveCount(3);
  const s01 = await featured.allTextContents();
  await pick(page, 1);
  await expect(page.getByRole('status').first()).toContainText('가상 학생 2');
  const s02 = await featured.allTextContents();
  expect(s02.some(t => s01.includes(t))).toBe(false);
  await pick(page, 3); // dev mode forces SHARING_REVOKED for S04
  await expect(page.getByRole('alert')).toContainText('공유 허용이 변경되었습니다.');
  await expect(page.getByRole('region', {name: '나에게 맞춘 공고'})).toHaveCount(0);
});

test('calendar: choosing a day lists its 마감/일정 with links', async ({page}) => {
  await page.goto('/');
  await pick(page, 0);
  const cal = page.getByRole('region', {name: '내 주요 일정'});
  const withItems = cal.getByRole('button', {name: /(마감|일정) \d+건/}).first();
  await withItems.click();
  await expect(withItems).toHaveAttribute('aria-pressed', 'true');
  await expect(cal.locator('.cal__day-detail').getByRole('link').first()).toBeVisible();
});

test('#79 D-day: calm label on the calendar deadline at 360px, spoken as days left, no overflow', async ({page}) => {
  await page.setViewportSize({width: 360, height: 900});
  await page.goto('/');
  await pick(page, 0);
  const cal = page.getByRole('region', {name: '내 주요 일정'});
  await cal.getByRole('button', {name: '11월 24일 화요일, 마감 1건'}).click();
  const link = cal.locator('.cal__day-detail').getByRole('link').first();
  await expect(link.locator('.dday [aria-hidden="true"]')).toHaveText('D-4');
  await expect(link).toHaveAccessibleName(/4일 남음/);
  const o = await noHorizontalOverflow(page);
  expect(o.scroll, JSON.stringify(o.offenders)).toBeLessThanOrEqual(o.width);
});

test('#80 application board: keyboard-only advance, self-record badge, no overflow at 360px', async ({page}) => {
  await page.setViewportSize({width: 360, height: 900});
  await page.goto('/applications');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('지원 현황');
  const interested = page.getByRole('region', {name: /^관심/});
  const first = interested.locator('.board__card').first();
  const title = await first.locator('h4').innerText();
  await first.getByRole('button', {name: '준비 시작'}).focus();
  await page.keyboard.press('Enter');
  const preparing = page.getByRole('region', {name: /^준비 중/});
  await expect(preparing.getByRole('listitem', {name: title})).toBeVisible();
  await expect(page.getByRole('region', {name: /^지원 완료/}).getByText('내가 기록함 · 확인되지 않음').first()).toBeVisible();
  const o = await noHorizontalOverflow(page);
  expect(o.scroll, JSON.stringify(o.offenders)).toBeLessThanOrEqual(o.width);
});

test('#124 sidebar at 1440px: whole HUFSAbility menu visible, 🚫 items never take keyboard focus', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/');
  const nav = page.getByRole('navigation', {name: '전체 메뉴'});
  await expect(nav).toBeVisible();
  await expect(nav.locator('.menu__item.is-off')).toHaveCount(24);
  await expect(nav.locator('a.menu__item')).toHaveCount(12); // 8 확장 + 4 공개 영역 공식 홈 링크
  // Tab through the sidebar: focus only ever lands on real links.
  await page.keyboard.press('Tab'); // skip link
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const tag = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON', 'SUMMARY', 'INPUT']).toContain(tag);
  }
  await nav.getByRole('link', {name: '지원 현황'}).click();
  await expect(page.getByRole('heading', {level: 1})).toHaveText('지원 현황');
});

test('#123 club board at 360px: recommendations, filter, detail; unapproved post never opens', async ({page}) => {
  await page.setViewportSize({width: 360, height: 900});
  await page.goto('/clubs');
  await pick(page, 0);
  const rec = page.getByRole('region', {name: '나에게 맞는 동아리'});
  await expect(rec.locator('.club').first()).toBeVisible();
  await expect(rec.getByText('가상 관리자 승인(시연)').first()).toBeVisible();
  await page.getByLabel('검색').fill('공방');
  await expect(page.getByRole('region', {name: '전체 모집 글'}).locator('.club')).toHaveCount(1);
  const o = await noHorizontalOverflow(page);
  expect(o.scroll).toBeLessThanOrEqual(o.width);
  await page.getByRole('region', {name: '전체 모집 글'}).getByRole('link', {name: /번역공방/}).click();
  await expect(page.getByRole('main')).toContainText('출처: 합성 데이터');
  await page.goto('/clubs/SYN-CLUB-014');
  await pick(page, 0);
  await expect(page.getByRole('main')).toContainText('지금 볼 수 있는 모집 글이 아니에요');
});

test('#85 settings: change interests, see same-asOf before/after, undo — no overflow at 360px', async ({page}) => {
  await page.setViewportSize({width: 360, height: 900});
  await page.goto('/settings');
  await pick(page, 0);
  await expect(page.getByText(/현재 설정 버전 0/)).toBeVisible();
  await page.getByRole('group', {name: /^관심 분야/}).getByRole('checkbox', {name: '무역·통상'}).check();
  await page.getByRole('button', {name: '바꿔서 비교하기'}).click();
  const compare = page.getByRole('region', {name: '바꾸기 전과 후'});
  await expect(compare).toContainText('BETA_OVERLAY:0 → BETA_OVERLAY:1');
  await page.getByRole('button', {name: '되돌리기'}).click();
  await expect(compare).toContainText('BETA_OVERLAY:1 → BETA_OVERLAY:2');
  const o = await noHorizontalOverflow(page);
  expect(o.scroll, JSON.stringify(o.offenders)).toBeLessThanOrEqual(o.width);
});

test('sandbox: save from a card, find it in 보관함, never for another subject', async ({page}) => {
  await page.goto('/');
  await pick(page, 0);
  const first = page.getByRole('region', {name: '나에게 맞춘 공고'}).getByRole('link').first();
  const title = await first.textContent();
  await first.click();
  await page.getByRole('button', {name: '보관함에 저장'}).click();
  await expect(page.getByRole('button', {name: '보관함에서 빼기'})).toBeVisible();
  await page.getByRole('navigation', {name: '주요 메뉴'}).getByRole('link', {name: '보관함'}).click();
  await expect(page.getByRole('region', {name: '저장한 공고'}).getByRole('link', {name: title!})).toBeVisible();
  await pick(page, 1);
  await expect(page.getByRole('region', {name: '저장한 공고'}).getByRole('link')).toHaveCount(0);
});

test('invite page on a non-canonical origin never renders or uses a fragment code', async ({page}) => {
  const code = 'A'.repeat(43);
  await page.goto(`/reviewer/invite#code=${code}`);
  await expect(page.getByRole('heading', {level: 1})).toHaveText('심사 초대 등록');
  await expect(page.getByText(/초대 코드가 없습니다/)).toBeVisible();
  expect(await page.content()).not.toContain(code.slice(0, 20) + 'AAAAAAAAAAAAAAAAAAAAAAA');
  await expect(page.locator('details.selector')).toHaveCount(0);
});

test('#81 졸업 요건 현황 + 수강계획 검사: side by side at 1440px, stacked at 360px without overflow', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/graduation');
  await pick(page, 0);
  const plan = page.getByRole('region', {name: '수강계획 검사'});
  await expect(plan.getByRole('status')).toHaveText('2027년 1학기 · 검토가 필요한 결과');
  const summary = page.getByRole('region', {name: '졸업 요건 현황'});
  const [s, p] = [await summary.boundingBox(), await plan.boundingBox()];
  expect(Math.abs(s!.y - p!.y)).toBeLessThan(4);
  expect(p!.x).toBeGreaterThan(s!.x);
  await page.setViewportSize({width: 360, height: 800});
  const [s2, p2] = [await summary.boundingBox(), await plan.boundingBox()];
  expect(p2!.y).toBeGreaterThan(s2!.y);
  await plan.getByLabel('검사할 학기').selectOption('2027-2');
  await expect(plan.getByText('이 학기에 저장된 수강계획이 없습니다.')).toBeVisible();
  const o = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, width: innerWidth}));
  expect(o.scroll).toBeLessThanOrEqual(o.width);
});

test('#119 정정 내역 at 360px: changed row first, text badge, no horizontal overflow', async ({page}) => {
  await page.setViewportSize({width: 360, height: 800});
  await page.goto('/opportunities/SYN-OPP-002');
  await pick(page, 0);
  const rev = page.getByRole('region', {name: '정정 내역'});
  await expect(rev.getByRole('status')).toContainText('정정된 항목 1개: 모집 마감 연장');
  await expect(rev.getByRole('row').nth(1)).toHaveAttribute('aria-label', /모집 마감: 연장/);
  const o = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, width: innerWidth}));
  expect(o.scroll).toBeLessThanOrEqual(o.width);
});

test('#144 주전공 · 이중전공 at 360px: one column, held row reason, no horizontal overflow', async ({page}) => {
  await page.setViewportSize({width: 360, height: 800});
  await page.goto('/graduation');
  await pick(page, 0);
  const dm = page.getByRole('region', {name: '주전공 · 이중전공 요건'});
  await expect(dm.getByRole('status')).toHaveText('이중전공: 선택함');
  await expect(dm.getByRole('list', {name: '이중전공 요건'}).getByRole('listitem').filter({hasText: 'SYN-DM-MAJOR-MIN'})).toContainText('보류');
  const [a, b] = await dm.locator('.dm__col').evaluateAll(cols => cols.map(c => c.getBoundingClientRect().top));
  expect(b!).toBeGreaterThan(a!); // stacked, not squeezed side by side
  const o = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, width: innerWidth}));
  expect(o.scroll).toBeLessThanOrEqual(o.width);
});

test('#141 /menu at 360px: manifest menus, no horizontal overflow, Tab skips 🚫 items', async ({page}) => {
  await page.setViewportSize({width: 360, height: 800});
  await page.goto('/menu');
  const main = page.getByRole('main');
  await expect(main.getByText('핵심역량 진단검사')).toBeVisible();
  await expect(main.locator('.menu__item.is-off')).toHaveCount(24);
  const o = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, width: innerWidth}));
  expect(o.scroll).toBeLessThanOrEqual(o.width);
  // Walk the whole Tab order once: no unsupported original menu ever takes focus.
  const focused: string[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    focused.push(await page.evaluate(() => (document.activeElement?.closest('.menu__item.is-off') ? 'OFF' : '') + (document.activeElement?.textContent ?? '')));
  }
  expect(focused.filter(f => f.startsWith('OFF'))).toEqual([]);
  expect(focused.some(f => f.includes('맞춤 기회'))).toBe(true);
});
