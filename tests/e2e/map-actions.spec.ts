import { expect, test } from './helpers';

test('Naver is the default map and other providers are explicit external choices', async ({ page }) => {
  const otherProviderRequests: string[] = [];
  page.on('request', request => { if (/https:\/\/(?:maps|www)\.google\.com\/maps|https:\/\/map\.kakao\.com/.test(request.url())) otherProviderRequests.push(request.url()); });
  await page.goto('/');
  const location = page.locator('[data-section="location"]');
  await location.scrollIntoViewIfNeeded();
  await expect(location.locator('.venue-map')).toHaveAttribute('data-map-provider', 'naver');
  await expect(location.locator('iframe')).toHaveCount(0);
  await expect(location.getByRole('link', { name: '네이버 지도 열기', exact: true })).toHaveAttribute('href', 'https://m.place.naver.com/place/1156613092/location');
  const google = location.getByRole('link', { name: 'Google 지도 열기', exact: true });
  const kakao = location.getByRole('link', { name: '카카오맵 열기', exact: true });
  await expect(google).not.toBeVisible();
  await expect(kakao).not.toBeVisible();
  await location.locator('.invite-other-maps summary').click();
  await expect(google).toBeVisible();
  await expect(google).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\//);
  await expect(google).toHaveAttribute('target', '_blank');
  await expect(kakao).toBeVisible();
  await expect(kakao).toHaveAttribute('href', /map\.kakao\.com\/link\/to\/.*37\.3768838,127\.1043929/);
  expect(otherProviderRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const copy = location.getByRole('button', { name: '주소 복사' });
  const box = await copy.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(await page.locator('.invite-hero-date').evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
});
