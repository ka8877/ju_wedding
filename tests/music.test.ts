import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { builtinMusicTracks, defaultMusicTrackId, getBuiltinMusicTrack, isBuiltinMusicTrackId, startBuiltinMusic } from '../src/lib/music';

function audioContext() {
  const notes: { frequency: number; time: number }[] = [];
  const gains: { disconnect: ReturnType<typeof vi.fn> }[] = [];
  const context = {
    state: 'running', currentTime: 0, destination: {},
    createGain: () => {
      const gain = {
        gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(), disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    },
    createOscillator: () => {
      const oscillator = {
        type: 'sine', frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(),
        start: (time: number) => notes.push({ frequency: oscillator.frequency.value, time }),
        stop: vi.fn(), onended: null,
      };
      return oscillator;
    },
    close: vi.fn(async () => { context.state = 'closed'; }),
  };
  return { context, notes, gains };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setInterval, clearInterval });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('the invitation music library', () => {
  it('keeps the original tune for old saved invitations and refuses unknown track IDs', () => {
    expect(getBuiltinMusicTrack().id).toBe(defaultMusicTrackId);
    expect(getBuiltinMusicTrack('no-such-track').id).toBe(defaultMusicTrackId);
    expect(isBuiltinMusicTrackId('no-such-track')).toBe(false);
    expect(isBuiltinMusicTrackId(null)).toBe(false);
    expect(isBuiltinMusicTrackId('little-waltz')).toBe(true);
  });

  it('plays five distinct arrangements and cleans up each scheduled loop when stopped', () => {
    const signatures = new Set<string>();
    expect(builtinMusicTracks).toHaveLength(5);
    for (const track of builtinMusicTracks) {
      const { context, notes, gains } = audioContext();
      const player = startBuiltinMusic(context as unknown as AudioContext, 0.22, track.id);
      expect(player.trackId).toBe(track.id);
      expect(context.close).not.toHaveBeenCalled();
      for (let tick = 0; tick < 30; tick += 1) {
        context.currentTime += 0.1;
        vi.advanceTimersByTime(100);
      }
      expect(notes.length).toBeGreaterThan(12);
      expect(notes.every(note => Number.isFinite(note.frequency) && note.frequency > 40 && note.frequency < 20_000)).toBe(true);
      signatures.add(JSON.stringify(notes.map(note => [Math.round(note.frequency), Math.round(note.time * 1000)])));
      player.stop(); player.stop();
      expect(context.close).toHaveBeenCalledTimes(1);
      expect(gains[0].disconnect).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    }
    expect(signatures.size).toBe(5);
  });

  it('does not queue a burst of past notes after a delayed browser timer', () => {
    const { context, notes } = audioContext();
    const player = startBuiltinMusic(context as unknown as AudioContext, 0.22, 'sunny-walk');
    const count = notes.length;
    context.currentTime = 10;
    vi.advanceTimersByTime(100);
    expect(notes.slice(count).length).toBeGreaterThan(0);
    expect(notes.slice(count).every(note => note.time >= 10)).toBe(true);
    player.stop();
  });
});
