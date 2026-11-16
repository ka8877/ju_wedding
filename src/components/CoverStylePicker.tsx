import { Check, Image, Paintbrush } from 'lucide-react';
import type { WeddingData } from '../lib/types';
import '../styles/cover-style.css';

export default function CoverStylePicker({ data, onChange }: { data: WeddingData; onChange: (data: WeddingData) => void }) {
  const art = `${import.meta.env.BASE_URL}garden-wedding.webp`;
  return <section className="cover-style-picker" aria-labelledby="cover-style-heading">
    <div className="editor-inline-heading"><h3 id="cover-style-heading">초대장의 첫 그림</h3><span>OUR FIRST SCENE</span></div>
    <p>정원의 두 사람을 담은 일러스트로 시작하거나, 직접 고른 사진을 표지로 사용해요.</p>
    <div className="cover-style-options" role="group" aria-label="표지 이미지 선택">
      <button type="button" aria-pressed={data.design.coverStyle === 'garden'} onClick={() => onChange({ ...data, design: { ...data.design, coverStyle: 'garden' } })}>
        <img src={art} alt="" loading="lazy" /><span><Paintbrush size={14} /><strong>초록빛 정원 일러스트</strong>{data.design.coverStyle === 'garden' && <Check size={15} />}</span><small>나뭇잎 사이로 건네는 다정한 초대</small>
      </button>
      <button type="button" aria-pressed={data.design.coverStyle === 'auto'} onClick={() => onChange({ ...data, design: { ...data.design, coverStyle: 'auto' } })}>
        <img src={data.coverPhoto || `${import.meta.env.BASE_URL}botanical-still-life.svg`} alt="" loading="lazy" /><span><Image size={14} /><strong>웨딩 사진 · 테마 표지</strong>{data.design.coverStyle === 'auto' && <Check size={15} />}</span><small>{data.coverPhoto ? '아래에 등록한 사진으로 시작해요' : '사진을 올리면 표지에 바로 적용돼요'}</small>
      </button>
    </div>
    {data.design.coverStyle === 'garden' && data.coverPhoto && <p className="cover-style-preserved">등록한 표지 사진은 그대로 보관돼요. 사진 표지를 다시 선택하면 사용할 수 있어요.</p>}
  </section>;
}
