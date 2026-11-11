import { useRef, useState } from 'react';
import { Download, FileUp, LoaderCircle } from 'lucide-react';
import type { WeddingData } from '../lib/types';
import { normalizeWedding } from '../lib/validation';
import '../styles/backup.css';

interface Props {
  data: WeddingData; onChange: (data: WeddingData) => void; onUpload: (file: File) => Promise<string>;
  mode: 'cloud' | 'local'; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}
export default function BackupTools({ data, onChange, onUpload, mode, disabled = false, onBusyChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  function download() {
    const contents = { format: 'jo-and-joo-backup', formatVersion: 1, exportedAt: new Date().toISOString(), wedding: data };
    const file = new Blob([JSON.stringify(contents, null, 2)], { type: 'application/json' });
    if (file.size > 32 * 1024 * 1024) { setError(true); setMessage('백업이 32MB를 넘었어요. 사진 수나 크기를 줄인 뒤 다시 내려받아 주세요.'); return; }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a'); a.href = url; a.download = `juyoung-hyunbeom-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setError(false); setMessage('백업 파일을 내려받았어요. 계좌와 연락처도 포함되니 개인 보관해 주세요.');
  }
  async function importFile(file: File) {
    if (busy || disabled) return;
    setMessage(''); setError(false);
    if (file.size > 32 * 1024 * 1024) { setError(true); setMessage('32MB 이하의 청첩장 백업 파일을 선택해 주세요.'); return; }
    let next: WeddingData;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.format && (parsed.format !== 'jo-and-joo-backup' || parsed.formatVersion !== 1)) throw new Error('지원하지 않는 백업 형식입니다.');
      next = normalizeWedding(parsed?.format === 'jo-and-joo-backup' ? parsed.wedding : parsed);
    } catch (e) { setError(true); setMessage(e instanceof SyntaxError ? '청첩장 백업 JSON 파일을 선택해 주세요.' : e instanceof Error ? e.message : '파일을 읽지 못했습니다.'); return; }
    if (!window.confirm('백업 내용을 편집 중인 초안으로 가져올까요? 아직 공개 청첩장은 바뀌지 않아요. 실행 취소로 되돌릴 수 있습니다.')) return;
    setBusy(true); onBusyChange?.(true);
    try {
      if (mode === 'cloud') {
        const images = [next.coverPhoto, ...next.photos.map(p => p.url)].filter(u => u.startsWith('data:image/'));
        const urls = [...new Set(images)];
        const moved = new Map<string, string>();
        for (const [index, image] of urls.entries()) {
          setMessage(`기기에 저장된 사진을 옮기고 있어요. ${index + 1} / ${urls.length}`);
          const response = await fetch(image); const blob = await response.blob();
          const url = await onUpload(new File([blob], `backup-${index}.webp`, { type: blob.type }));
          moved.set(image, url);
        }
        next = { ...next, coverPhoto: moved.get(next.coverPhoto) ?? next.coverPhoto, photos: next.photos.map(p => ({ ...p, url: moved.get(p.url) ?? p.url })) };
      }
      onChange(next); setMessage('초안으로 가져왔어요. 미리보기에서 확인한 뒤 저장해 주세요.');
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : '가져오지 못했습니다. 기존 초안은 유지됩니다.'); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  return <section className="backup-tools" aria-labelledby="backup-title">
    <h3 id="backup-title">우리의 초대장, 안전하게 간직하기</h3>
    <p>새 기기로 옮기거나 연결을 바꾸기 전에 백업해 두세요.<br />가져온 내용은 초안에만 적용되며, 공개 반영 전까지 하객에게 보이지 않아요.</p>
    <div><button type="button" disabled={disabled || busy} onClick={download}><Download size={15} />백업 내려받기</button><button type="button" disabled={disabled || busy} onClick={() => input.current?.click()}>{busy ? <LoaderCircle size={15} className="app-spin" /> : <FileUp size={15} />}백업 가져오기</button></div>
    <input ref={input} type="file" accept=".json,application/json" aria-label="청첩장 백업 파일 선택" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importFile(file); }} />
    {message && <p role={error ? 'alert' : 'status'} className={error ? 'backup-error' : 'backup-message'}>{message}</p>}
    <small>온라인 사진은 주소로 백업됩니다. 사진 원본도 따로 보관해 주세요.</small>
  </section>;
}
