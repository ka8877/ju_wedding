import type { Locator, Page } from '@playwright/test';
import { expect, test } from './helpers';
import { defaultWedding } from '../../src/lib/defaults';
import { bodyAlignments, buttonShapes, fonts, galleryGaps, letterSpacings, lineSpacings, sectionSpacings } from '../../src/lib/design';
import type { FontId, StoredWedding, WeddingData } from '../../src/lib/types';

test.setTimeout(60_000);

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4+vrOfwAJUQO8AaEsBQAAAABJRU5ErkJggg==';
const typefaces: Record<FontId, string> = {
  serif: 'Noto Serif KR', sans: 'Noto Sans KR', romantic: 'Gowun Batang',
  myeongjo: 'Nanum Myeongjo', handwriting: 'Nanum Pen Script', 'clear-handwriting': 'Gaegu',
};

function fixture() {
  const data = structuredClone(defaultWedding);
  data.design.template = 'letter';
  data.design.heroTitle = '우리만의\n오래된 약속';
  data.design.heroSubtitle = '두 사람이 직접 남긴 한 줄';
  data.invitation = '서로의 하루에 다정히 머물며\n같은 길을 걸어가겠습니다.\n\n저희가 직접 쓴 소중한 초대입니다.';
  data.closing = '함께해 주시는 마음을 오래 기억하겠습니다.';
  data.groom.phone = '01012345678';
  data.bride.phone = '01087654321';
  data.coverPhoto = image;
  data.photos = Array.from({ length: 3 }, (_, index) => ({ id: `our-photo-${index}`, url: image, alt: `우리가 고른 사진 ${index + 1}` }));
  data.accounts = [{ id: 'our-account', side: 'bride', bank: '우리은행', holder: data.bride.name, number: '1002-123-456789' }];
  data.guestFeatures.opening.enabled = false;
  data.guestFeatures.music.trackId = 'sunny-walk';
  return data;
}

