import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, Music2, Pause, Play } from 'lucide-react';
import type { WeddingData } from '../lib/types';
import { getBuiltinMusicTrack, startBuiltinMusic } from '../lib/music';
import '../styles/music.css';

type MusicSettings = WeddingData['guestFeatures']['music'];

export default function MusicPlayer({ settings, preview = false }: { settings: MusicSettings; preview?: boolean }) {
  const playerId = useId();
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const builtin = useRef<ReturnType<typeof startBuiltinMusic> | null>(null);
  const operation = useRef(0);
  const pending = useRef(false);
  const volume = Math.min(1, Math.max(0, settings.volume));
  const track = getBuiltinMusicTrack(settings.trackId);
  const stop = useCallback(() => {
    operation.current += 1;
    if (audio.current) { audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load(); audio.current = null; }
    builtin.current?.stop(); builtin.current = null;
    pending.current = false; setBusy(false); setPlaying(false);
  }, []);

  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === 'hidden') stop(); };
    document.addEventListener('visibilitychange', onHidden);
    return () => { document.removeEventListener('visibilitychange', onHidden); stop(); };
  }, [stop]);
  useEffect(() => { stop(); setError(''); }, [settings.enabled, settings.source, settings.url, track.id, stop]);
  useEffect(() => {
    const onOtherPlayer = (event: Event) => {
      if ((event as CustomEvent<{ owner: string }>).detail?.owner !== playerId) stop();
    };
    window.addEventListener('wedding:music-start', onOtherPlayer);
    return () => window.removeEventListener('wedding:music-start', onOtherPlayer);
  }, [playerId, stop]);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
    if (builtin.current) builtin.current.master.gain.value = volume;
  }, [volume]);

  async function toggle() {
    if (pending.current) return;
    if (playing) { stop(); return; }
    window.dispatchEvent(new CustomEvent('wedding:music-start', { detail: { owner: playerId } }));
    pending.current = true; setBusy(true); setError('');
    const current = ++operation.current;
    try {
      if (settings.source === 'url') {
        const player = new Audio(settings.url);
        player.loop = true; player.preload = 'none'; player.volume = volume;
        audio.current = player;
        player.onerror = () => { stop(); setError('음악을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.'); };
        await player.play();
        if (current !== operation.current) { player.pause(); return; }
      } else {
        const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) throw new Error('Audio is unavailable');
        const context = new AudioContextClass();
        try {
          await context.resume();
          if (current !== operation.current) { void context.close(); return; }
          builtin.current = startBuiltinMusic(context, volume, track.id);
        } catch (error) { if (context.state !== 'closed') void context.close(); throw error; }
      }
      setPlaying(true);
    } catch {
      if (current === operation.current) { stop(); setError('이 브라우저에서 음악을 재생하지 못했어요. 다시 눌러 주세요.'); }
    } finally {
      if (current === operation.current) { pending.current = false; setBusy(false); }
    }
  }

  if (!settings.enabled || settings.source === 'url' && !settings.url.trim()) return null;
  const control = <div className={`invite-music-player${preview ? ' invite-music-player--preview' : ''}`} data-music-track={settings.source === 'builtin' ? track.id : 'custom'}>
    <button type="button" className="invite-music-toggle" onClick={() => void toggle()} aria-label={playing ? '배경음악 일시정지' : '배경음악 재생'} aria-pressed={playing} disabled={busy} title={settings.source === 'builtin' ? `${track.title} · ${track.mood}` : '버튼을 누르면 음악이 재생됩니다'}>
      {busy ? <LoaderCircle size={15} className="app-spin" /> : playing ? <Pause size={14} /> : <Play size={14} />}
      <span>{preview ? playing ? '미리듣기 멈추기' : '미리듣기' : 'BGM'}</span>
      {preview && <Music2 size={14} strokeWidth={1.5} />}
    </button>
    {error && <p role="status">{error}</p>}
  </div>;
  return preview ? control : createPortal(control, document.body);
}
