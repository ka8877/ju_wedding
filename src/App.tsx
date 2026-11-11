import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, ArrowUpRight, Flower2, LockKeyhole, LoaderCircle } from 'lucide-react';
import Invitation from './components/Invitation';
const Admin = lazy(() => import('./components/Admin'));
const SetupGuide = lazy(() => import('./components/SetupGuide'));
import { defaultWedding } from './lib/defaults';
import type { WeddingData } from './lib/types';
import { cloudConfigured, loadDraft, loadPublic, publishWedding, saveDraft, supabase, uploadPhoto } from './lib/storage';
import './styles/app.css';

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <main className="login-page">
    <a href="#/" className="login-back"><ArrowLeft size={16} /> 청첩장으로 돌아가기</a>
    <section className="login-card">
      <Flower2 size={40} strokeWidth={1} className="login-flower" />
      <span className="app-eyebrow">A LITTLE SPACE FOR OUR STORY</span>
      <h1>우리의 이야기를<br /><em>함께 만들어 가요.</em></h1>
      <p>초대받은 관리자 계정으로 로그인하면<br />사진과 소중한 소식을 직접 꾸밀 수 있어요.</p>
      <form onSubmit={async event => {
        event.preventDefault(); if (busy || !supabase) return;
        setBusy(true); setError('');
        try {
          const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          if (error) throw new Error('이메일 또는 비밀번호를 확인해 주세요.');
          onLogin();
        } catch (e) { setError(e instanceof Error ? e.message : '로그인하지 못했습니다.'); }
        finally { setBusy(false); }
      }}>
        <label>이메일<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="관리자 이메일" /></label>
        <label>비밀번호<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" /></label>
        {error && <p className="app-error" role="alert">{error}</p>}
        <button className="app-button" disabled={busy}>{busy ? <LoaderCircle size={17} className="app-spin" /> : <LockKeyhole size={16} />}{busy ? '로그인 중…' : '우리 청첩장 꾸미기'}</button>
      </form>
      <small>계정 정보가 기억나지 않으면 청첩장을 준비한 가족에게 문의해 주세요.<br /><a href="#/setup">처음 연결하는 가족을 위한 안내</a></small>
    </section>
    <div className="login-signature">Hyunbeom & Juyoung</div>
  </main>;
}

