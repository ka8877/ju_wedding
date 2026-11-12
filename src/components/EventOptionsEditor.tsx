import { cloneElement, isValidElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Bus, Camera, ClipboardCheck, ExternalLink, Images, Music2, Share2 } from 'lucide-react';
import type { WeddingData, WeddingGuestFeatures } from '../lib/types';

interface Props { data: WeddingData; onChange: (data: WeddingData) => void; }

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string; 'aria-describedby'?: string }>, { id, 'aria-describedby': hint ? `${id}-hint` : undefined })
    : children;
  return <div className="editor-field event-option-field"><label htmlFor={id}>{label}</label>{control}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="event-option-toggle"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span aria-hidden="true" /><strong>{label}</strong></label>;
}

function Card({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return <section className="event-option-card"><header><span>{icon}</span><div><h3>{title}</h3><p>{description}</p></div></header><div className="event-option-content">{children}</div></section>;
}

export default function EventOptionsEditor({ data, onChange }: Props) {
  const features = data.guestFeatures;
  const volumeId = useId();
  const update = <K extends keyof WeddingGuestFeatures>(group: K, patch: Partial<WeddingGuestFeatures[K]>) => {
    const next = { ...features, [group]: { ...features[group], ...patch } };
    const section = group === 'rsvp' || group === 'snap' || group === 'shuttle' ? group : null;
    const visibilityChanged = section && Object.hasOwn(patch, 'enabled');
    onChange({ ...data, guestFeatures: next, ...(visibilityChanged ? { design: { ...data.design, hiddenSections: data.design.hiddenSections.filter(id => id !== section) } } : {}) });
  };
  return <div className="event-options-editor">
    <div className="editor-section-heading"><span className="editor-eyebrow">06 / LITTLE DETAILS</span><h2>작은 디테일까지, 두 분답게.</h2><p>음악과 사진, 하객분들께 전할 안내를 편하게 조정해요.<br />변경한 내용은 아래에서 초안 저장 후 공개 반영해 주세요.</p></div>

    <Card icon={<Music2 size={19} />} title="가볍고 기분 좋은 배경음악" description="밝고 맑은 기본 연주를 준비했어요. 음악 버튼을 눌러야 재생됩니다.">
      <Toggle label="배경음악 사용" checked={features.music.enabled} onChange={enabled => update('music', { enabled })} />
      <Field label="배경음악 선택"><select value={features.music.source} onChange={event => update('music', { source: event.target.value as 'builtin' | 'url' })}><option value="builtin">산뜻한 기본 연주</option><option value="url">내 음악 주소 사용</option></select></Field>
      {features.music.source === 'url' && <Field label="배경음악 파일 주소" hint="재생할 수 있는 HTTPS 음원 파일 주소를 넣어 주세요. 사용 권한이 있는 음악을 선택해 주세요."><input type="url" value={features.music.url} onChange={event => update('music', { url: event.target.value })} placeholder="https://…/our-music.mp3" maxLength={2000} autoComplete="off" /></Field>}
      <div className="editor-field event-option-field"><label htmlFor={volumeId}>배경음악 음량</label><div className="event-option-volume"><input id={volumeId} type="range" aria-describedby={`${volumeId}-hint`} min={0} max={100} step={1} value={Math.round(features.music.volume * 100)} onChange={event => update('music', { volume: Number(event.target.value) / 100 })} /><output htmlFor={volumeId}>{Math.round(features.music.volume * 100)}%</output></div><small id={`${volumeId}-hint`}>하객분들이 글을 읽을 때 편안하도록 작은 음량을 권해요.</small></div>
    </Card>

    <Card icon={<Images size={19} />} title="처음에는 세 줄, 더 보고 싶을 때 펼치기" description="등록한 사진의 순서를 유지하면서 청첩장의 첫 길이를 조절해요.">
      <Field label="갤러리 처음 보이는 줄 수"><select value={features.gallery.collapsedRows} onChange={event => update('gallery', { collapsedRows: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(rows => <option key={rows} value={rows}>{rows}줄만 보여 주기{rows === 3 ? ' · 추천' : ''}</option>)}<option value={0}>처음부터 모두 보여 주기</option></select></Field>
      <p className="event-option-note">사진 메뉴에서 분위기가 비슷한 사진끼리 순서를 정해 주세요. 디자인 메뉴에서 갤러리 모자이크를 고르면 2·3칸이 섞인 콜라주로 보여요.</p>
      <button type="button" className="event-option-inline-button" onClick={() => onChange({ ...data, design: { ...data.design, galleryLayout: 'mosaic' } })} disabled={data.design.galleryLayout === 'mosaic'}>{data.design.galleryLayout === 'mosaic' ? '모자이크 콜라주가 선택돼 있어요' : '모자이크 콜라주로 바꾸기'}</button>
    </Card>

    <Card icon={<ClipboardCheck size={19} />} title="참석 여부 남기기" description="신랑측·신부측에 맞는 안내를 보여 드리고 응답을 모아요.">
      <Toggle label="참석 여부 접수 표시" checked={features.rsvp.enabled} onChange={enabled => update('rsvp', { enabled })} />
      <Field label="참석 여부 제목"><input value={features.rsvp.title} onChange={event => update('rsvp', { title: event.target.value })} maxLength={100} /></Field>
      <Field label="신랑측 참석 안내"><textarea rows={3} value={features.rsvp.groomMessage} onChange={event => update('rsvp', { groomMessage: event.target.value })} maxLength={1500} /></Field>
      <Field label="신부측 참석 안내"><textarea rows={3} value={features.rsvp.brideMessage} onChange={event => update('rsvp', { brideMessage: event.target.value })} maxLength={1500} /></Field>
      <Field label="참석 확인 안내 문구" hint="하객 화면 아래에 작은 회색 글씨로 표시해요."><input value={features.rsvp.note} onChange={event => update('rsvp', { note: event.target.value })} maxLength={300} /></Field>
      <p className="event-option-note">접수 내역은 하객 응답 메뉴에서 확인하고 엑셀용 CSV로 내려받을 수 있어요. 저장소 연결이 준비되면 실제 접수가 열립니다.</p>
    </Card>

    <Card icon={<Camera size={19} />} title="예식 날 함께 남기는 현장 스냅" description="하객분들이 찍은 사진을 두 분에게 보내는 공간이에요.">
      <Toggle label="현장 스냅 업로드 표시" checked={features.snap.enabled} onChange={enabled => update('snap', { enabled })} />
      <Field label="현장 스냅 제목"><input value={features.snap.title} onChange={event => update('snap', { title: event.target.value })} maxLength={100} /></Field>
      <Field label="현장 스냅 여는 날짜" hint="한국 시간으로 지정한 날짜부터 접수해요. 공개 반영 후 하객 화면에 적용됩니다."><input type="date" value={features.snap.openDate} onChange={event => update('snap', { openDate: event.target.value })} /></Field>
      <Field label="현장 스냅 안내 문구"><textarea rows={3} value={features.snap.message} onChange={event => update('snap', { message: event.target.value })} maxLength={1500} /></Field>
      <p className="event-option-note">받은 사진은 하객 응답 메뉴에서 두 분만 확인해요. 공개 갤러리에 자동으로 올라가지 않습니다.</p>
    </Card>

    <Card icon={<Bus size={19} />} title="대절버스 이용 안내" description="확정된 출발 장소와 시간을 지역별로 적어 주세요.">
      <Toggle label="대절버스 안내 표시" checked={features.shuttle.enabled} onChange={enabled => update('shuttle', { enabled })} />
      <Field label="대절버스 안내 제목"><input value={features.shuttle.title} onChange={event => update('shuttle', { title: event.target.value })} maxLength={100} /></Field>
      <Field label="대전 대절버스 안내" hint="아직 정해지지 않았다면 비워 두세요. 안내 준비 중으로 표시해요."><textarea rows={4} value={features.shuttle.daejeon} onChange={event => update('shuttle', { daejeon: event.target.value })} placeholder="출발 장소 · 집결 시간 · 탑승 안내" maxLength={2000} /></Field>
      <Field label="경주 대절버스 안내"><textarea rows={4} value={features.shuttle.gyeongju} onChange={event => update('shuttle', { gyeongju: event.target.value })} placeholder="출발 장소 · 집결 시간 · 탑승 안내" maxLength={2000} /></Field>
    </Card>

    <Card icon={<Share2 size={19} />} title="카카오톡으로 초대 전하기" description="기본 휴대폰 공유와 QR은 별도 설정 없이 사용할 수 있어요.">
      <Field label="카카오 JavaScript 키" hint="카카오톡 직접 공유를 연결할 때만 입력해 주세요. Secret 키나 관리자 비밀번호는 넣지 않아요."><input value={features.sharing.kakaoJavascriptKey} onChange={event => update('sharing', { kakaoJavascriptKey: event.target.value.trim() })} maxLength={100} autoComplete="off" spellCheck={false} placeholder="선택 사항 · 카카오 개발자 JavaScript 키" /></Field>
      <p className="event-option-note">카카오 개발자 앱의 Web 플랫폼에 이 청첩장의 도메인을 등록해야 해요. 키를 비워 두면 휴대폰의 기본 공유로 전할 수 있습니다.</p>
      <a className="event-option-inline-button" href="https://developers.kakao.com/console/app" target="_blank" rel="noreferrer">카카오 개발자 앱 설정<ExternalLink size={13} /></a>
    </Card>
    <p className="event-option-bottom-note">페이지의 표시 순서와 숨기기는 디자인 → 직접 세부 꾸미기 → 청첩장의 순서와 제목에서 바꿀 수 있어요.</p>
  </div>;
}
