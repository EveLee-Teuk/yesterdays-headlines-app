type FontLoader = { load: (font: string, text: string) => Promise<unknown[]> };
export type BrushFontStatus = 'ready' | 'fallback';

// Load every Unicode shard needed by this title. A deadline releases reading,
// and the settled result prevents a slow response from swapping fonts later.
export function loadBrushFont(fonts: FontLoader | undefined, text: string, timeout = 8000): Promise<BrushFontStatus> {
  if (!fonts) return Promise.resolve('fallback');
  return new Promise(resolve => {
    let settled = false;
    const finish = (status: BrushFontStatus) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(status);
    };
    const timer = setTimeout(() => finish('fallback'), timeout);
    try {
      fonts.load('400 48px "Ma Shan Zheng"', text).then(faces => finish(faces.length ? 'ready' : 'fallback'), () => finish('fallback'));
    } catch { finish('fallback'); }
  });
}

const requests = new Map<string, Promise<BrushFontStatus>>();
export function prepareBrushText(text: string) {
  const existing = requests.get(text);
  if (existing) return existing;
  const request = loadBrushFont(document.fonts, text);
  requests.set(text, request);
  void request.then(status => { if (status === 'fallback') requests.delete(text); });
  return request;
}
