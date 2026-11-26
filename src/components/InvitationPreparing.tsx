import { useEffect } from 'react';
import { Flower2 } from 'lucide-react';

export default function InvitationPreparing() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = '서비스 준비 중 | 모바일 청첩장';
    return () => { document.title = previousTitle; };
  }, []);

  return <main className="invitation-preparing" aria-labelledby="preparing-title">
    <div className="preparing-card">
      <div className="preparing-letter" aria-hidden="true">
        <img src={`${import.meta.env.BASE_URL}olive-sprig.svg`} alt="" />
        <div className="preparing-envelope"><Flower2 size={28} strokeWidth={1.15} /></div>
      </div>
      <h1 id="preparing-title">서비스 준비 중</h1>
      <p>초대장을 정성껏 준비하고 있어요.<br />조금 뒤, 같은 QR이나 링크로 다시 찾아와 주세요.</p>
    </div>
  </main>;
}
