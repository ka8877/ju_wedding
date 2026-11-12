import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kakaoJavascriptKey, naverMapClientId, publicIntegrationConfig } from '../src/lib/integrations';

const original = { ...publicIntegrationConfig };
beforeEach(() => {
  publicIntegrationConfig.naverMapClientId = '';
  publicIntegrationConfig.kakaoJavascriptKey = '';
  vi.stubEnv('VITE_NAVER_MAP_CLIENT_ID', '');
  vi.stubEnv('VITE_KAKAO_JAVASCRIPT_KEY', '');
});
afterEach(() => {
  Object.assign(publicIntegrationConfig, original);
  vi.unstubAllEnvs();
});

describe('developer-owned public service integrations', () => {
  it('uses deployment configuration ahead of developer defaults and saved legacy content', () => {
    publicIntegrationConfig.naverMapClientId = 'developer-naver-id';
    publicIntegrationConfig.kakaoJavascriptKey = 'a'.repeat(32);
    vi.stubEnv('VITE_NAVER_MAP_CLIENT_ID', ' deployment-naver-id ');
    vi.stubEnv('VITE_KAKAO_JAVASCRIPT_KEY', 'B'.repeat(32));
    expect(naverMapClientId('legacy-naver-id')).toBe('deployment-naver-id');
    expect(kakaoJavascriptKey('c'.repeat(32))).toBe('B'.repeat(32));
  });

  it('ignores malformed deployment values and preserves old public-key integrations', () => {
    vi.stubEnv('VITE_NAVER_MAP_CLIENT_ID', 'https://invalid.example/key');
    vi.stubEnv('VITE_KAKAO_JAVASCRIPT_KEY', 'not-a-javascript-key');
    publicIntegrationConfig.naverMapClientId = 'developer-naver-id';
    publicIntegrationConfig.kakaoJavascriptKey = 'd'.repeat(32);
    expect(naverMapClientId('legacy-naver-id')).toBe('developer-naver-id');
    expect(kakaoJavascriptKey('e'.repeat(32))).toBe('d'.repeat(32));
    publicIntegrationConfig.naverMapClientId = '';
    publicIntegrationConfig.kakaoJavascriptKey = '';
    expect(naverMapClientId('legacy-naver-id')).toBe('legacy-naver-id');
    expect(kakaoJavascriptKey('e'.repeat(32))).toBe('e'.repeat(32));
    expect(naverMapClientId('not a valid id')).toBe('');
    expect(kakaoJavascriptKey('not a valid key')).toBe('');
  });
});
