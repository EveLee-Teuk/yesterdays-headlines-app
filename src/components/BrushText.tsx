'use client';

import { useEffect, useState } from 'react';
import { prepareBrushText, type BrushFontStatus } from '@/lib/brush-font';

export default function BrushText({ text }: { text: string }) {
  // Reset even for A -> B -> A while B is still loading; never reuse A's old fallback.
  return <BrushGlyphs key={text} text={text} />;
}

function BrushGlyphs({ text }: { text: string }) {
  const [result, setResult] = useState<{ text: string; status: BrushFontStatus } | null>(null);
  const status = result?.text === text ? result.status : 'loading';
  useEffect(() => {
    let cancelled = false;
    void prepareBrushText(text).then(status => { if (!cancelled) setResult({ text, status }); });
    return () => { cancelled = true; };
  }, [text]);
  return <span className="brush-text" data-brush-text={text} data-font-state={status} aria-busy={status === 'loading'}><span className="brush-glyphs">{text}</span></span>;
}
