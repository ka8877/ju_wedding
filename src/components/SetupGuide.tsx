import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, Flower2, LoaderCircle } from 'lucide-react';
import schema from '../../supabase/migrations/001_wedding.sql?raw';
import { publicSupabaseConfig } from '../lib/public-config';
import { normalizeWedding } from '../lib/validation';
import { copyText } from '../lib/utils';
import '../styles/setup.css';

export default function SetupGuide() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const project = new URL(import.meta.env.VITE_SUPABASE_URL || publicSupabaseConfig.url).hostname.split('.')[0];
  const dashboard = `https://supabase.com/dashboard/project/${project}`;
  async function copy(value: string) {
    try { await copyText(value); setMessage('복사했어요. Supabase SQL Editor에 붙여넣고 Run을 눌러 주세요.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : '복사하지 못했습니다.'); }
  }
  const safeEmail = email.trim().replaceAll("'", "''");
  const adminSql = `insert into public.wedding_admins (user_id)\nselect id from auth.users\nwhere lower(email) = lower('${safeEmail}')\non conflict (user_id) do nothing;\n\nselect exists (\n  select 1 from public.wedding_admins a\n  join auth.users u on u.id = a.user_id\n  where lower(u.email) = lower('${safeEmail}')\n) as administrator_registered;`;
  async function check() {
    setChecking(true); setResult(null);
    try {
      const url = import.meta.env.VITE_SUPABASE_URL || publicSupabaseConfig.url;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY || publicSupabaseConfig.key;
      const publicClient = createClient(url, key, { auth: { storageKey: 'wedding-anonymous-connection-check', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data, error } = await publicClient.rpc('get_published_wedding').abortSignal(AbortSignal.timeout(15_000));
      if (error) throw new Error(error.code === 'PGRST202' ? '아직 저장 공간 초기화가 안 됐어요. 1단계의 SQL 전체를 실행한 뒤 다시 확인해 주세요.' : 'Supabase 연결을 확인하지 못했습니다. 프로젝트 활성 상태와 공개 키, 1단계 실행 결과를 확인해 주세요.');
      if (!Array.isArray(data) || data.length > 1) throw new Error('연결 응답 형식이 맞지 않습니다. 1단계 SQL을 다시 확인해 주세요.');
      for (const row of data) {
        try {
          normalizeWedding(row?.data);
          if (typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) throw new Error();
        } catch { throw new Error('공개한 청첩장 형식을 확인하지 못했어요. 관리자 화면에서 내용을 확인하고 다시 공개해 주세요.'); }
      }
      // The public-key client must not expose private administrator drafts.
      for (const [table, column] of [['wedding_content', 'id'], ['wedding_admins', 'user_id']]) {
        const { error: privateError } = await publicClient.from(table).select(column).limit(1).abortSignal(AbortSignal.timeout(15_000));
        if (!privateError || privateError.code !== '42501') throw new Error('초안과 관리자 목록의 공개 권한을 확인해야 합니다. 1단계 SQL을 실행하고 RLS를 확인해 주세요.');
      }
      const headers: Record<string, string> = { apikey: key };
      if (key.split('.').length === 3) headers.Authorization = `Bearer ${key}`;
      const photo = await fetch(`${url.replace(/\/$/, '')}/storage/v1/object/public/wedding-photos/main/.connection-check-${crypto.randomUUID()}.webp`, { headers, signal: AbortSignal.timeout(15_000) });
      const photoResult = await photo.json().catch(() => null);
      if (![400, 404].includes(photo.status) || !/object not found/i.test(`${photoResult?.message || ''} ${photoResult?.error || ''}`)) throw new Error('사진 저장 공간이 아직 준비되지 않았어요. 1단계 SQL을 실행해 wedding-photos 버킷을 만든 뒤 다시 확인해 주세요.');
      setResult({ ok: true, text: `공개 청첩장 조회·초안과 관리자 목록 보호·사진 저장 공간을 확인했어요.${data.length ? ' 공개한 청첩장도 정상적으로 읽었어요.' : ' 아직 공개한 청첩장은 없어요.'} 관리자 로그인과 실제 사진 업로드는 별도로 확인해 주세요.` });
    } catch (e) { setResult({ ok: false, text: e instanceof Error ? e.message : '연결하지 못했습니다.' }); }
    finally { setChecking(false); }
  }
  return <main className="setup-page">
    <a href="#/" className="setup-back"><ArrowLeft size={15} />청첩장으로 돌아가기</a>
    <header><Flower2 size={35} strokeWidth={1} /><span>ONE LITTLE STEP, A LIFETIME OF MEMORIES</span><h1>처음 한 번만 연결하면,<br />두 분이 직접 꾸밀 수 있어요.</h1><p>이 화면은 Supabase 프로젝트를 만든 가족을 위한 초기 연결 안내입니다.<br />이후에는 주영님이 관리 화면에서 바로 수정하고 공개할 수 있어요.</p></header>
    <section><b>01</b><h2>청첩장 저장 공간 만들기</h2><p>아래 설정 SQL을 복사해 Supabase의 SQL Editor에서 전체 실행하세요. 사진 저장소와 관리자 전용 권한이 함께 만들어져요. 다시 실행해도 기존 청첩장 데이터는 삭제되지 않아요.</p><div className="setup-actions"><button onClick={() => void copy(schema)}><Copy size={15} />초기 설정 SQL 복사</button><a href={`${dashboard}/sql/new`} target="_blank" rel="noreferrer">SQL Editor 열기<ExternalLink size={14} /></a></div></section>
    <section><b>02</b><h2>관리자 계정 만들기 · 추가하기</h2><p>Authentication → Users → Add user에서 로그인할 이메일과 비밀번호로 계정을 만들어 주세요. Auto Confirm User를 켜 주세요. 비밀번호는 이 사이트나 채팅에 입력해 보내실 필요가 없어요.</p><p>관리자는 여러 명 등록할 수 있습니다. 주영님·현범님·가족이 각각 사용할 이메일로 계정을 만들고, 아래 3단계를 각 이메일에 반복해 주세요. 기존 관리자는 유지됩니다. 모두 같은 청첩장을 편집하며 동시에 수정하면 마지막 저장 내용이 적용됩니다.</p><a href={`${dashboard}/auth/users`} target="_blank" rel="noreferrer">관리자 계정 만들러 가기<ExternalLink size={14} /></a></section>
    <section><b>03</b><h2>이 계정에 편집 권한 주기</h2><p>방금 만든 이메일을 아래에 입력한 뒤 권한 SQL을 복사해 같은 SQL Editor에서 실행하세요. 결과의 <code>administrator_registered</code>가 <strong>true</strong>면 완료입니다.</p><label>관리자 이메일<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="관리자로 등록한 이메일" /></label><div className="setup-actions"><button disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} onClick={() => void copy(adminSql)}><Copy size={15} />관리자 권한 SQL 복사</button><a href={`${dashboard}/sql/new`} target="_blank" rel="noreferrer">SQL Editor 열기<ExternalLink size={14} /></a></div><details><summary>추가로 확인할 로그인 설정</summary><p>Authentication 설정에서 새 사용자 공개 회원가입은 끄고 이메일 로그인은 켜 두세요. Site URL은 실제 청첩장 주소로 설정하면 됩니다. 관리자로 등록하지 않은 사람은 로그인해도 편집할 수 없어요.</p></details></section>
    {message && <p className="setup-message" role="status">{message}</p>}
    <section><b>04</b><h2>연결 확인 후 시작하기</h2><p>처음 연결 후에는 사진을 한 장 올려 공개한 다음, 다른 휴대폰에서 열어 보세요. 온라인 저장은 같은 기기 미리보기와 다르게 모든 하객에게 반영됩니다.</p><div className="setup-actions"><button disabled={checking} onClick={() => void check()}>{checking ? <LoaderCircle size={15} className="app-spin" /> : <CheckCircle2 size={15} />}연결 확인</button><a href="#/admin">관리 페이지로<ExternalLink size={14} /></a></div>{result && <p role={result.ok ? 'status' : 'alert'} className={result.ok ? 'setup-check-ok' : 'setup-check-error'}>{result.text}</p>}</section>
  </main>;
}
