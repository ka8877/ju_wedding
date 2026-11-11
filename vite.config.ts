import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (Boolean(url) !== Boolean(key)) throw new Error('Supabase URL과 공개용 키를 모두 설정하거나, 둘 다 비워 미리보기로 실행하세요.');
  if (url && (!/^https:\/\//.test(url) || !URL.canParse(url))) throw new Error('Supabase 프로젝트의 HTTPS URL을 확인하세요.');
  let role = '';
  if (key?.split('.').length === 3) {
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* The SDK will validate other public key formats. */ }
  }
  if (key?.startsWith('sb_secret_') || role === 'service_role') throw new Error('프런트엔드에 비밀 키를 사용할 수 없습니다. Supabase publishable 또는 anon 키를 사용하세요.');
  return { plugins: [react()], base: process.env.BASE_PATH || '/', server: { port: 5173 } };
});
