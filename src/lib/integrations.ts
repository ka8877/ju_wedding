// Developer-owned, browser-public service identifiers. Invitation editors never
// need to supply these. Do not place client secrets or account passwords here.
export const publicIntegrationConfig = {
  naverMapClientId: '',
  kakaoJavascriptKey: '',
};

function configuredValue(values: unknown[], valid: (value: string) => boolean): string {
  for (const value of values) {
    if (typeof value === 'string' && valid(value.trim())) return value.trim();
  }
  return '';
}

/** Saved public IDs are read only for compatibility with earlier invitations. */
export function naverMapClientId(legacyValue = ''): string {
  return configuredValue([
    import.meta.env.VITE_NAVER_MAP_CLIENT_ID,
    publicIntegrationConfig.naverMapClientId,
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
