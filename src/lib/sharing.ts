import { resolvePublicSiteUrl } from './site-url';

export const publicInvitationUrl = resolvePublicSiteUrl(import.meta.env.VITE_PUBLIC_SITE_URL);

/**
 * Every share uses the single public invitation, including local/admin previews
 * and visits through an old address. The browser's current origin is never a
 * share target. Arguments remain for existing callers of this public helper.
 */
export function invitationUrl(_href: string, _preview = false): string {
  return publicInvitationUrl;
}

export const invitationQrSize = 1536;

export async function invitationQr(url: string): Promise<string> {
  const { toDataURL } = await import('qrcode');
  return toDataURL(url, {
    width: invitationQrSize,
    margin: 4,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
}