async function storeFixture(page: Page, data: WeddingData) {
  await page.goto('/');
  await page.evaluate(async wedding => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('jo-and-joo', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('wedding');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('wedding', 'readwrite');
        const snapshot = { data: wedding, updatedAt: '2026-11-17T00:00:00Z' };
        tx.objectStore('wedding').put(snapshot, 'draft');
        tx.objectStore('wedding').put(snapshot, 'published');
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, data);
  await page.reload();
}

async function stored(page: Page, key: 'draft' | 'published'): Promise<StoredWedding> {
  return page.evaluate(async entry => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('jo-and-joo', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<StoredWedding>((resolve, reject) => {
        const request = db.transaction('wedding').objectStore('wedding').get(entry);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, key);
}

async function expectFont(locator: Locator, name: string) {
  await expect.poll(() => locator.evaluate(element => getComputedStyle(element).fontFamily.split(',')[0].trim().replace(/["']/g, ''))).toBe(name);
}

test('every typeface reaches the whole invitation and its portaled guest controls', async ({ page, context }) => {
  test.setTimeout(120_000);
  const replayPage = await context.newPage(); // This page has no arrival auto-skip handler.
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  replayPage.on('pageerror', error => errors.push(error.message));
  try {
    for (const choice of fonts) {
      const data = fixture(); data.design.font = choice.id;
      await storeFixture(page, data);
      const main = page.locator('main.invitation');
      await expect(main).toHaveAttribute('data-invitation-font', choice.id);
      await page.evaluate(async () => { await document.fonts.ready; });
      // These were independently hard-coded families before global application.
      const selectors = ['#wedding-title', '.invite-korean-names', '.invite-english-names', '.invite-hero-date', '.invite-letter-copy', '.invite-calendar-title', '.invite-calendar-grid > span:not(:empty)', '.invite-calendar-save', '.invite-account-group summary', '.invite-closing-script', '.wedding-share-actions button', '.invite-map-primary > span:nth-child(2)', '.invite-map-primary small', '.invite-other-maps summary'];
      for (const selector of selectors) await expectFont(main.locator(selector).first(), typefaces[choice.id]);
      await expectFont(page.locator('.invite-music-player:not(.invite-music-player--preview) .invite-music-toggle > span'), typefaces[choice.id]);

      await page.getByRole('button', { name: 'QR 코드 보기', exact: true }).click();
      const qr = page.locator('.wedding-share-dialog[open]');
      await expect(qr).toHaveAttribute('data-invitation-font', choice.id);
      for (const selector of ['h2', '.wedding-share-names', '.wedding-share-button']) await expectFont(qr.locator(selector).first(), typefaces[choice.id]);
      await page.keyboard.press('Escape');

      await page.goto('/#/admin');
      await expect(page.locator('.editor-preview .invitation')).toHaveAttribute('data-invitation-font', choice.id);
      await page.getByRole('button', { name: '미리보기', exact: true }).click();
      await page.getByRole('button', { name: '참석 응답 미리보기', exact: true }).click();
      let guest = page.locator('.guest-dialog[open]');
      await expect(guest).toHaveAttribute('data-invitation-font', choice.id);
      for (const selector of ['h2', 'label', 'input', 'button']) await expectFont(guest.locator(selector).first(), typefaces[choice.id]);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '사진 올리기 미리보기', exact: true }).click();
      guest = page.locator('.guest-dialog[open]');
      await expect(guest).toHaveAttribute('data-invitation-font', choice.id);
      for (const selector of ['h2', 'label', 'input', 'button']) await expectFont(guest.locator(selector).first(), typefaces[choice.id]);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');

      await replayPage.goto('/#/admin');
      await replayPage.reload();
      await expect(replayPage.locator('.editor-preview .invitation')).toHaveAttribute('data-invitation-font', choice.id);
      await replayPage.getByRole('button', { name: '추가 기능', exact: true }).click();
      await replayPage.getByRole('button', { name: '문 열림 효과 미리보기', exact: true }).click();
      const entrance = replayPage.locator('.invite-opening[open]');
      await expect(entrance).toHaveAttribute('data-invitation-font', choice.id);
      await expectFont(entrance.locator('h2'), typefaces[choice.id]);
      await expectFont(entrance.locator('.invite-opening-skip'), typefaces[choice.id]);
      await entrance.getByRole('button', { name: '건너뛰기', exact: true }).click();
      // Merely viewing and replaying never updates the saved wedding.
      expect((await stored(page, 'published')).data).toEqual(data);
    }
    expect(errors).toEqual([]);
  } finally { await replayPage.close(); }
});

test('handwritten map actions stay legible at the smallest phone and copy setting', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const font of ['handwriting', 'clear-handwriting'] as const) {
    const data = fixture(); data.design.font = font; data.design.fontSize = 'small';
    await storeFixture(page, data);
    const action = page.getByRole('link', { name: '네이버 지도 열기', exact: true });
    await action.scrollIntoViewIfNeeded();
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute('href', /https:\/\//);
    const label = action.locator('> span:nth-child(2)');
    await expectFont(label, typefaces[font]);
    const appearance = await action.evaluate(element => {
      const label = element.querySelector('span:nth-child(2)')!;
      const hint = element.querySelector('small')!;
      const style = getComputedStyle(label), hintStyle = getComputedStyle(hint);
      const outer = element.getBoundingClientRect(), inner = label.getBoundingClientRect();
      const rgb = (color: string) => (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const luminance = (color: number[]) => color.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
      const foreground = luminance(rgb(style.color)), background = luminance(rgb(getComputedStyle(element).backgroundColor));
      return {
        size: Number.parseFloat(style.fontSize), hintSize: Number.parseFloat(hintStyle.fontSize), weight: Number.parseFloat(style.fontWeight),
        letterSpacing: style.letterSpacing === 'normal' ? 0 : Number.parseFloat(style.letterSpacing), lineHeight: Number.parseFloat(style.lineHeight),
        stroke: Number.parseFloat(style.getPropertyValue('-webkit-text-stroke-width')) || 0,
        canSynthesizeWeight: style.fontSynthesis.includes('weight') || style.getPropertyValue('font-synthesis-weight') === 'auto',
        contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05),
        noLabelClipping: label.scrollWidth <= label.clientWidth + 1 && inner.left >= outer.left && inner.right <= outer.right + 1,
      };
    });
    expect(appearance.size).toBeGreaterThanOrEqual(font === 'handwriting' ? 19 : 17);
    expect(appearance.hintSize).toBeGreaterThanOrEqual(14);
    expect(appearance.letterSpacing).toBeGreaterThanOrEqual(0);
    expect(appearance.lineHeight).toBeGreaterThanOrEqual(appearance.size * 1.2);
    expect(appearance.stroke >= .15 || appearance.weight >= 600 && (font === 'clear-handwriting' || appearance.canSynthesizeWeight)).toBe(true);
    expect(appearance.contrast).toBeGreaterThanOrEqual(4.5);
    expect(appearance.noLabelClipping).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await action.screenshot({ path: testInfo.outputPath(`${font}-map-label.png`) });
    expect((await stored(page, 'published')).data).toEqual(data);
  }
});

test('the clearer handwritten choice saves and reloads without replacing the couple content', async ({ page }) => {
  const data = fixture(); data.design.font = 'handwriting';
  await storeFixture(page, data);
  await page.goto('/#/admin');
  await page.getByRole('button', { name: '디자인', exact: true }).click();
  await page.locator('summary[aria-label="직접 세부 꾸미기"]').click();
  const choice = page.getByRole('button', { name: '또박또박 손글씨', exact: true });
  await choice.click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await expectFont(page.locator('.editor-preview .invite-letter-copy'), typefaces['clear-handwriting']);
  expect((await stored(page, 'published')).data).toEqual(data);
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.locator('.editor-notice')).toContainText('이 기기에 초안을 저장했어요');
  const expected = { ...data, design: { ...data.design, font: 'clear-handwriting' } };
  expect((await stored(page, 'draft')).data).toEqual(expected);
  await page.reload();
  await page.getByRole('button', { name: '디자인', exact: true }).click();
  await page.locator('summary[aria-label="직접 세부 꾸미기"]').click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '미리보기에 적용', exact: true }).click();
  await expect(page.locator('.editor-notice')).toContainText('이 기기의 미리보기에 반영했어요');
  expect((await stored(page, 'published')).data).toEqual(expected);
  await page.goto('/');
  await expect(page.locator('.invitation')).toHaveAttribute('data-font', 'clear-handwriting');
  await expectFont(page.locator('.invite-letter-copy'), typefaces['clear-handwriting']);
});

test('spacing and shape choices survive save and publication without replacing personal content', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const data = fixture();
  await storeFixture(page, data);
  await page.goto('/#/admin');
  await page.getByRole('button', { name: '디자인', exact: true }).click();
  await page.locator('summary[aria-label="직접 세부 꾸미기"]').click();
  const preview = page.locator('.editor-preview .invitation');
  const baseline = await preview.evaluate(element => ({
    copyLine: Number.parseFloat(getComputedStyle(element.querySelector('.invite-letter-copy')!).lineHeight),
    galleryGap: Number.parseFloat(getComputedStyle(element.querySelector('.invite-gallery')!).gap),
    sectionPadding: Number.parseFloat(getComputedStyle(element.querySelector('.invite-section')!).paddingTop),
  }));
  await page.getByRole('button', { name: '다정한 손글씨', exact: true }).click();
  await page.getByRole('button', { name: '글자 크기 크게', exact: true }).click();
  const selections = [
    { key: 'lineSpacing', label: '줄 간격', choice: lineSpacings.find(item => item.id === 'relaxed')! },
    { key: 'letterSpacing', label: '글자 간격', choice: letterSpacings.find(item => item.id === 'wide')! },
    { key: 'sectionSpacing', label: '구역 사이 여백', choice: sectionSpacings.find(item => item.id === 'relaxed')! },
    { key: 'bodyAlignment', label: '본문 정렬', choice: bodyAlignments.find(item => item.id === 'left')! },
    { key: 'buttonShape', label: '버튼 모양', choice: buttonShapes.find(item => item.id === 'pill')! },
    { key: 'galleryGap', label: '사진 사이 간격', choice: galleryGaps.find(item => item.id === 'wide')! },
  ];
  for (const { label, choice } of selections) {
    const button = page.getByRole('button', { name: `${label} ${choice.name}`, exact: true });
    await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(preview.locator('.invite-letter-copy')).toHaveText(data.invitation);
  const appearance = await preview.evaluate(element => ({
    alignment: getComputedStyle(element.querySelector('.invite-letter-copy')!).textAlign,
    copyLine: Number.parseFloat(getComputedStyle(element.querySelector('.invite-letter-copy')!).lineHeight),
    letterSpacing: Number.parseFloat(getComputedStyle(element.querySelector('.invite-letter-copy')!).letterSpacing),
    galleryGap: Number.parseFloat(getComputedStyle(element.querySelector('.invite-gallery')!).gap),
    sectionPadding: Number.parseFloat(getComputedStyle(element.querySelector('.invite-section')!).paddingTop),
    radius: Number.parseFloat(getComputedStyle(element.querySelector('.invite-outline-button')!).borderTopLeftRadius),
  }));
  expect(appearance.alignment).toBe('left');
  expect(appearance.copyLine).toBeGreaterThan(baseline.copyLine);
  expect(appearance.letterSpacing).toBeGreaterThan(0);
  expect(appearance.galleryGap).toBeGreaterThan(baseline.galleryGap);
  expect(appearance.sectionPadding).toBeGreaterThan(baseline.sectionPadding);
  expect(appearance.radius).toBeGreaterThan(20);

  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.locator('.editor-notice')).toContainText('이 기기에 초안을 저장했어요');
  const draft = (await stored(page, 'draft')).data;
  const { design: _originalDesign, ...originalContent } = data;
  const { design: savedDesign, ...savedContent } = draft;
  expect(savedContent).toEqual(originalContent);
  for (const { key, choice } of selections) expect(savedDesign[key as keyof typeof savedDesign]).toBe(choice.id);
  expect(savedDesign.heroTitle).toBe(data.design.heroTitle);
  expect(savedDesign.heroSubtitle).toBe(data.design.heroSubtitle);
  expect((await stored(page, 'published')).data).toEqual(data);

  await page.reload();
  await page.getByRole('button', { name: '디자인', exact: true }).click();
  await page.locator('summary[aria-label="직접 세부 꾸미기"]').click();
  for (const { label, choice } of selections) await expect(page.getByRole('button', { name: `${label} ${choice.name}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '미리보기에 적용', exact: true }).click();
  await expect(page.locator('.editor-notice')).toContainText('이 기기의 미리보기에 반영했어요');
  expect((await stored(page, 'published')).data).toEqual(draft);
  await page.goto('/');
  await expect(page.locator('.invitation')).toHaveAttribute('data-font', 'handwriting');
  await expect(page.locator('.invite-letter-copy')).toHaveText(data.invitation);
  await expect(page.locator('.invite-closing > p')).toHaveText(data.closing);
  await expectFont(page.locator('.invite-hero-date'), typefaces.handwriting);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('#wedding-title').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
