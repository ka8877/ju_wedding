import { useId } from 'react';
import { Check, Music2 } from 'lucide-react';
import type { WeddingGuestFeatures } from '../lib/types';
import { builtinMusicTracks, getBuiltinMusicTrack } from '../lib/music';
import MusicPlayer from './MusicPlayer';
import '../styles/music.css';

type MusicSettings = WeddingGuestFeatures['music'];

export default function MusicLibraryPicker({ settings, onChange }: { settings: MusicSettings; onChange: (settings: Partial<MusicSettings>) => void }) {
  const groupId = useId();
  const current = getBuiltinMusicTrack(settings.trackId);
  const customMusic = settings.source === 'url';
  return <div className="music-library-picker">
    <fieldset className="music-library-options">
      <legend>배경음악 선택</legend>
      {builtinMusicTracks.map((track, index) => {
        const selected = settings.source === 'builtin' && current.id === track.id;
        return <label className={`music-library-track${selected ? ' is-selected' : ''}`} key={track.id}>
          <input type="radio" name={groupId} value={track.id} checked={selected} onChange={() => onChange({ source: 'builtin', trackId: track.id })} />
          <span className="music-library-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <span className="music-library-track-copy"><strong>{track.title}</strong><small>{track.mood}</small></span>
          {selected ? <Check size={16} aria-hidden="true" /> : <Music2 size={15} aria-hidden="true" />}
        </label>;
      })}
    </fieldset>
    <div className="music-library-preview">
      <span><small>{customMusic ? '등록한 음악 미리듣기' : '선택한 곡 미리듣기'}</small><strong>{customMusic ? '직접 고른 음악' : current.title}</strong></span>
      <MusicPlayer settings={{ ...settings, enabled: true }} preview />
    </div>
    <p className="music-library-hint">곡을 고른 뒤 미리듣기를 눌러 보세요. 하객에게도 음악 버튼을 누를 때만 재생돼요.</p>
  </div>;
}
