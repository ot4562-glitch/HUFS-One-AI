import {expect, test, type Page} from '@playwright/test';
import type {ApiErrorCode, SubjectAlias} from '@hufs-one/contracts';
import type {} from './prefinal-harness.js';

async function open(page: Page, screen = '/experience') {
  await page.goto(`/e2e/prefinal-harness.html?screen=${encodeURIComponent(screen)}`);
  await page.waitForFunction(() => !!window.__prefinal);
  await expect(page.locator('input[name="demo-subject"]')).toHaveCount(5);
}
async function pick(page: Page, subject: SubjectAlias) {
  const details = page.locator('details.selector');
  if (!await details.evaluate(e => (e as HTMLDetailsElement).open)) await page.locator('.selector__summary').click();
  await page.locator(`input[name="demo-subject"][value="${subject}"]`).check();
  await page.locator('.selector__summary').click();
  await expect.poll(() => page.evaluate(() => window.__prefinal.state().status)).toBe('READY');
}
const subjectCards = (page: Page, subject: SubjectAlias) => page.getByRole('article', {name: new RegExp(`가상 학생 ${Number(subject.slice(1))} ·`)});
const firstCard = (page: Page) => page.getByRole('article', {name: /데이터 분석 동아리/});
async function expectCurrent(page: Page, subject: SubjectAlias) {
  await expect(subjectCards(page, subject)).toHaveCount(3);
  await expect(page.locator('.exp-card')).toHaveCount(3);
  expect(await page.evaluate(() => window.__prefinal.state().selected)).toBe(subject);
}

test('#9/#258 all 20 directed five-subject switches and 10 A-B-A repetitions isolate experience state', async ({page}) => {
  test.setTimeout(90_000);
  await open(page);
  const subjects: SubjectAlias[] = ['S01', 'S02', 'S03', 'S04', 'S05'];
  const edges = new Set<string>();
  for (const from of subjects) for (const to of subjects) {
    if (from === to) continue;
    await pick(page, from); await expectCurrent(page, from);
    await page.getByLabel('새 경험 제목').fill(`UNSAVED-${from}`);
    await pick(page, to); await expectCurrent(page, to);
    await expect(page.getByLabel('새 경험 제목')).toHaveValue('');
    await expect(subjectCards(page, from)).toHaveCount(0);
    edges.add(`${from}>${to}`);
  }
  expect(edges.size).toBe(20);
  for (let round = 0; round < 10; round++) for (const subject of ['S01', 'S02', 'S01'] as const) {
    await pick(page, subject); await expectCurrent(page, subject);
  }
});

test('#9/#258 a late ignored-abort response cannot restore the previous student', async ({page}) => {
  await open(page);
  await page.evaluate(() => window.__prefinal.deferNextExperience());
  await pick(page, 'S01');
  await expect(page.getByText('경험 기록을 불러오는 중')).toBeVisible();
  await pick(page, 'S02'); await expectCurrent(page, 'S02');
  await page.evaluate(() => window.__prefinal.releaseExperience());
  await expectCurrent(page, 'S02');
  await expect(subjectCards(page, 'S01')).toHaveCount(0);
});

test('#9 two tabs retain their own subjects and both erase contents on session close', async ({page, context}) => {
  const other = await context.newPage();
  await open(page); await open(other);
  await pick(page, 'S01'); await pick(other, 'S03');
  await expectCurrent(other, 'S03');
  await pick(page, 'S02'); await expectCurrent(page, 'S02'); await expectCurrent(other, 'S03');
  await page.evaluate(() => window.__prefinal.closeSession());
  await expect(page.getByRole('alert')).toContainText('화면의 정보는 모두 지웠습니다');
  await expect(other.getByRole('alert')).toContainText('화면의 정보는 모두 지웠습니다');
  await expect(page.locator('.exp-card')).toHaveCount(0);
  await expect(other.locator('.exp-card')).toHaveCount(0);
  await other.close();
});

for (const code of ['UNAUTHENTICATED', 'FORBIDDEN', 'VERSION_CONFLICT', 'PROVIDER_UNAVAILABLE'] as const) {
  test(`#9 snapshot ${code} erases all previous subject content`, async ({page}) => {
    await open(page); await pick(page, 'S01'); await expectCurrent(page, 'S01');
    await page.evaluate(error => window.__prefinal.failSnapshot(error as ApiErrorCode), code);
    await page.evaluate(() => window.__prefinal.select('S02'));
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('.exp-card')).toHaveCount(0);
    expect(await page.evaluate(() => window.__prefinal.state().contextId)).toBeNull();
  });
  test(`#119 correction ${code} fails closed without displaying an older pair`, async ({page}) => {
    await open(page, '/opportunities/SYN-OPP-002');
    await page.evaluate(error => window.__prefinal.failRevision(error as ApiErrorCode), code);
    await page.evaluate(() => window.__prefinal.select('S01'));
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('region', {name: '정정 내역'})).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
  });
}

for (const code of ['VERSION_CONFLICT', 'PROVIDER_UNAVAILABLE'] as const) {
  test(`#258 approval ${code} re-reads and retains no false approval`, async ({page}) => {
    await open(page); await pick(page, 'S01'); await expectCurrent(page, 'S01');
    await page.evaluate(error => window.__prefinal.failApproval(error as ApiErrorCode), code);
    await firstCard(page).getByRole('checkbox', {name: '데이터 분석', exact: true}).check();
    await firstCard(page).getByRole('button', {name: '선택한 주제 승인'}).click();
    await expect(page.getByRole('alert')).toContainText(code === 'VERSION_CONFLICT' ? '다른 탭이나 기기' : '처리 결과를 확인할 수 없습니다');
    await expect(firstCard(page)).toContainText('아직 승인한 주제가 없습니다');
  });
}

