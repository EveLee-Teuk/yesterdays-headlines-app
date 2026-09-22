'use client';

import { useCallback, useEffect, useState } from 'react';
import { prepareBrushText } from '@/lib/brush-font';

export default function LaunchScreen() {
  const [visible, setVisible] = useState(false);
  const dismiss = useCallback(() => {
    setVisible(false);
    try { sessionStorage.setItem('headlines-welcome', '1'); } catch { /* Reading also works without storage. */ }
  }, []);
  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const reader = document.getElementById('reader-shell');
    if (reader) reader.inert = true;
    return () => { document.body.style.overflow = previous; if (reader) reader.inert = false; };
  }, [visible]);
  useEffect(() => {
    if (navigator.userAgent.includes('YesterdayHeadlines/')) return;
    try {
      if (sessionStorage.getItem('headlines-welcome')) return;
    } catch { /* A blocked storage must never block reading. */ }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setVisible(true);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const minimum = new Promise<void>(resolve => { timer = setTimeout(resolve, 1600); });
    const titles = [...document.querySelectorAll<HTMLElement>('[data-brush-text]')].map(element => prepareBrushText(element.dataset.brushText || ''));
    void Promise.all([minimum, ...titles]).then(() => { if (!cancelled) dismiss(); });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [dismiss]);
  if (!visible) return null;
  return <div className="launch-screen" role="dialog" aria-label="昨日头条开屏" onKeyDown={event => { if (event.key === 'Escape') dismiss(); }}>
    <span className="launch-edition">YOUR DAILY HISTORY</span>
    <div className="launch-center"><span className="launch-seal">日签</span><p className="launch-title">昨日<br />头条</p><span className="launch-rule" /><p className="launch-motto">翻过日历，读到历史。</p></div>
    <button className="launch-skip" onClick={dismiss} autoFocus>翻开今日 →</button>
  </div>;
}
