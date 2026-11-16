import { expect, test } from './helpers';

test('the illustration can replace a photo cover without deleting the photo and survives reload', async ({ page }) => {
  await page.goto('/#/admin');
  await page.getByRole('button', { name: '사진', exact: true }).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'our-cover.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4+vrOfwAJUQO8AaEsBQAAAABJRU5ErkJggg==', 'base64'),
  });
  const cover = page.locator('.editor-preview .invite-cover-image');
  await expect(cover).toHaveAttribute('src', /^data:image\//);
  const photoUrl = await cover.getAttribute('src');
  const illustration = page.getByRole('button', { name: /초록빛 정원 일러스트/ });
  await illustration.click();
  await expect(illustration).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.editor-preview .invite-cover-image')).toHaveAttribute('src', /garden-wedding\.webp$/);
  await expect(page.locator('.editor-preview .invite-illustration-names')).toContainText('조현범');
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '초안을 저장했어요' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '사진', exact: true }).click();
  await expect(illustration).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /웨딩 사진 · 테마 표지/ }).click();
  await expect(illustration).toHaveAttribute('aria-pressed', 'false');
  await expect(cover).toHaveAttribute('src', photoUrl!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