for (const width of [320, 360, 390, 768, 1440]) {
  test(`#258 experience creates, approves and revokes at ${width}px with names and no overflow`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await open(page); await pick(page, 'S01'); await expectCurrent(page, 'S01');
    const accountCaption = await page.locator('.selector__caption').evaluate(el => ({
      height: el.getBoundingClientRect().height, lineHeight: Number.parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(accountCaption.height).toBeLessThanOrEqual(accountCaption.lineHeight + 1);
    await firstCard(page).getByRole('checkbox', {name: '데이터 분석', exact: true}).check();
    await firstCard(page).getByRole('button', {name: '선택한 주제 승인'}).focus();
    await page.keyboard.press('Enter');
    await expect(firstCard(page).getByRole('button', {name: '승인 취소'})).toBeVisible();
    await firstCard(page).getByRole('button', {name: '승인 취소'}).click();
    await expect(firstCard(page)).toContainText('승인을 취소했습니다');
    await page.getByLabel('새 경험 제목').fill('길게 쓰는 합성 자기 경험의 제목입니다 — 글자가 겹치지 않아야 합니다');
    await page.getByLabel('내가 한 일 (최대 500자)').fill('계획과 이수 사실을 구분하여 기록했습니다.\n합성 예시입니다.');
    await page.getByRole('button', {name: '내 경험 기록'}).click();
    await expect(page.getByRole('article', {name: /길게 쓰는 합성 자기 경험/})).toBeVisible();
    const overflow = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, width: innerWidth}));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.width);
    for (const control of await page.locator('main button, main input, main textarea').all()) {
      if (await control.isVisible()) await expect(control).toHaveAccessibleName(/\S/);
    }
    await expect(page.getByRole('heading', {level: 1})).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
  });
}

test('#9 keyboard Escape restores selector focus; reduced-motion and 200% layout retain named controls', async ({page}, testInfo) => {
  await page.setViewportSize({width: 768, height: 900});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await open(page); await pick(page, 'S01');
  await page.locator('.selector__summary').click();
  await page.locator('input[name="demo-subject"]').first().focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.selector__summary')).toBeFocused();
  expect(await page.locator('details.selector').evaluate(e => (e as HTMLDetailsElement).open)).toBe(false);
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(firstCard(page)).toBeVisible();
  const check = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const bounds = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter(el => !el.matches('.skip-link, .visually-hidden, .banner--ok'))
      .map(el => {
        const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
        return {tag: el.tagName, className: el.className, left: rect.left, right: rect.right, width: rect.width,
          client: el.clientWidth, scroll: el.scrollWidth, display: style.display,
          columns: style.gridTemplateColumns, minWidth: style.minWidth, whiteSpace: style.whiteSpace};
      });
    return {scroll: document.documentElement.scrollWidth, width,
      motion: getComputedStyle(document.querySelector('.exp-card')!).animationName,
      overflow: bounds.filter(el => el.width > 0 && (el.right > width + 1 || el.left < -1))
        .sort((a, b) => b.right - a.right || a.width - b.width).slice(0, 20),
      header: bounds.filter(el => /^(topbar__row|topbar__account|topbar__brand|app__brand-links)$/.test(el.className)),
      missingLabels: Array.from(document.querySelectorAll('[aria-labelledby]')).flatMap(el =>
        el.getAttribute('aria-labelledby')!.split(/\s+/).filter(id => !document.getElementById(id))),
    };
  });
  await page.screenshot({path: testInfo.outputPath('experience-zoom-200.png'), fullPage: true});
  expect(check.scroll, JSON.stringify({overflow: check.overflow, header: check.header})).toBeLessThanOrEqual(check.width);
  expect(check.header.find(el => el.className === 'topbar__brand')!.width).toBeGreaterThan(0);
  expect(check.motion).toBe('none');
  expect(check.missingLabels).toEqual([]);
});

test('#119 current credits and hypothetical major remain separate, unknown sharing has no zero credits', async ({page}) => {
  await open(page, '/graduation'); await pick(page, 'S01');
  await expect(page.locator('.credits')).toContainText('취득95학점');
  await expect(page.locator('.credits')).toContainText('수강 중18학점');
  await expect(page.locator('.credits')).toContainText('계획12학점');
  await expect(page.getByRole('region', {name: '개설 전망'})).toContainText('연구학기는 폐강을 뜻하지 않습니다');
  await page.getByRole('link', {name: '전공을 바꾸면? 가정 분석해 보기'}).click();
  await page.getByRole('button', {name: '가정 분석하기'}).click();
  await expect(page.getByRole('row', {name: /SYN-STAT-CORE: 새로 생기는 요건/})).toBeVisible();
  await page.getByRole('navigation', {name: '교과/비교과 메뉴'}).getByRole('link', {name: '졸업지원'}).click();
  await expect(page.locator('.credits')).toContainText('취득95학점');
  await pick(page, 'S03');
  await expect(page.locator('.credits')).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText('0학점');
});
