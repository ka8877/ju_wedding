// Developer-owned, browser-public service identifiers. Invitation editors never
// need to supply these. Do not place client secrets or account passwords here.
export const publicIntegrationConfig = {
  naverMapClientId: 'xx9ha7ubry',
  kakaoJavascriptKey: '',
};

function configuredValue(values: unknown[], valid: (value: string) => boolean): string {
  for (const value of values) {
    if (typeof value === 'string' && valid(value.trim())) return value.trim();
  }
  return '';
}

/**
 * The registered Maps ID is a production-only fallback. Local development and
 * automated browser tests use only explicit overrides or their saved fixtures,
 * so opening a preview does not silently use the live application's quota.
 * Saved public IDs remain readable for older invitations.
 */
export function naverMapClientId(legacyValue = ''): string {
  return configuredValue([
    import.meta.env.VITE_NAVER_MAP_CLIENT_ID,
    import.meta.env.DEV ? '' : publicIntegrationConfig.naverMapClientId,
    legacyValue,
  ], value => /^[A-Za-z0-9_-]{1,100}$/.test(value));
}

export function kakaoJavascriptKey(legacyValue = ''): string {
  return configuredValue([
    import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY,
    publicIntegrationConfig.kakaoJavascriptKey,
    legacyValue,
  ], value => /^[a-f\d]{32}$/i.test(value));
}
