import { expect, test } from '@playwright/test';

test('quick recommendations and random styling preserve personal content without publishing automatically', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/admin');
  await page.getByLabel('신부 이름', { exact: true }).fill('권주영');
  await page.getByLabel('신부 영문 이름', { exact: true }).fill('Our Juyoung');
  await page.getByLabel('초대 문구', { exact: true }).fill('두 사람이 직접 쓴 소중한 초대 문구입니다.');
  await page.getByRole('button', { name: '디자인', exact: true }).click();
  await expect(page.locator('.design-advanced')).toHaveJSProperty('open', false);
  await expect(page.getByRole('button', { name: /추천 스타일$/ })).toHaveCount(4);
  await page.getByRole('button', { name: '다정한 손편지 추천 스타일', exact: true }).click();
  const preview = page.locator('.editor-preview .invitation');
  await expect(preview).toHaveAttribute('data-font', 'handwriting');
  await expect(preview).toHaveAttribute('data-background', 'paper');
  await expect(preview).toContainText('두 사람이 직접 쓴 소중한 초대 문구입니다.');
  let previous = await preview.evaluate(el => [el.getAttribute('data-template'), el.getAttribute('data-theme'), el.getAttribute('data-font'), el.getAttribute('data-background')]);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '랜덤 스타일 추천', exact: true }).click();
    const current = await preview.evaluate(el => [el.getAttribute('data-template'), el.getAttribute('data-theme'), el.getAttribute('data-font'), el.getAttribute('data-background')]);
    expect(current).not.toEqual(previous); previous = current;
    await expect(preview).toContainText('Our Juyoung');
    await expect(preview.locator('.invite-letter-copy')).toHaveText('두 사람이 직접 쓴 소중한 초대 문구입니다.');
    await expect(preview.locator('[data-section="verse"]')).toHaveCount(0);
    await expect(preview.locator('[data-section="blessing"]')).toHaveCount(0);
  }
  await expect(page.locator('.design-selection-status')).toContainText('아직 저장하거나 공개하지 않았어요');
  const publicPage = await context.newPage();
  await publicPage.goto('/');
  await expect(publicPage.locator('.invitation')).toHaveAttribute('data-background', 'plain');
  await expect(publicPage.locator('.invitation')).not.toContainText('두 사람이 직접 쓴 소중한 초대 문구입니다.');
  await publicPage.close();
  await page.getByRole('button', { name: '이 조합 미리보기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '청첩장 실시간 미리보기' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '청첩장 실시간 미리보기' })).not.toBeVisible();
  await expect(page.locator('a[href="#/setup"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /연결 안내/ })).toHaveCount(0);
  await expect(page).toHaveURL(/#\/admin$/);
  await expect(preview).toContainText('두 사람이 직접 쓴 소중한 초대 문구입니다.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('advanced typography and background controls are optional and reflect in the invitation', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#/admin');
  await page.getByRole('button', { name: '디자인', exact: true }).click();
  await page.locator('summary[aria-label="직접 세부 꾸미기"]').click();
  await expect(page.getByRole('group', { name: '글꼴 선택', exact: true }).getByRole('button')).toHaveCount(5);
  await page.getByRole('button', { name: '클래식 명조', exact: true }).click();
  await page.getByRole('button', { name: '작은 별빛 배경', exact: true }).click();
  await page.getByRole('button', { name: '미드나잇 블루', exact: true }).click();
  const preview = page.locator('.editor-preview .invitation');
  await expect(preview).toHaveAttribute('data-font', 'myeongjo');
  await expect(preview).toHaveAttribute('data-background', 'starlight');
  await expect(preview).toHaveAttribute('data-theme', 'midnight');
  await page.getByRole('button', { name: '다정한 손글씨', exact: true }).click();
  await page.getByRole('button', { name: '흩날리는 꽃잎 배경', exact: true }).click();
  await expect(preview).toHaveAttribute('data-font', 'handwriting');
  await expect(preview).toHaveAttribute('data-background', 'petals');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