export default function App() {
  const [isAdmin, setIsAdmin] = useState(() => window.location.hash.startsWith('#/admin'));
  const [setupOpen, setSetupOpen] = useState(() => window.location.hash.startsWith('#/setup'));
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [publicData, setPublicData] = useState<WeddingData>(structuredClone(defaultWedding));
  const [publicPublished, setPublicPublished] = useState(false);
  const [data, setData] = useState<WeddingData>(structuredClone(defaultWedding));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [past, setPast] = useState<WeddingData[]>([]);
  const [future, setFuture] = useState<WeddingData[]>([]);
  const savedRef = useRef<WeddingData | null>(null);
  const dataRef = useRef(data); dataRef.current = data;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const loadedRoute = useRef(isAdmin);
  const loadRequest = useRef(0);

  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash.startsWith('#/admin');
      if (loadedRoute.current && !next && dirtyRef.current && !window.confirm('저장하지 않은 수정 내용이 있어요. 청첩장으로 나갈까요?')) {
        history.replaceState(null, '', '#/admin'); return;
      }
      if (next !== loadedRoute.current) loadRequest.current += 1;
      loadedRoute.current = next; setIsAdmin(next); setSetupOpen(window.location.hash.startsWith('#/setup'));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setLoadError('로그인 상태를 확인하지 못했습니다. 새로고침해 주세요.');
      setSession(data.session); setAuthReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true); });
    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (dirty && isAdmin) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, isAdmin]);

  const refreshPublic = useCallback(async () => {
    const result = await loadPublic();
    setPublicData(result.data); setPublicPublished(Boolean(result.updatedAt));
  }, []);
  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    if (!authReady) return;
    if (isAdmin && cloudConfigured && !session) { setLoading(false); setLoadError(''); return; }
    setLoading(true); setLoadError('');
    try {
      if (isAdmin) {
        const result = await loadDraft(); if (request !== loadRequest.current) return;
        setData(result.data); dataRef.current = result.data; savedRef.current = result.data; setLastSaved(result.updatedAt); setDirty(false); setPast([]); setFuture([]);
      } else {
        const result = await loadPublic(); if (request !== loadRequest.current) return;
        setPublicData(result.data); setPublicPublished(Boolean(result.updatedAt));
      }
    } catch (e) { if (request === loadRequest.current) setLoadError(e instanceof Error ? e.message : '불러오지 못했습니다.'); }
    finally { if (request === loadRequest.current) setLoading(false); }
  }, [authReady, isAdmin, session?.user.id, refreshPublic]);
  useEffect(() => { void load(); return () => { loadRequest.current += 1; }; }, [load]);
  useEffect(() => {
    if (isAdmin) return;
    const refresh = () => { if (document.visibilityState === 'visible') void refreshPublic().catch(() => { /* Keep the current invitation during transient refresh failures. */ }); };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const channel = new BroadcastChannel('jo-and-joo'); channel.onmessage = refresh;
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); channel.close(); };
  }, [isAdmin, refreshPublic]);

  const logout = async () => {
    if (dirty && !window.confirm('저장하지 않은 수정 내용이 있어요. 로그아웃할까요?')) return;
    const result = await supabase?.auth.signOut();
    if (result?.error) { setLoadError('로그아웃하지 못했습니다. 다시 시도해 주세요.'); return; }
    setDirty(false); window.location.hash = '#/';
  };
  if (setupOpen) return <Suspense fallback={<main className="app-loading">연결 안내를 불러오고 있어요.</main>}><SetupGuide /></Suspense>;
  if (isAdmin && cloudConfigured && authReady && !session) return <Login onLogin={() => { void load(); }} />;
  if (loading || !authReady) return <main className="app-loading"><Flower2 size={38} strokeWidth={1} /><p>소중한 이야기를 불러오고 있어요.</p></main>;
  if (loadError) return <main className="app-loading"><Flower2 size={38} strokeWidth={1} /><h1>잠시만 기다려 주세요.</h1><p role="alert">{loadError}</p><button className="app-button" onClick={() => { void load(); }}>다시 불러오기</button>{isAdmin && <><a className="app-text-button" href="#/setup">처음 연결하는 가족을 위한 안내</a><button className="app-text-button" onClick={() => { void logout(); }}>청첩장으로 돌아가기 / 로그아웃</button></>}</main>;

  if (isAdmin) return <Suspense fallback={<main className="app-loading">관리 화면을 불러오고 있어요.</main>}><Admin data={data} onChange={next => {
    const previous = dataRef.current; if (next === previous) return;
    setPast(items => [...items.slice(-29), previous]); setFuture([]); dataRef.current = next; setData(next); setDirty(next !== savedRef.current);
  }}
    onUndo={() => { const previous = past.at(-1); if (!previous) return; const current = dataRef.current; setFuture(items => [current, ...items]); setPast(items => items.slice(0, -1)); dataRef.current = previous; setData(previous); setDirty(previous !== savedRef.current); }}
    onRedo={() => { const next = future[0]; if (!next) return; const current = dataRef.current; setPast(items => [...items.slice(-29), current]); setFuture(items => items.slice(1)); dataRef.current = next; setData(next); setDirty(next !== savedRef.current); }}
    canUndo={past.length > 0} canRedo={future.length > 0} isDirty={dirty}
    onSave={async () => {
      const snapshot = dataRef.current; setSaving(true);
      try { setLastSaved(await saveDraft(snapshot)); savedRef.current = snapshot; if (dataRef.current === snapshot) setDirty(false); }
      finally { setSaving(false); }
    }}
    onPublish={async () => {
      const snapshot = dataRef.current; setPublishing(true);
      try { setLastSaved(await publishWedding(snapshot)); savedRef.current = snapshot; if (dataRef.current === snapshot) setDirty(false); await refreshPublic(); }
      finally { setPublishing(false); }
    }}
    onUpload={uploadPhoto} saving={saving} publishing={publishing} mode={cloudConfigured ? 'cloud' : 'local'} onLogout={() => { void logout(); }} lastSaved={lastSaved}
    preview={<Invitation data={data} preview />}
  /></Suspense>;

  return <>
    {(!cloudConfigured || !publicPublished) && <div className="app-preview-note">{cloudConfigured ? '아직 준비 중인 청첩장입니다.' : '디자인 미리보기 · 사진과 예식 정보를 채워 주세요.'}</div>}
    <Invitation data={publicData} />
    <footer className="app-management"><a href="#/admin">우리 청첩장 관리 <ArrowUpRight size={12} /></a></footer>
  </>;
}
