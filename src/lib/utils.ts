export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return; }
    catch { /* Some in-app browsers expose this API but deny clipboard access. */ }
  }
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousInput = previousFocus instanceof HTMLInputElement || previousFocus instanceof HTMLTextAreaElement ? previousFocus : null;
  const inputSelection = previousInput && previousInput.selectionStart !== null
    ? { start: previousInput.selectionStart, end: previousInput.selectionEnd!, direction: previousInput.selectionDirection ?? 'none' }
    : null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const input = document.createElement('textarea');
  input.value = text; input.readOnly = true; input.tabIndex = -1;
  Object.assign(input.style, { position: 'fixed', top: '0', left: '0', opacity: '0', fontSize: '16px' });
  let copied = false;
  try {
    // A native modal makes the rest of the document inert, including body-level inputs.
    (previousFocus?.closest('dialog[open]') ?? document.body).appendChild(input);
    input.focus({ preventScroll: true }); input.select();
    copied = document.execCommand('copy');
  } catch { /* Report a consistent message if both clipboard methods fail. */ }
  finally {
    input.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
    if (previousInput?.isConnected && inputSelection) previousInput.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction);
  }
  if (!copied) throw new Error('복사하지 못했습니다. 길게 눌러 직접 복사해 주세요.');
}
