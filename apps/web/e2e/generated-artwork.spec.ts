import {expect, test, type Page} from '@playwright/test';

async function selectFirst(page: Page) {
  const selector = page.locator('details.selector');
  if (!(await selector.evaluate(el => (el as HTMLDetailsElement).open))) await selector.locator('summary').click();
  await page.getByRole('group', {name: /시연 대상 선택/}).getByRole('radio').first().check();
  await expect(page.getByRole('status').first()).toContainText('가상 학생 1');
  await selector.locator('summary').click();
}

for (const width of [320, 360, 390, 768, 1440]) {
  test(`#296 synthetic images and galleries stay readable at ${width}px`, async ({page}, info) => {
    await page.setViewportSize({width, height: 900});
    for (const route of ['clubs', 'opportunities']) {
      await page.goto(`/${route}`);
      await selectFirst(page);
      const images = page.locator('main .synthetic-art img');
      await expect(images.first()).toBeVisible();
      await expect.poll(() => images.first().evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await page.locator('.synthetic-gallery summary').click();
      await expect(page.locator('.synthetic-gallery__grid > li')).toHaveCount(6);
      await expect(page.locator('.synthetic-gallery__grid > li img')).toHaveCount(6);
      await expect(page.locator('.synthetic-gallery')).toContainText('실제 모집·지원 대상이 아니며 신청할 수 없어요');
      // A full-page capture does not scroll each lazy image into the viewport.
      // Freeze the count so a failed image disappearing into a fallback also fails this check.
      const imageCount = await images.count();
      for (let index = 0; index < imageCount; index++) {
        const image = images.nth(index);
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate(el => {
          const img = el as HTMLImageElement;
          return img.complete && img.naturalWidth > 0;
        })).toBe(true);
        await image.evaluate(el => (el as HTMLImageElement).decode());
      }
      await expect(images).toHaveCount(imageCount);
      await page.evaluate(() => window.scrollTo({top: 0, left: 0, behavior: 'instant'}));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflow).toBe(false);
      await page.screenshot({path: info.outputPath(`${route}-${width}.png`), fullPage: true});
    }
  });
}

test('#296 blocked image falls back without exposing hidden club posts', async ({page}) => {
  await page.route('**/*technology-*.webp', route => route.abort());
  await page.goto('/clubs');
  await selectFirst(page);
  const first = page.getByRole('region', {name: '나에게 맞는 동아리'}).locator('.club').first();
  await expect(first.locator('svg[role="img"]')).toBeVisible();
  await expect(first).toContainText('가상 동아리 · 데모');
  await page.goto('/clubs/SYN-CLUB-014');
  await selectFirst(page);
  await expect(page.getByRole('main')).toContainText('지금 볼 수 있는 모집 글이 아니에요');
  await expect(page.locator('main .synthetic-art')).toHaveCount(0);
});

test('#296 club and opportunity detail preserve the selected artwork', async ({page}) => {
  await page.goto('/clubs');
  await selectFirst(page);
  const card = page.getByRole('region', {name: '나에게 맞는 동아리'}).locator('.club').first();
  const alt = await card.locator('img').getAttribute('alt');
  await card.getByRole('link').click();
  await expect(page.locator('.club-detail img')).toHaveAttribute('alt', alt!);
  await page.goto('/opportunities');
  await selectFirst(page);
  const opportunity = page.locator('.opp').first();
  const opportunityAlt = await opportunity.locator('img').getAttribute('alt');
  await opportunity.getByRole('link', {name: /자세히 보기/}).click();
  await expect(page.locator('.opportunity-detail-art img')).toHaveAttribute('alt', opportunityAlt!);
});
