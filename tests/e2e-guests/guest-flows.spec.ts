import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { defaultWedding } from '../../src/lib/defaults';

const project = 'https://wedding-ui-tests.supabase.co';
const timestamp = '2027-02-20T03:30:00Z';
const adminId = '75d81cde-d8fd-493b-a0ca-4cb3406e5b47';
const data = () => {
  const wedding = structuredClone(defaultWedding);
  wedding.guestFeatures.music.enabled = false;
  wedding.guestFeatures.rsvp.groomMessage = '신랑측 안내입니다. 현범에게 함께할 마음을 전해 주세요.';
  wedding.guestFeatures.rsvp.brideMessage = '신부측 안내입니다. 주영에게 함께할 마음을 전해 주세요.';
  return wedding;
};

interface ServerOptions { unavailable?: boolean; snapOpen?: boolean; rejectRsvp?: boolean; failFirstRsvp?: boolean; failSecondPhoto?: boolean }
async function mockServer(page: Page, options: ServerOptions = {}) {
  const requests: { path: string; method: string; payload: Record<string, unknown> | null }[] = [];
  let reservation = 0;
  let submission = 0;
  await page.route('https://**', route => route.abort());
  await page.route(`${project}/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const payload = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() as Record<string, unknown> : null;
    requests.push({ path, method: request.method(), payload });
    if (path.endsWith('/rpc/get_published_wedding')) return route.fulfill({ json: [{ data: data(), updated_at: timestamp }] });
    if (path.endsWith('/rpc/get_wedding_guest_capabilities')) return options.unavailable
      ? route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'function not found' } })
      : route.fulfill({ json: { rsvp_enabled: true, snap_enabled: true, snap_open: Boolean(options.snapOpen), snap_open_date: '2027-02-20' } });
    if (path.endsWith('/rpc/submit_wedding_rsvp')) {
      submission += 1;
      if (options.rejectRsvp) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'responses closed' } });
      if (options.failFirstRsvp && submission === 1) return route.fulfill({ status: 503, json: { message: 'temporary failure' } });
      return route.fulfill({ json: { id: `confirmed-rsvp-${submission}`, created_at: timestamp } });
    }
    if (path.endsWith('/rpc/reserve_wedding_guest_photo')) {
      reservation += 1;
      if (options.failSecondPhoto && reservation === 2) return route.fulfill({ status: 503, json: { message: 'temporary failure' } });
      return route.fulfill({ json: { id: `photo-${reservation}`, storage_path: `main/${reservation}.webp`, created_at: timestamp } });
    }
    if (path.startsWith('/storage/v1/object/wedding-guest-photos/')) return route.fulfill({ json: { Key: path.replace('/storage/v1/object/', ''), Id: `object-${reservation}` } });
    if (path.endsWith('/rpc/is_wedding_admin')) return route.fulfill({ json: true });
    if (path.endsWith('/wedding_content')) return route.fulfill({ json: { draft: data(), updated_at: timestamp } });
    if (path.endsWith('/wedding_rsvps')) return route.fulfill({ json: [{ id: 'rsvp-1', side: 'bride', attending: true, name: '=2+2', phone: '010-1234-5678', guests: 2, meal: 'yes', shuttle: 'daejeon', message: '친구와 함께 갑니다', created_at: timestamp }] });
    if (path.endsWith('/rpc/list_wedding_guest_photos')) return route.fulfill({ json: [] });
    if (path.startsWith('/auth/v1/')) return route.fulfill({ json: { id: adminId, aud: 'authenticated', role: 'authenticated', email: 'admin@example.invalid', app_metadata: {}, user_metadata: {}, created_at: timestamp } });
    return route.fulfill({ status: 500, json: { message: `Unexpected mocked endpoint: ${path}` } });
  });
  return requests;
}

async function openRsvp(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '참석 여부 전하기', exact: true }).click();
  return page.getByRole('dialog', { name: '참석 여부를 알려주세요', exact: true });
}

async function fillRsvp(page: Page) {
  const dialog = await openRsvp(page);
  await dialog.getByRole('button', { name: '신랑측', exact: true }).click();
  await expect(dialog.getByText('신랑측 안내입니다.', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: '신부측', exact: true }).click();
  await expect(dialog.getByText('신부측 안내입니다.', { exact: false })).toBeVisible();
  await expect(dialog.getByText('신랑측 안내입니다.', { exact: false })).toHaveCount(0);
  await dialog.getByRole('textbox', { name: '성함', exact: true }).fill('김하객');
  await dialog.getByLabel('참석 인원 · 본인 포함').selectOption('2');
  await dialog.getByLabel('식사 여부', { exact: true }).selectOption('yes');
  await dialog.getByLabel('대절버스 이용 의사').selectOption('daejeon');
  await dialog.getByRole('textbox', { name: /연락처/ }).fill('010-1234-5678');
  await dialog.getByRole('textbox', { name: /함께 오시는 분/ }).fill('친구 한 명과 함께 갑니다.');
  await dialog.getByRole('checkbox', { name: /응답 내용을 전달하는 데 동의/ }).check();
  return dialog;
}

test('real guest API calls deliver side-specific responses and show only a confirmed private receipt', async ({ page }) => {
  const requests = await mockServer(page);
  const dialog = await fillRsvp(page);
  if (process.env.CAPTURE_GUEST_UI) { await dialog.evaluate(element => { element.scrollTop = 0; }); await page.screenshot({ path: '/tmp/ju-wedding-rsvp-form-mobile.png' }); }
  await dialog.getByRole('button', { name: '전달하기', exact: true }).click();
  const receipt = page.getByRole('dialog', { name: '전달되었습니다', exact: true });
  await expect(receipt).toBeVisible();
  await expect(receipt.getByRole('heading', { name: '전달되었습니다', exact: true })).toBeInViewport();
  await expect(receipt).toContainText('김하객');
  await expect(receipt).toContainText('신부측');
  await expect(receipt).toContainText('본인 포함 2명');
  await expect(receipt).toContainText('식사 예정');
  await expect(receipt).toContainText('대전');
  if (process.env.CAPTURE_GUEST_UI) await page.screenshot({ path: '/tmp/ju-wedding-rsvp-receipt-mobile.png' });
  const submission = requests.find(request => request.path.endsWith('/rpc/submit_wedding_rsvp'));
  expect(submission?.method).toBe('POST');
  expect(submission?.payload?.p_payload).toMatchObject({ side: 'bride', attending: true, name: '김하객', phone: '010-1234-5678', guests: 2, meal: 'yes', shuttle: 'daejeon', consent: true });
  expect(requests.some(request => request.path.endsWith('/wedding_rsvps'))).toBe(false);
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stored).not.toContain('김하객');
  expect(stored).not.toContain('010-1234-5678');
  await receipt.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(receipt).not.toBeVisible();
  await expect(page.getByRole('button', { name: '참석 여부 전하기', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('missing storage setup never accepts a fake RSVP or photograph', async ({ page }) => {
  const requests = await mockServer(page, { unavailable: true });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '참석 여부 전하기', exact: true })).toBeDisabled();
  await expect(page.getByText('참석 응답 접수를 준비하고 있어요.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '현장 사진 올리기', exact: true })).toBeDisabled();
  expect(requests.some(request => /submit_wedding_rsvp|reserve_wedding_guest_photo/.test(request.path))).toBe(false);
  await expect(page.getByText('전달되었습니다', { exact: true })).toHaveCount(0);
});

test('a server-rejected RSVP remains editable and never shows a successful receipt', async ({ page }) => {
  await mockServer(page, { rejectRsvp: true });
  const dialog = await fillRsvp(page);
  await dialog.getByRole('button', { name: '전달하기', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('지금은 참석 응답을 접수할 수 없어요');
  await expect(page.getByRole('dialog', { name: '전달되었습니다', exact: true })).not.toBeVisible();
  await expect(dialog.getByRole('textbox', { name: '성함', exact: true })).toHaveValue('김하객');
});

test('two people using the same phone get distinct RSVP requests and failed delivery retries keep the same request', async ({ page }) => {
  const requests = await mockServer(page, { failFirstRsvp: true });
  const first = await fillRsvp(page);
  await first.getByRole('button', { name: '신랑측', exact: true }).click();
  await first.getByRole('textbox', { name: '성함', exact: true }).fill('첫번째하객');
  await first.getByRole('button', { name: '전달하기', exact: true }).click();
  await expect(first.getByRole('alert')).toContainText('응답을 전달하지 못했어요');
  await first.getByRole('button', { name: '전달하기', exact: true }).click();
  const firstReceipt = page.getByRole('dialog', { name: '전달되었습니다', exact: true });
  await expect(firstReceipt).toContainText('첫번째하객');
  await firstReceipt.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '참석 여부 전하기', exact: true }).click();
  const second = page.getByRole('dialog', { name: '참석 여부를 알려주세요', exact: true });
  await second.getByRole('button', { name: '신랑측', exact: true }).click();
  await second.getByRole('textbox', { name: '성함', exact: true }).fill('두번째하객');
  await second.getByRole('checkbox', { name: /응답 내용을 전달하는 데 동의/ }).check();
  await second.getByRole('button', { name: '전달하기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '전달되었습니다', exact: true })).toContainText('두번째하객');
  const submissions = requests.filter(request => request.path.endsWith('/rpc/submit_wedding_rsvp'));
  expect(submissions).toHaveLength(3);
  expect(submissions[0].payload?.p_client_token).toBe(submissions[1].payload?.p_client_token);
  expect(submissions[2].payload?.p_client_token).not.toBe(submissions[1].payload?.p_client_token);
  expect(submissions.map(request => (request.payload?.p_payload as { side: string }).side)).toEqual(['groom', 'groom', 'groom']);
});

test('wedding-day photo submission remains closed before its server-controlled opening date', async ({ page }) => {
  const requests = await mockServer(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '현장 사진 올리기', exact: true })).toBeDisabled();
  await expect(page.getByText('2027년 2월 20일부터 사진을 올릴 수 있어요.', { exact: true })).toBeVisible();
  expect(requests.some(request => request.path.includes('reserve_wedding_guest_photo'))).toBe(false);
});

test('photo upload reports a partial failure and retries only the remaining private photo', async ({ page }) => {
  const requests = await mockServer(page, { snapOpen: true, failSecondPhoto: true });
  await page.clock.install({ time: new Date(timestamp) });
  await page.goto('/');
  await page.getByRole('button', { name: '현장 사진 올리기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '함께 담은 오늘의 순간', exact: true });
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 40;
    const context = canvas.getContext('2d')!; context.fillStyle = '#adc49b'; context.fillRect(0, 0, 40, 40);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await dialog.getByLabel('현장 사진 파일 선택').setInputFiles([
    { name: '첫번째.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') },
    { name: '두번째.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') },
  ]);
  await dialog.getByRole('checkbox', { name: /사진을 전달하는 데 동의/ }).check();
  await dialog.getByRole('button', { name: '사진 전달하기', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('1장은 전달됐어요. 남은 1장은 다시 전달해 주세요.');
  await expect(dialog.getByRole('list', { name: '선택한 사진' })).toContainText('두번째.png');
  await expect(dialog.getByRole('list', { name: '선택한 사진' })).not.toContainText('첫번째.png');
  await dialog.getByRole('button', { name: '사진 전달하기', exact: true }).click();
  const receipt = page.getByRole('dialog', { name: '사진이 전달되었습니다', exact: true });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText('소중한 순간 2장을 받았어요');
  if (process.env.CAPTURE_GUEST_UI) await page.screenshot({ path: '/tmp/ju-wedding-guest-snap-mobile.png' });
  expect(requests.filter(request => request.path.includes('/storage/v1/object/wedding-guest-photos/'))).toHaveLength(2);
  expect(requests.some(request => request.path.includes('/object/public/wedding-guest-photos/'))).toBe(false);
  expect(requests.filter(request => request.path.includes('reserve_wedding_guest_photo')).map(request => request.payload?.p_file_name)).toEqual(['첫번째.png', '두번째.png', '두번째.png']);
});

test('anonymous visitors see the admin login rather than private guest responses', async ({ page }) => {
  const requests = await mockServer(page);
  await page.goto('/#/admin');
  await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '우리 청첩장 꾸미기', exact: true })).toBeVisible();
  await expect(page.locator('a[href="#/setup"]')).toHaveCount(0);
  await expect(page.locator('.login-page')).not.toContainText(/SQL|Supabase|API|Client ID|처음 연결/);
  await expect(page.getByRole('heading', { name: '함께해 주시는 마음', exact: true })).toHaveCount(0);
  expect(requests.some(request => /wedding_rsvps|list_wedding_guest_photos/.test(request.path))).toBe(false);
});

test('authenticated managers can view private replies and export a safe Excel-compatible CSV', async ({ page }) => {
  await mockServer(page);
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: adminId, aud: 'authenticated', role: 'authenticated', exp: expires })}.test-signature`;
  await page.addInitScript(({ token, expiration, id }) => {
    localStorage.setItem('sb-wedding-ui-tests-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: expiration, user: { id, aud: 'authenticated', role: 'authenticated', email: 'admin@example.invalid', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' } }));
  }, { token: accessToken, expiration: expires, id: adminId });
  await page.goto('/#/admin');
  await page.getByRole('button', { name: '하객 응답', exact: true }).click();
  const manager = page.locator('.guest-management');
  await expect(manager.getByRole('heading', { name: '=2+2', exact: true })).toBeVisible();
  await expect(manager).toContainText('010-1234-5678');
  if (process.env.CAPTURE_GUEST_UI) { await manager.scrollIntoViewIfNeeded(); await page.screenshot({ path: '/tmp/ju-wedding-guest-manager-mobile.png' }); }
  const downloadEvent = page.waitForEvent('download');
  await manager.getByRole('button', { name: '엑셀용 파일 저장', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('"\'=2+2"');
  expect(csv).toContain('"신부측"');
  expect(csv).toContain('"010-1234-5678"');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
