import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { WeddingDesign } from '../lib/types';
import { bodyAlignments, buttonShapes, defaultDesign, galleryGaps, letterSpacings, lineSpacings, sectionSpacings } from '../lib/design';
import '../styles/design-customization.css';

function Choice<T extends string>({ label, hint, value, options, onChange }: {
  label: string; hint: string; value: T;
  options: { id: T; name: string; description: string }[];
  onChange: (value: T) => void;
}) {
  return <fieldset className="design-detail-choice">
    <legend>{label}</legend><p>{hint}</p>
    <div role="group" aria-label={label}>
      {options.map(option => <button type="button" key={option.id} aria-label={`${label} ${option.name}`} aria-pressed={value === option.id} title={option.description} onClick={() => onChange(option.id)}>{option.name}</button>)}
    </div>
  </fieldset>;
}

export default function DesignDetailControls({ design, onChange }: { design: WeddingDesign; onChange: (patch: Partial<WeddingDesign>) => void }) {
  return <details className="design-accordion design-details" open>
    <summary><span><SlidersHorizontal size={18} strokeWidth={1.3} /><span><strong>간격과 모양</strong><small>읽기 편한 문장부터 작은 모서리까지</small></span></span><ChevronDown size={17} /></summary>
    <div className="design-accordion-content">
      <p className="design-block-description">미리보기를 보며 두 분에게 편안한 간격을 골라 주세요. 사진과 작성한 문장은 그대로예요.</p>
      <div className="design-detail-grid">
        <Choice label="줄 간격" hint="초대의 말과 안내 문장의 줄 사이" value={design.lineSpacing} options={lineSpacings} onChange={lineSpacing => onChange({ lineSpacing })} />
        <Choice label="글자 간격" hint="본문과 안내 문장의 글자 사이" value={design.letterSpacing} options={letterSpacings} onChange={letterSpacing => onChange({ letterSpacing })} />
        <Choice label="본문 정렬" hint="초대 문구·말씀·기도·마무리 인사" value={design.bodyAlignment} options={bodyAlignments} onChange={bodyAlignment => onChange({ bodyAlignment })} />
        <Choice label="구역 사이 여백" hint="이야기마다 숨을 고르는 공간" value={design.sectionSpacing} options={sectionSpacings} onChange={sectionSpacing => onChange({ sectionSpacing })} />
        <Choice label="버튼 모양" hint="참석 응답·캘린더·공유 버튼의 모서리" value={design.buttonShape} options={buttonShapes} onChange={buttonShape => onChange({ buttonShape })} />
        <Choice label="사진 사이 간격" hint="갤러리에 담은 사진끼리의 거리" value={design.galleryGap} options={galleryGaps} onChange={galleryGap => onChange({ galleryGap })} />
      </div>
      <button type="button" className="design-detail-reset" onClick={() => onChange({ lineSpacing: defaultDesign.lineSpacing, letterSpacing: defaultDesign.letterSpacing, bodyAlignment: defaultDesign.bodyAlignment, sectionSpacing: defaultDesign.sectionSpacing, buttonShape: defaultDesign.buttonShape, galleryGap: defaultDesign.galleryGap })}><RotateCcw size={14} />간격과 모양만 기본으로</button>
    </div>
  </details>;
}
