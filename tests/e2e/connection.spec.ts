import { expect, test } from '@playwright/test';
import { defaultWedding } from '../../src/lib/defaults';

type ProbeOptions = { publication?: unknown; bucketMissing?: boolean; draftsExposed?: boolean };

async function openConnectionGuide(page: import('@playwright/test').Page, options: ProbeOptions = {}) {
  const requests: { method: string; path: string }[] = [];
  await page.route('https://*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push({ method: route.request().method(), path });
    if (path.endsWith('/rpc/get_published_wedding')) {
      await route.fulfill({ json: options.publication ?? [] });
    } else if (path.endsWith('/wedding_content') && options.draftsExposed) {
      await route.fulfill({ json: [] });
    } else if (path.includes('/rest/v1/')) {
      await route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } });
    } else if (path.includes('/storage/v1/object/public/wedding-photos/')) {
      await route.fulfill({ status: 400, json: { message: options.bucketMissing ? 'Bucket not found' : 'Object not found' } });
    } else await route.abort();
  });
  await page.goto('/#/setup');
  await page.getByRole('button', { name: '연결 확인', exact: true }).click();
  return requests;
}

test('connection guide verifies public reads, private access and photo bucket without claiming login or upload', async ({ page }) => {
  const requests = await openConnectionGuide(page, { publication: [{ data: defaultWedding, updated_at: '2026-11-12T02:00:00Z' }] });
  const result = page.locator('.setup-check-ok');
  await expect(result).toContainText('사진 저장 공간을 확인했어요');
  await expect(result).toContainText('공개한 청첩장도 정상적으로 읽었어요');
  await expect(result).toContainText('관리자 로그인과 실제 사진 업로드는 별도로 확인');
  expect(requests.some(request => request.path.endsWith('/wedding_content'))).toBe(true);
  expect(requests.some(request => request.path.endsWith('/wedding_admins'))).toBe(true);
  expect(requests.some(request => request.path.includes('/storage/v1/object/public/wedding-photos/main/.connection-check-'))).toBe(true);
  expect(requests.every(request => request.method === 'GET' || (request.method === 'POST' && request.path.endsWith('/rpc/get_published_wedding')))).toBe(true);
});

test('connection guide reports an unpublished project only after checking the photo bucket', async ({ page }) => {
  await openConnectionGuide(page);
  await expect(page.locator('.setup-check-ok')).toContainText('아직 공개한 청첩장은 없어요');
});

for (const scenario of [
  { name: 'missing photo bucket', options: { bucketMissing: true }, message: '사진 저장 공간이 아직 준비되지 않았어요' },
  { name: 'malformed published invitation', options: { publication: [{ data: {}, updated_at: '2026-11-12T02:00:00Z' }] }, message: '공개한 청첩장 형식을 확인하지 못했어요' },
  { name: 'anonymous draft access even with no rows', options: { draftsExposed: true }, message: '초안과 관리자 목록의 공개 권한을 확인해야 합니다' },
]) {
  test(`connection guide rejects ${scenario.name}`, async ({ page }) => {
    await openConnectionGuide(page, scenario.options);
    await expect(page.locator('.setup-check-error')).toContainText(scenario.message);
    await expect(page.locator('.setup-check-ok')).toHaveCount(0);
  });
}
