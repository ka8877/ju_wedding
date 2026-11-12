import { resolvePublicSiteUrl } from './site-url';

export const publicInvitationUrl = resolvePublicSiteUrl(import.meta.env.VITE_PUBLIC_SITE_URL);

/** Share the guest page, never an editor route or a development server. */
export function invitationUrl(href: string, preview = false): string {
  if (preview) return publicInvitationUrl;
  try {
    const url = new URL(href);
    const local = /^(localhost|0\.0\.0\.0|127(?:\.\d+){3}|\[::1\])$/.test(url.hostname) || url.hostname.endsWith('.localhost');
    if (local || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) return publicInvitationUrl;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch { return publicInvitationUrl; }
}

export async function invitationQr(url: string): Promise<string> {
  const QRCode = await import('qrcode');
  return QRCode.toDataURL(url, {
    type: 'image/png', width: 1024, margin: 4,
    errorCorrectionLevel: 'M', color: { dark: '#182119ff', light: '#ffffffff' },
  });
}
