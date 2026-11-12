import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, Music2, Pause, Play } from 'lucide-react';
import type { WeddingData } from '../lib/types';
import '../styles/music.css';

type MusicSettings = WeddingData['guestFeatures']['music'];

/** An original, light major-key loop. Nothing plays until the guest taps play. */
function startLittleWaltz(context: AudioContext, volume: number) {
  const master = context.createGain();
  master.gain.value = volume;
  master.connect(context.destination);
  const melody = [76, 79, 81, 79, 76, null, 74, 72, 74, 76, 79, null, 76, 74, 72, null,
    72, 76, 79, 81, 79, null, 76, 74, 72, 74, 76, null, 74, 71, 72, null];
  const chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
  const eighth = 60 / 106 / 2;
  let beat = 0;
  let next = context.currentTime + 0.035;
  const note = (midi: number, start: number, length: number, strength: number, wave: OscillatorType = 'sine') => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(strength, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(envelope); envelope.connect(master);
    oscillator.start(start); oscillator.stop(start + length + 0.025);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  };
  const schedule = () => {
    if (context.state === 'closed') return;
    while (next < context.currentTime + 0.25) {
      const chord = chords[Math.floor(beat / 8) % chords.length];
      const pitch = melody[beat % melody.length];
      if (pitch !== null) note(pitch, next, 0.35, beat % 2 ? 0.095 : 0.13);
      note(chord[beat % 3] + 12, next, 0.27, 0.038);
      if (beat % 4 === 0) note(chord[0] - 12, next, 0.7, 0.045, 'triangle');
      beat += 1; next += eighth;
    }
  };
  schedule();
  const timer = window.setInterval(schedule, 100);
  return { master, stop: () => { window.clearInterval(timer); master.disconnect(); void context.close(); } };
}

export default function MusicPlayer({ settings, preview = false }: { settings: MusicSettings; preview?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const builtin = useRef<ReturnType<typeof startLittleWaltz> | null>(null);
  const operation = useRef(0);
  const pending = useRef(false);
  const volume = Math.min(1, Math.max(0, settings.volume));
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
  useEffect(() => { stop(); setError(''); }, [settings.enabled, settings.source, settings.url, stop]);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
    if (builtin.current) builtin.current.master.gain.value = volume;
  }, [volume]);

  async function toggle() {
    if (pending.current) return;
    if (playing) { stop(); return; }
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
          builtin.current = startLittleWaltz(context, volume);
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
  const control = <div className={`invite-music-player${preview ? ' invite-music-player--preview' : ''}`}>
    <button type="button" className="invite-music-toggle" onClick={() => void toggle()} aria-label={playing ? '배경음악 일시정지' : '배경음악 재생'} aria-pressed={playing} disabled={busy} title="버튼을 누르면 음악이 재생됩니다">
      {busy ? <LoaderCircle size={15} className="app-spin" /> : playing ? <Pause size={14} /> : <Play size={14} />}
      <span>{preview ? playing ? '함께 듣는 우리 BGM' : '우리의 작은 BGM' : 'BGM'}</span>
      {preview && <Music2 size={14} strokeWidth={1.5} />}
    </button>
    {error && <p role="status">{error}</p>}
  </div>;
  return preview ? control : createPortal(control, document.body);
}
