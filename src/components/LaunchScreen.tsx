'use client';

import { useEffect, useState } from 'react';

export default function LaunchScreen() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (navigator.userAgent.includes('YesterdayHeadlines/')) return;
    try {
      if (sessionStorage.getItem('headlines-welcome')) return;
      sessionStorage.setItem('headlines-welcome', '1');
    } catch { /* A blocked storage must never block reading. */ }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1600);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <div className="launch-screen" role="dialog" aria-label="昨日头条开屏" onKeyDown={event => { if (event.key === 'Escape') setVisible(false); }}>
    <span className="launch-edition">YOUR DAILY HISTORY</span>
    <div className="launch-center"><span className="launch-seal">日签</span><p className="launch-title">昨日<br />头条</p><span className="launch-rule" /><p className="launch-motto">翻过日历，读到历史。</p></div>
    <button className="launch-skip" onClick={() => setVisible(false)} autoFocus>翻开今日 →</button>
  </div>;
}
