import { expect, test } from '@playwright/test';

test('clipboard fallback can copy from a native QR dialog', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'QR 코드 보기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '마음을 담은 초대' });
  await expect(dialog).toBeVisible();
  await page.evaluate(async () => {
    await navigator.clipboard.writeText('아직 복사되지 않은 내용');
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => {
      throw new DOMException('Clipboard permission denied', 'NotAllowedError');
    } });
  });
  await dialog.getByRole('button', { name: '링크 복사', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('링크를 복사했어요');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://ka8877.github.io/ju_wedding/');
  await expect(dialog.getByRole('button', { name: '링크 복사', exact: true })).toBeFocused();
});

test('a denied Clipboard API falls back to selected text and restores the editing selection', async ({ page }) => {
  await page.goto('/#/admin');
  await expect(page.getByLabel('신랑 이름', { exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/utils.ts';
    const { copyText } = await import(modulePath);
    const field = document.querySelector<HTMLInputElement>('input');
    if (!field) throw new Error('An editable field is required for this test.');
    field.value = '원래 편집하던 문장'; field.focus(); field.setSelectionRange(2, 6, 'backward');
    const originalTextareaCount = document.querySelectorAll('textarea').length;
    let clipboardCalls = 0;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {
      clipboardCalls += 1; throw new DOMException('Clipboard permission denied', 'NotAllowedError');
    } } });
    const fallbackCalls: { command: string; selectedText: string; readOnly: boolean }[] = [];
    document.execCommand = command => {
      const textarea = document.activeElement as HTMLTextAreaElement;
      fallbackCalls.push({ command, selectedText: textarea.value.slice(textarea.selectionStart, textarea.selectionEnd), readOnly: textarea.readOnly });
      return true;
    };
    await copyText('https://ka8877.github.io/ju_wedding/');
    return { clipboardCalls, fallbackCalls, focused: document.activeElement === field,
      selection: [field.selectionStart, field.selectionEnd, field.selectionDirection],
      extraTextareas: document.querySelectorAll('textarea').length - originalTextareaCount };
  });
  expect(result.clipboardCalls).toBe(1);
  expect(result.fallbackCalls).toEqual([{ command: 'copy', selectedText: 'https://ka8877.github.io/ju_wedding/', readOnly: true }]);
  expect(result.focused).toBe(true);
  expect(result.selection).toEqual([2, 6, 'backward']);
  expect(result.extraTextareas).toBe(0);
});

test('a failed fallback cleans up and gives a useful error while preserving document selection', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/utils.ts';
    const { copyText } = await import(modulePath);
    const paragraph = document.createElement('p'); paragraph.textContent = '직접 복사할 문장'; document.body.appendChild(paragraph);
    const range = document.createRange(); range.selectNodeContents(paragraph);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    const originalTextareaCount = document.querySelectorAll('textarea').length;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
    let fallbackCalls = 0;
    document.execCommand = () => { fallbackCalls += 1; throw new Error('copy unavailable'); };
    let message = '';
    try { await copyText('복사할 링크'); } catch (error) { message = error instanceof Error ? error.message : String(error); }
    const selectedText = selection.toString(); paragraph.remove();
    return { message, fallbackCalls, selectedText, extraTextareas: document.querySelectorAll('textarea').length - originalTextareaCount };
  });
  expect(result.message).toBe('복사하지 못했습니다. 길게 눌러 직접 복사해 주세요.');
  expect(result.fallbackCalls).toBe(1);
  expect(result.selectedText).toBe('직접 복사할 문장');
  expect(result.extraTextareas).toBe(0);
});
