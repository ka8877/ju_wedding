/** Original instrumental loops composed for this invitation. No remote audio is downloaded. */
interface MusicArrangement {
  id: string;
  title: string;
  mood: string;
  tempo: number;
  melody: readonly (number | null)[];
  chords: readonly (readonly number[])[];
  stepsPerChord: number;
  swing: number;
  voice: 'piano' | 'music-box' | 'plucked' | 'marimba' | 'bells';
}

export const builtinMusicTracks = [
  {
    id: 'little-waltz', title: '작은 설렘', mood: '맑은 피아노 · 사랑스러운 시작',
    tempo: 106, voice: 'piano', stepsPerChord: 8, swing: 0,
    melody: [76, 79, 81, 79, 76, null, 74, 72, 74, 76, 79, null, 76, 74, 72, null,
      72, 76, 79, 81, 79, null, 76, 74, 72, 74, 76, null, 74, 71, 72, null],
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
  },
  {
    id: 'morning-bloom', title: '햇살 한 스푼', mood: '반짝이는 뮤직박스 · 포근한 아침',
    tempo: 94, voice: 'music-box', stepsPerChord: 8, swing: 0,
    melody: [83, null, 81, 78, 76, 78, 81, null, 79, 78, 76, null, 74, 76, 78, null,
      79, null, 78, 76, 74, 76, 79, 81, 78, 76, 74, null, 71, 74, 78, null],
    chords: [[55, 59, 62], [52, 55, 59], [48, 52, 55], [50, 54, 57]],
  },
  {
    id: 'sunny-walk', title: '둘이 걷는 길', mood: '통통 튀는 플럭 · 가벼운 산책',
    tempo: 114, voice: 'plucked', stepsPerChord: 8, swing: 0.12,
    melody: [72, 76, null, 79, 76, 74, 72, null, 69, 72, null, 76, 74, 72, 69, null,
      65, 69, null, 72, 74, 72, 69, null, 67, 71, 74, 79, 76, 74, 72, null],
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
  },
  {
    id: 'garden-party', title: '초록빛 파티', mood: '경쾌한 마림바 · 귀여운 축하',
    tempo: 122, voice: 'marimba', stepsPerChord: 8, swing: 0,
    melody: [77, 81, 84, null, 81, 79, 77, 76, 74, null, 77, 81, 79, 77, 74, null,
      70, 74, 77, null, 79, 77, 74, 72, 72, 76, 79, 82, 79, 76, 77, null],
    chords: [[53, 57, 60], [50, 53, 57], [46, 50, 53], [48, 52, 55]],
  },
  {
    id: 'starlight-dance', title: '별빛 인사', mood: '부드러운 벨 · 따뜻한 반짝임',
    tempo: 88, voice: 'bells', stepsPerChord: 6, swing: 0,
    melody: [81, 85, 88, 85, 83, null, 81, 80, 76, 80, 83, null,
      78, 81, 85, 88, 85, null, 83, 80, 76, 80, 81, null],
    chords: [[57, 61, 64], [52, 56, 59], [54, 57, 61], [52, 56, 59]],
  },
] as const satisfies readonly MusicArrangement[];

export type BuiltinMusicTrackId = typeof builtinMusicTracks[number]['id'];
export const defaultMusicTrackId: BuiltinMusicTrackId = 'little-waltz';

export function isBuiltinMusicTrackId(value: unknown): value is BuiltinMusicTrackId {
  return builtinMusicTracks.some(track => track.id === value);
}

/** Old saved invitations have no track ID and retain the original arrangement. */
export function getBuiltinMusicTrack(value?: string) {
  return builtinMusicTracks.find(track => track.id === value) ?? builtinMusicTracks[0];
}

/** Schedule a short look-ahead window so pause, tab hiding, and track changes stop promptly. */
export function startBuiltinMusic(context: AudioContext, volume: number, trackId?: string) {
  const track: MusicArrangement = getBuiltinMusicTrack(trackId);
  const master = context.createGain();
  master.gain.value = Math.min(1, Math.max(0, volume));
  master.connect(context.destination);
  const eighth = 60 / track.tempo / 2;
  let step = 0;
  let next = context.currentTime + 0.035;
  let stopped = false;

  const note = (midi: number, start: number, duration: number, strength: number, voice: MusicArrangement['voice'] | 'bass') => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = voice === 'plucked' || voice === 'bass' ? 'triangle' : 'sine';
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    const attack = voice === 'bells' ? 0.028 : voice === 'plucked' ? 0.004 : 0.012;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(strength, start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope); envelope.connect(master);
    oscillator.start(start); oscillator.stop(start + duration + 0.025);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    if (voice === 'music-box' || voice === 'bells') {
      // A quiet upper partial gives the bell voices sparkle without loud transients.
      const overtone = context.createOscillator();
      const shimmer = context.createGain();
      overtone.type = 'sine'; overtone.frequency.value = oscillator.frequency.value * (voice === 'bells' ? 3 : 2);
      shimmer.gain.setValueAtTime(0.0001, start);
      shimmer.gain.exponentialRampToValueAtTime(strength * 0.12, start + attack);
      shimmer.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.65);
      overtone.connect(shimmer); shimmer.connect(master);
      overtone.start(start); overtone.stop(start + duration + 0.025);
      overtone.onended = () => { overtone.disconnect(); shimmer.disconnect(); };
    }
  };

  const schedule = () => {
    if (stopped || context.state === 'closed') return;
    // After a suspended background timer, resume from now instead of scheduling
    // a backlog of notes whose timestamps have already passed.
    if (next < context.currentTime) next = context.currentTime + 0.035;
    while (next < context.currentTime + 0.25) {
      const chord = track.chords[Math.floor(step / track.stepsPerChord) % track.chords.length];
      const pitch = track.melody[step % track.melody.length];
      if (pitch !== null) {
        const duration = track.voice === 'bells' ? 0.65 : track.voice === 'marimba' ? 0.22 : track.voice === 'plucked' ? 0.25 : 0.35;
        note(pitch, next, duration, step % 2 ? 0.095 : 0.13, track.voice);
      }
      if (track.voice !== 'marimba' || step % 2 === 0) note(chord[step % 3] + 12, next, 0.27, 0.038, track.voice === 'bells' ? 'piano' : track.voice);
      if (step % (track.stepsPerChord === 6 ? 6 : 4) === 0) note(chord[0] - 12, next, 0.7, 0.045, 'bass');
      const swing = step % 2 === 0 ? 1 + track.swing : 1 - track.swing;
      step += 1; next += eighth * swing;
    }
  };
  schedule();
  const timer = window.setInterval(schedule, 100);
  return {
    master,
    trackId: track.id,
    stop: () => {
      if (stopped) return;
      stopped = true; window.clearInterval(timer); master.disconnect();
      if (context.state !== 'closed') void context.close();
    },
  };
}
