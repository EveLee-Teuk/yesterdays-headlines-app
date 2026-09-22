import type { HistoryEvent } from './history';
import { formatDate } from './history';

// Use the same self-hosted typefaces as the reader.
export async function downloadPoster(event: HistoryEvent) {
  const native = (window as Window & { HeadlinesAndroid?: { postMessage: (message: string) => void } }).HeadlinesAndroid;
  if (navigator.userAgent.includes('YesterdayHeadlines/') && !native) {
    throw new Error('请先更新手机的 Android System WebView，再保存日签图片。');
  }
  await Promise.all([
    document.fonts.load('400 64px "Ma Shan Zheng"', event.title + '昨日头条'),
    document.fonts.load('400 30px "Noto Serif SC Variable"', event.summary),
  ]);
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('此浏览器不支持图片导出，请换一个浏览器重试。');
  const width = 1080, margin = 96, contentWidth = width - margin * 2;
  const serif = '"Noto Serif SC Variable", "Songti SC", serif';
  const brush = '"Ma Shan Zheng", "Noto Serif SC Variable", serif';
  const sans = '"Microsoft YaHei", sans-serif';
  function lines(text: string, font: string) {
    ctx!.font = font;
    const result: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const char of paragraph) {
        if (line && ctx!.measureText(line + char).width > contentWidth) { result.push(line); line = char; }
        else line += char;
      }
      result.push(line);
    }
    return result;
  }
  const title = lines(event.title, `64px ${brush}`);
  const body = lines(event.summary, `30px ${serif}`);
  const sources = event.sources.flatMap(source => lines(`${source.name} · ${source.url}`, `21px ${sans}`));
  const height = Math.max(1440, 850 + title.length * 90 + body.length * 52 + sources.length * 32);
  canvas.width = width; canvas.height = height;
  ctx.fillStyle = '#f6f2e9'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#d8d0c1'; ctx.strokeRect(40, 40, width - 80, height - 80);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#b3432f'; ctx.font = `48px ${brush}`; ctx.fillText('昨日头条', margin, 100);
  ctx.fillStyle = '#777064'; ctx.font = `22px ${sans}`; ctx.fillText('历史日签 / ON THIS DAY', margin, 168);
  ctx.fillStyle = '#b3432f'; ctx.font = '150px Georgia'; ctx.fillText(event.date.slice(5).replace('-', ' / '), margin - 5, 230);
  ctx.font = `25px ${sans}`; ctx.fillText(`历史上的这一天 · ${event.date.slice(0, 4)}年`, margin, 402);
  ctx.strokeStyle = '#b3432f'; ctx.beginPath(); ctx.moveTo(margin, 463); ctx.lineTo(width - margin, 463); ctx.stroke();
  let y = 510;
  ctx.fillStyle = '#24251f'; ctx.font = `64px ${brush}`;
  for (const line of title) { ctx.fillText(line, margin, y); y += 90; }
  y += 22; ctx.fillStyle = '#777064'; ctx.font = `24px ${sans}`;
  ctx.fillText(`${formatDate(event.date)}  /  ${event.location}  /  ${event.category}`, margin, y); y += 66;
  ctx.fillStyle = '#45463d'; ctx.font = `30px ${serif}`;
  for (const line of body) { ctx.fillText(line, margin, y); y += 52; }
  y += 45; ctx.fillStyle = '#777064'; ctx.font = `21px ${sans}`;
  for (const line of sources) { ctx.fillText(line, margin, y); y += 32; }
  ctx.fillStyle = '#b3432f'; ctx.font = `22px ${sans}`; ctx.fillText('翻过日历，读到历史。', margin, height - 105);
  const dataUrl = canvas.toDataURL('image/png');
  if (native) {
    native.postMessage(JSON.stringify({ type: 'savePoster', data: dataUrl, filename: `昨日头条-${event.date}.png` }));
    return dataUrl;
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('生成图片失败，请重试。')), 'image/png'));
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `昨日头条-${event.date}-${event.id}.png`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return dataUrl;
}
