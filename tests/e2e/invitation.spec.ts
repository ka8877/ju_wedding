import { expect, test } from '@playwright/test';

test('mobile invitation is honest about unknown event information and has no horizontal overflow', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'With you, always.' })).toBeVisible();
  await expect(page.getByText('우리의 소중한 날을 준비하고 있어요')).toBeVisible();
  await expect(page.getByRole('img', { name: /웨딩 일러스트/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: '우리 청첩장 관리' }).click();
  await expect(page.getByRole('heading', { name: /우리의 초대장을/ })).toBeVisible();
  await expect(page.getByText('이 기기에만 저장되는 미리보기입니다.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '미리보기에 적용' }).click();
  await expect(page.locator('.editor-notice')).toContainText('이 기기의 미리보기에 반영했어요');
  expect(errors).toEqual([]);
});

test('drafts, photo upload, place selection, publication and account copy work end to end', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('https://nominatim.openstreetmap.org/search?**', async route => {
    await route.fulfill({ json: [{ place_id: 1, name: '테스트 예식장', display_name: '서울특별시 중구 테스트로 1', lat: '37.5665', lon: '126.9780' }] });
  });
  await page.route('https://www.openstreetmap.org/**', async route => { await route.fulfill({ contentType: 'text/html', body: '<p>지도 테스트</p>' }); });
  await page.goto('/#/admin');
  await page.getByLabel('예식 날짜', { exact: true }).fill('2027-05-22');
  await page.getByLabel(/^예식 시간/).fill('14:30');
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.locator('.editor-notice')).toContainText('이 기기에 초안을 저장했어요');
  await page.reload();
  await expect(page.getByLabel('예식 날짜', { exact: true })).toHaveValue('2027-05-22');
  await page.getByRole('button', { name: '사진', exact: true }).click();
  await page.getByLabel('첫 화면 사진 파일 선택').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not-an-image') });
  await expect(page.getByRole('alert')).toContainText('사진을 읽을 수 없습니다');
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 48;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#839671'; ctx.fillRect(0, 0, 32, 48);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const png = Buffer.from(encoded, 'base64');
  await page.getByLabel('첫 화면 사진 파일 선택').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('button', { name: '첫 화면 사진 삭제', exact: true })).toBeVisible();
  await page.getByLabel('갤러리 사진 파일 선택').setInputFiles([{ name: 'moment.png', mimeType: 'image/png', buffer: png }]);
  await expect(page.getByLabel('1번 사진 설명')).toBeVisible();
  await page.getByRole('button', { name: '예식 장소', exact: true }).click();
  await page.getByLabel('예식 장소 검색').fill('테스트 예식장');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('button', { name: /테스트 예식장 서울특별시/ }).click();
  await expect(page.getByLabel('주소', { exact: true })).toHaveValue('서울특별시 중구 테스트로 1');
  await expect(page.getByTitle('선택한 예식장 지도')).toHaveAttribute('src', /37.5665/);
  await page.getByRole('button', { name: '마음 전하실 곳', exact: true }).click();
  await page.getByRole('button', { name: '계좌 추가하기' }).click();
  await page.getByLabel('계좌 1 은행').fill('테스트은행');
  await page.getByLabel('계좌 1 예금주').fill('권주영');
  await page.getByLabel('계좌 1 계좌번호').fill('123-456');
  await page.getByRole('button', { name: '디자인', exact: true }).click();
  await page.getByRole('button', { name: /로지 모먼트/ }).click();
  await page.getByLabel('축복의 말씀 표시').check();
  await page.getByRole('button', { name: '미리보기에 적용' }).click();
  await expect(page.locator('.editor-notice')).toContainText('이 기기의 미리보기에 반영했어요');
  await page.goto('/');
  await expect(page.locator('.invitation')).toHaveAttribute('data-theme', 'rose');
  await expect(page.getByText('2027년 5월 22일 토요일 오후 2:30').first()).toBeVisible();
  await expect(page.getByText('고린도전서 13:13')).toBeVisible();
  await page.getByRole('button', { name: /함께한 순간 1 1 크게 보기/ }).click();
  await expect(page.getByRole('dialog', { name: '웨딩 사진 크게 보기' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '웨딩 사진 크게 보기' })).not.toBeVisible();
  await page.getByText('신부측 계좌번호').click();
  await page.getByRole('button', { name: '권주영 계좌번호 복사' }).click();
  await expect(page.getByRole('status')).toContainText('계좌번호를 복사했어요');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('123-456');
  // A new unsaved / saved-only draft must not replace the locally published invitation.
  await page.goto('/#/admin');
  await page.getByLabel('신부 이름', { exact: true }).fill('다른이름');
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.locator('.editor-notice')).toContainText('초안을 저장했어요');
  await page.goto('/');
  await expect(page.locator('.invite-korean-names')).toContainText('권주영');
  await expect(page.locator('.invite-korean-names')).not.toContainText('다른이름');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('publishing from the bottom of the design editor gives visible feedback and allows unknown event details', async ({ page }) => {
  await page.goto('/#/admin');
  await page.getByRole('button', { name: '디자인', exact: true }).click();
  await page.getByRole('button', { name: '블루 세레니티', exact: true }).click();
  await page.getByRole('button', { name: '백업 내려받기' }).scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.getByRole('button', { name: '미리보기에 적용', exact: true }).click();
  const notice = page.locator('.editor-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('준비 중으로 표시됩니다');
  const rect = await notice.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(844);
  expect(Math.abs(await page.evaluate(() => scrollY) - scrollBefore)).toBeLessThan(3);
  await page.goto('/');
  await expect(page.locator('.invitation')).toHaveAttribute('data-theme', 'sky');
  await expect(page.getByText('우리의 소중한 날을 준비하고 있어요')).toBeVisible();
});

test('invalid input errors stay visible beside the publish button instead of hiding above the viewport', async ({ page }) => {
  await page.goto('/#/admin');
  await page.getByLabel('신부 이름', { exact: true }).fill('');
  await page.getByRole('button', { name: '디자인', exact: true }).click();
  await page.getByRole('button', { name: '백업 내려받기' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '미리보기에 적용', exact: true }).click();
  const notice = page.getByRole('alert');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('신랑과 신부의 이름');
  await expect(notice).toBeFocused();
  const rect = await notice.boundingBox();
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(844);
});
