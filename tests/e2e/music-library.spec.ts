import { expect, test } from '@playwright/test';
import { builtinMusicTracks } from '../../src/lib/music';
import { defaultWedding } from '../../src/lib/defaults';

test('five music choices can be auditioned, switched silently, and saved in the draft', async ({ page }) => {
  await page.route(/^https:\/\/(?:maps|www)\.google\.com\//, route => route.fulfill({ contentType: 'text/html', body: '<p>지도 테스트</p>' }));
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [];
    (window as Window & { weddingMusicContexts?: AudioContext[] }).weddingMusicContexts = contexts;
    window.AudioContext = new Proxy(window.AudioContext, { construct(Target, args) {
      const context = Reflect.construct(Target, args) as AudioContext; contexts.push(context); return context;
    } });
  });
  await page.goto('/#/admin');
  await page.getByRole('button', { name: /추가 기능/ }).click();
  const picker = page.locator('.music-library-picker');
  await expect(picker.getByRole('radio')).toHaveCount(5);
  const contexts = () => page.evaluate(() => (window as Window & { weddingMusicContexts?: AudioContext[] }).weddingMusicContexts?.map(context => context.state));
  expect(await contexts()).toEqual([]);
  await picker.getByRole('button', { name: '배경음악 재생', exact: true }).click();
  await expect.poll(contexts).toEqual(['running']);
  await picker.getByRole('radio', { name: /둘이 걷는 길/ }).check();
  await expect.poll(contexts).toEqual(['closed']);
  await expect(picker.locator('[data-music-track]')).toHaveAttribute('data-music-track', 'sunny-walk');
  // Choosing a track must never start audio by itself.
  expect(await contexts()).toEqual(['closed']);
  for (const track of builtinMusicTracks) {
    await picker.getByRole('radio', { name: new RegExp(track.title) }).check();
    await picker.getByRole('button', { name: '배경음악 재생', exact: true }).click();
    await expect(picker.getByRole('button', { name: '배경음악 일시정지', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await picker.getByRole('button', { name: '배경음악 일시정지', exact: true }).click();
  }
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /추가 기능/ }).click();
  await expect(page.locator('.music-library-picker').getByRole('radio', { name: /별빛 인사/ })).toBeChecked();
});


test('an existing custom song remains the previewed song until a built-in track is selected', async ({ page }) => {
  await page.route(/^https:\/\/(?:maps|www)\.google\.com\//, route => route.fulfill({ contentType: 'text/html', body: '<p>지도 테스트</p>' }));
  await page.addInitScript(() => {
    const playedUrls: string[] = [];
    (window as Window & { weddingPlayedUrls?: string[] }).weddingPlayedUrls = playedUrls;
    HTMLMediaElement.prototype.play = function () { playedUrls.push(this.src); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.load = function () {};
  });
  const data = structuredClone(defaultWedding);
  data.guestFeatures.music.source = 'url';
  data.guestFeatures.music.url = 'https://example.test/our-own-song.mp3';
  await page.goto('/#/admin');
  await page.evaluate(async wedding => {
    const modulePath = '/src/lib/storage.ts';
    const { saveDraft } = await import(modulePath);
    await saveDraft(wedding);
  }, data);
  await page.reload();
  await page.getByRole('button', { name: '추가 기능', exact: true }).click();
  const picker = page.locator('.music-library-picker');
  await expect(picker.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(picker.locator('.music-library-preview')).toContainText('직접 고른 음악');
  await picker.getByRole('button', { name: '배경음악 재생', exact: true }).click();
  expect(await page.evaluate(() => (window as Window & { weddingPlayedUrls?: string[] }).weddingPlayedUrls)).toEqual([data.guestFeatures.music.url]);
  await picker.getByRole('radio', { name: /햇살 한 스푼/ }).check();
  await expect(picker.locator('[data-music-track]')).toHaveAttribute('data-music-track', 'morning-bloom');
  await expect(picker.getByRole('button', { name: '배경음악 재생', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(picker.locator('.music-library-preview')).toContainText('햇살 한 스푼');
  expect(await page.evaluate(() => (window as Window & { weddingPlayedUrls?: string[] }).weddingPlayedUrls)).toEqual([data.guestFeatures.music.url]);
});
