import { existsSync } from 'node:fs';
import * as http from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeWedding } from '../src/lib/validation.ts';
import { publicSupabaseConfig } from '../src/lib/public-config.ts';

export class ConnectionError extends Error {}

export function connectionConfig(env = process.env, fallback = publicSupabaseConfig) {
  const overrideUrl = env.VITE_SUPABASE_URL?.trim();
  const overrideKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (Boolean(overrideUrl) !== Boolean(overrideKey)) throw new ConnectionError('Supabase 환경 변수로 덮어쓸 때는 프로젝트 URL과 공개 키를 함께 설정해 주세요.');
  const rawUrl = overrideUrl || fallback?.url;
  const key = overrideKey || fallback?.key;
  if (!rawUrl || !key) throw new ConnectionError('Supabase 프로젝트 URL과 공개용 키가 필요합니다. VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 환경 변수 또는 .env.local에 설정해 주세요.');
  let url;
  try { url = new URL(rawUrl); } catch { throw new ConnectionError('프로젝트 URL은 https://프로젝트-ref.supabase.co 형식이어야 합니다.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new ConnectionError('Supabase 대시보드의 HTTPS 프로젝트 URL을 입력해 주세요. 경로·쿼리·포트가 붙은 주소는 사용할 수 없습니다.');
  }
  let legacyAnon = false;
  if (key.startsWith('sb_publishable_') && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    // Publishable keys belong in the apikey header, not a JWT Bearer header.
  } else {
    try {
      const parts = key.split('.');
      legacyAnon = parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'anon';
    } catch { /* Reject malformed, secret and service-role keys below. */ }
    if (!legacyAnon) throw new ConnectionError('Publishable key 또는 기존 anon/public key만 사용할 수 있습니다. secret 키·service_role 키·관리자 비밀번호를 넣지 마세요.');
  }
  return { url: url.origin, key, legacyAnon };
}

async function jsonResponse(response) {
  try { return await response.json(); } catch { return null; }
}

// Read-only probes. No login, writes, image upload, credentials or payload logging.
export async function checkConnection(config, fetcher = fetch, log = console.log) {
  const headers = { apikey: config.key, 'Content-Type': 'application/json' };
  if (config.legacyAnon) headers.Authorization = `Bearer ${config.key}`;
  const request = async (path, options = {}) => {
    try {
      return await fetcher(`${config.url}${path}`, { ...options, headers, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new ConnectionError('Supabase에 연결하지 못했습니다. 프로젝트가 활성 상태인지, 네트워크에서 해당 *.supabase.co 주소가 허용되는지 확인해 주세요.');
    }
  };

  const rpc = await request('/rest/v1/rpc/get_published_wedding', { method: 'POST', body: '{}' });
  const publication = await jsonResponse(rpc);
  if (!rpc.ok) {
    if (rpc.status === 404 && publication?.code === 'PGRST202') throw new ConnectionError('공개 조회 함수가 없습니다. Supabase SQL Editor에서 supabase/migrations/001_wedding.sql 전체를 실행해 주세요.');
    throw new ConnectionError(`공개 청첩장 조회가 실패했습니다(HTTP ${rpc.status}). 프로젝트 URL·공개 키·프로젝트 활성 상태와 네트워크 접근을 확인해 주세요.`);
  }
  const validRow = row => {
    try {
      normalizeWedding(row?.data);
      return typeof row.updated_at === 'string' && Number.isFinite(Date.parse(row.updated_at));
    } catch { return false; }
  };
  if (!Array.isArray(publication) || publication.length > 1 || !publication.every(validRow)) {
    throw new ConnectionError('공개 조회 응답이 청첩장 형식과 맞지 않습니다. SQL을 확인하고 관리자 화면에서 올바른 내용을 다시 공개해 주세요.');
  }
  log(publication.length ? '✓ 공개 청첩장 조회와 데이터 형식을 확인했습니다.' : '✓ 공개 조회 함수가 준비됐습니다. 아직 공개한 청첩장은 없습니다.');

  for (const [table, column] of [['wedding_content', 'id'], ['wedding_admins', 'user_id']]) {
    const response = await request(`/rest/v1/${table}?select=${column}&limit=1`);
    const body = await jsonResponse(response);
    if (![401, 403].includes(response.status) || body?.code !== '42501') {
      throw new ConnectionError(`${table}의 익명 읽기 차단을 확인하지 못했습니다. SQL 전체를 다시 실행하고 테이블 권한·RLS를 확인해 주세요. 이 상태에서는 연결 완료로 처리할 수 없습니다.`);
    }
    log(`✓ ${table}: 익명 사용자의 직접 조회가 차단됩니다.`);
  }

  const missingFile = `main/.connection-check-${crypto.randomUUID()}.webp`;
  const storage = await request(`/storage/v1/object/public/wedding-photos/${missingFile}`);
  const body = await jsonResponse(storage);
  const objectMissing = /object not found/i.test(`${body?.message || ''} ${body?.error || ''}`);
  if (![400, 404].includes(storage.status) || !objectMissing) {
    throw new ConnectionError('공개 사진 버킷을 확인하지 못했습니다. SQL 전체를 실행해 wedding-photos 버킷이 생성됐는지 확인해 주세요. 사진을 올리거나 삭제하지는 않았습니다.');
  }
  log('✓ 공개 사진 버킷 경로가 준비됐습니다(읽기 전용 확인).');
  log('연결 점검을 통과했습니다. 관리자 로그인·실제 사진 업로드·다른 기기에서 공개 반영은 별도로 확인해 주세요.');
  return { published: publication.length === 1, checks: 4 };
}

async function main() {
  try {
    if (typeof process.loadEnvFile !== 'function') throw new ConnectionError('Node.js 24 LTS에서 실행해 주세요.');
    // Existing process environment wins; local overrides .env defaults.
    for (const relativePath of ['../.env.local', '../.env']) {
      const path = fileURLToPath(new URL(relativePath, import.meta.url));
      if (existsSync(path)) process.loadEnvFile(path);
    }
    const config = connectionConfig();
    if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
      if (typeof http.setGlobalProxyFromEnv !== 'function') throw new ConnectionError('프록시 연결 점검에는 최신 Node.js 24 LTS가 필요합니다.');
      http.setGlobalProxyFromEnv();
    }
    await checkConnection(config);
  } catch (error) {
    // Only our curated messages are printed. Provider errors may include values.
    const message = error instanceof ConnectionError ? error.message : '연결 점검 중 오류가 발생했습니다. 설정과 Node.js 버전을 확인해 주세요.';
    console.error(message);
    if (process.env.GITHUB_ACTIONS === 'true') console.log(`::warning title=Supabase 연결 확인::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
