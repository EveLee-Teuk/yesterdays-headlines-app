'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Bookmark, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, X } from 'lucide-react';
import { beijingToday, dateSchema, clampReadingDate, readingDates, formatDate, parseHistoryResult, hasFailedCollection, mergeHistoryResults, needsHistoryRetry, startHistoryRefresh, rolloverDate, type CatalogResult, type HistoryEvent } from '@/lib/history';
import { downloadPoster } from '@/lib/poster';
import BrushText from '@/components/BrushText';

type View = 'today' | 'archive' | 'saved';
const STORAGE = 'yesterdays-headlines:saved:v2';
const categories = ['全部', '科技', '民生', '社会'];

export function HistoryReader({ initial, initialDate }: { initial: CatalogResult; initialDate: string }) {
  const [data, setData] = useState(initial);
  const [date, setDate] = useState(initialDate);
  const [today, setToday] = useState(initialDate);
  const [view, setView] = useState<View>('today');
  const [category, setCategory] = useState('全部');
  const [saved, setSaved] = useState<string[]>([]);
  const [active, setActive] = useState<HistoryEvent | null>(null);
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [posterPreview, setPosterPreview] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const { catalog, origin } = data;
  const dates = readingDates(today, catalog.retentionDays);
  const firstDate = dates[0];
  const eligibleEvents = useMemo(() => {
    const allowed = readingDates(today, catalog.retentionDays);
    return catalog.issues.filter(issue => allowed.includes(issue.date)).flatMap(issue => issue.events);
  }, [catalog, today]);

  useEffect(() => {
    const controller = new AbortController();
    const refreshLoop = startHistoryRefresh(async () => {
      const request = new AbortController();
      const abort = () => request.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 16000);
      try {
        const response = await fetch('/api/history', { signal: request.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`History HTTP ${response.status}`);
        const value = parseHistoryResult(await response.json());
        if (controller.signal.aborted) return false;
        setData(previous => mergeHistoryResults(previous, value));
        setConnectionFailed(false);
        return !needsHistoryRetry(value);
      } catch {
        if (!controller.signal.aborted) setConnectionFailed(true);
        return false;
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener('abort', abort);
      }
    }, { isVisible: () => document.visibilityState === 'visible',
      schedule: (callback, delay) => setTimeout(callback, delay), cancel: timer => clearTimeout(timer) });
    document.addEventListener('visibilitychange', refreshLoop.trigger);
    return () => {
      controller.abort(); refreshLoop.stop();
      document.removeEventListener('visibilitychange', refreshLoop.trigger);
    };
  }, []);

  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(STORAGE) || '[]');
      if (Array.isArray(value) && value.every(id => typeof id === 'string')) setSaved(value);
    } catch { setNotice('无法读取本机收藏，阅读功能仍可正常使用。'); }
  }, []);

  useEffect(() => {
    const syncDate = () => {
      const next = beijingToday();
      if (next === today) return;
      const selected = clampReadingDate(rolloverDate(date, today, next), next, catalog.retentionDays);
      setToday(next);
      if (selected !== date) {
        setDate(selected);
        const url = new URL(location.href);
        url.searchParams.set('date', selected);
        history.replaceState(null, '', url);
      }
    };
    syncDate();
    const timer = setInterval(syncDate, 30000);
    return () => clearInterval(timer);
  }, [date, today, catalog.retentionDays]);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(location.search);
      const selected = params.get('date');
      if (selected && dateSchema.safeParse(selected).success) {
        const allowed = clampReadingDate(selected, beijingToday(), catalog.retentionDays);
        setDate(allowed);
        if (allowed !== selected) {
          const url = new URL(location.href); url.searchParams.set('date', allowed);
          history.replaceState(null, '', url);
          setNotice(`仅可阅读最近 ${catalog.retentionDays} 天的日报，已回到今天。`);
        }
      }
      const id = params.get('event');
      setActive(eligibleEvents.find(event => event.id === id) || null);
      if (id && !eligibleEvents.some(event => event.id === id)) setNotice('这篇日签不在当前保留范围内，请翻阅最近日报。');
    };
    restore(); window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [catalog, eligibleEvents]);

  useEffect(() => {
    if (active && !dialog.current?.open) dialog.current?.showModal();
    if (!active && dialog.current?.open) dialog.current.close();
    const previous = document.body.style.overflow;
    if (active) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [active]);

  function openEvent(event: HistoryEvent) {
    setNotice(''); setPosterPreview(''); setActive(event);
    const url = new URL(location.href); url.searchParams.set('event', event.id);
    history.pushState(null, '', url);
  }
  function closeEvent() {
    setActive(null); setPosterPreview(''); setNotice('');
    const url = new URL(location.href); url.searchParams.delete('event');
    history.replaceState(null, '', url);
  }
  function chooseDate(value: string) {
    if (!dateSchema.safeParse(value).success || !dates.includes(value)) return;
    setDate(value); setView('today'); setCategory('全部');
    const url = new URL(location.href); url.searchParams.set('date', value); url.searchParams.delete('event');
    history.replaceState(null, '', url);
  }
  function moveDay(amount: number) {
    const day = new Date(`${date}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + amount);
    chooseDate(day.toISOString().slice(0, 10));
  }
  function toggleSaved(event: HistoryEvent) {
    const next = saved.includes(event.id) ? saved.filter(id => id !== event.id) : [...saved, event.id];
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); setSaved(next); }
    catch { setNotice('浏览器未能保存收藏，请检查是否禁用了本地存储。'); }
  }
  async function exportEvent(event: HistoryEvent) {
    setExporting(true); setNotice('');
    try { setPosterPreview(await downloadPoster(event)); setNotice(navigator.userAgent.includes('YesterdayHeadlines/') ? '日签已生成，请在系统窗口选择保存位置。' : '日签已生成，请在浏览器下载中查看。也可长按下方图片保存。'); }
    catch (error) { setNotice(error instanceof Error ? error.message : '日签生成失败，请重试。'); }
    finally { setExporting(false); }
  }
  async function refresh() {
    setRefreshing(true); setNotice('');
    try {
      const response = await fetch('/api/history', { signal: AbortSignal.timeout(16000), cache: 'no-store' });
      if (!response.ok) throw new Error();
      const value = parseHistoryResult(await response.json());
      setData(previous => mergeHistoryResults(previous, value));
      setConnectionFailed(false);
      setNotice(needsHistoryRetry(value) ? '部分在线资料暂不可用，已保留可读内容，将自动重试。' : '内容已刷新。');
    } catch { setConnectionFailed(true); setNotice('暂时无法连接，当前已载入的内容仍可阅读。'); }
    finally { setRefreshing(false); }
  }

  const todayCollectionFailed = hasFailedCollection(catalog, today);
  const issue = catalog.issues.find(issue => issue.date === date);
  const daily = issue?.events || [];
  const source = view === 'saved' ? eligibleEvents.filter(event => saved.includes(event.id)) : daily;
  const visible = source.filter(event => category === '全部' || event.category === category)
    .sort((a, b) => a.date.localeCompare(b.date));
  const [featured, ...remaining] = visible;
  const [year, month, day] = date.split('-');
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'long', timeZone: 'Asia/Shanghai' }).format(new Date(`${date}T04:00:00Z`));
  const readingWarning = connectionFailed ? '连接暂时失败，已载入的内容仍可阅读。'
    : origin === 'bundled' || data.recovery?.indexFailed || data.recovery?.failedDates.length
      ? '部分资料暂不可用，可以稍后刷新。'
      : todayCollectionFailed ? '今日内容暂未更新，可继续阅读已有日报。' : '';

  const saveButton = (event: HistoryEvent, full = false) => (
    <button className={`save-button ${saved.includes(event.id) ? 'is-saved' : ''} ${full ? 'full-save' : ''}`} onClick={() => toggleSaved(event)}
      aria-label={`${saved.includes(event.id) ? '取消收藏' : '收藏'}：${event.title}`} aria-pressed={saved.includes(event.id)}>
      <Bookmark size={22} fill={saved.includes(event.id) ? 'currentColor' : 'none'} />{full && (saved.includes(event.id) ? '已收藏' : '收藏这一页')}
    </button>
  );

  return (
    <div className="paper-app">
      <a className="skip-link" href="#reading">跳到阅读内容</a>
      <header className="masthead">
        <div className="brand-row">
          <button className="brand" onClick={() => chooseDate(today)} aria-label="昨日头条，回到今天"><span className="brand-seal">昨日</span><span>昨日头条</span></button>
        </div>
        <nav className="main-nav" aria-label="主导航">
          <div className="nav-tabs">
            <button aria-current={view === 'today' ? 'page' : undefined} onClick={() => { setView('today'); setCategory('全部'); }}><BookOpen size={16} />每日一页</button>
            <button aria-current={view === 'archive' ? 'page' : undefined} onClick={() => { setView('archive'); setCategory('全部'); }}><CalendarDays size={16} />往日拾光</button>
            <button aria-current={view === 'saved' ? 'page' : undefined} onClick={() => { setView('saved'); setCategory('全部'); }}><Bookmark size={16} />我的收藏</button>
          </div>
        </nav>
      </header>

      <main id="reading">
        <div className="section-intro"><div>
          <h1>{view === 'today' ? `${formatDate(date, false)} · 历史日签` : view === 'archive' ? '往日，值得重读。' : '把喜欢的历史留下。'}</h1>
          {view !== 'today' && <p>{view === 'archive' ? `可翻阅最近 ${catalog.retentionDays} 天的日报。` : '收藏保存在这台设备上。'}</p>}</div>
          {view === 'today' && <div className="date-control"><button disabled={date <= firstDate} onClick={() => moveDay(-1)} aria-label="前一天"><ChevronLeft size={17} /></button>
            <label><CalendarDays size={16} /><input aria-label="选择日签日期" type="date" value={date} min={firstDate} max={today} onInput={event => chooseDate(event.currentTarget.value)} onChange={event => chooseDate(event.target.value)} /></label>
            <button disabled={date >= today} onClick={() => moveDay(1)} aria-label="后一天"><ChevronRight size={17} /></button>
          </div>}
        </div>

        <div className="reading-grid" style={view !== 'today' ? { gridTemplateColumns: '1fr' } : undefined}>
          {view === 'today' && <aside className="calendar-column">
            <section className="date-leaf" aria-label="当前阅读日期">
              <div className="leaf-top"><span>{year}</span><span>{Number(month)} 月</span></div>
              <div className="big-day">{day}</div><p className="weekday">{weekday}</p>
            </section>
            <button className="today-link" onClick={() => chooseDate(today)}><ArrowLeft size={14} />回到今天</button>
          </aside>}

          {view === 'archive' ? <section className="archive-days" aria-label="最近日报">{[...dates].reverse().map(day => {
            const archived = catalog.issues.find(item => item.date === day);
            return <button className="archive-day" key={day} aria-label={`阅读${formatDate(day)}日报`} onClick={() => chooseDate(day)}><span className="archive-date"><strong>{day.slice(-2)}</strong><small>{day.slice(0, 4)} / {Number(day.slice(5, 7))} 月</small></span><span className="archive-copy"><span>{archived?.events[0]?.title || '这一天的资料暂不可用'}</span></span><ArrowRight size={22} /></button>;
          })}</section> : <section className="stories" aria-label="历史事件">
            <div className="stories-toolbar"><div className="category-tabs" aria-label="分类筛选">{categories.map(item => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
            {featured ? <>
              <article className="lead-story">
                <div className="story-topline"><span className="story-category">{featured.category}</span>{saveButton(featured)}</div>
                <div className="story-era"><span>{featured.date.slice(0, 4)}</span><small>年 / {formatDate(featured.date, false)}</small></div>
                <h2><button onClick={() => openEvent(featured)}><BrushText text={featured.title} /></button></h2>
                <p className="lead-summary">{featured.summary.split('\n')[0]}</p>
                <div className="story-foot"><span><Check size={14} />来源：{featured.sources[0].name}</span><button className="read-link" onClick={() => openEvent(featured)}>读这一页<ArrowRight size={17} /></button></div>
              </article>
              {remaining.length > 0 && <section className="more-stories" aria-label="继续翻阅">
                <div className="more-heading"><span>继续翻阅</span><div /></div>
                {remaining.map(event => <article className="story-row" key={event.id}><div className="row-year">{event.date.slice(0, 4)}<small>{formatDate(event.date, false)}</small></div><div className="row-content"><span className="row-category">{event.category} · {event.location}</span><h2><button onClick={() => openEvent(event)}>{event.title}</button></h2><p>{event.summary.split('\n')[0]}</p></div>{saveButton(event)}</article>)}
              </section>}
              {view === 'today' && <div className="end-note"><span>终</span><p>这一页，读完了。</p><button onClick={() => { setView('archive'); setCategory('全部'); }}>再翻一页<ArrowRight size={14} /></button></div>}
            </> : <div className="empty-state"><BookOpen size={36} strokeWidth={1} /><h2>{view === 'saved' ? '这里，留给你喜欢的故事。' : category !== '全部' ? '这个分类暂时没有内容。' : !issue || issue.status === 'unavailable' ? '这一天的资料暂不可用。' : '这一天，暂留一页空白。'}</h2><p>{view === 'saved' ? '点击文章旁的书签，就能把它收在这里。' : date === today && todayCollectionFailed ? '本次采集未通过核验，已保留上次资料。可翻阅其他日期。' : !issue || issue.status === 'unavailable' ? '尚未取得可读取的日报，请稍后刷新。已保留其他日期的可读内容。' : '当天检索未找到通过核验的事件。我们不为填满一页而改写日期。'}</p><button className="primary-button" onClick={() => { setView('archive'); setCategory('全部'); }}>翻阅最近日报<ArrowRight size={16} /></button></div>}
          </section>}
        </div>

        {readingWarning && <p className="reading-warning" role="status">{readingWarning}</p>}
      </main>
      <footer className="page-footer"><span>昨日头条 <i>·</i> 你的私人历史日签</span><button className="refresh-button" disabled={refreshing} onClick={refresh}><RefreshCw size={20} className={refreshing ? 'spinning' : ''} />{refreshing ? '正在刷新' : '刷新内容'}</button></footer>
      {notice && !active && <div className="toast" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice('')}><X size={15} /></button></div>}

      <dialog ref={dialog} className="reader-dialog" aria-labelledby="article-title" onCancel={closeEvent} onClose={() => { if (active) closeEvent(); }} onClick={event => { if (event.target === event.currentTarget) closeEvent(); }}>
        {active && <div className="detail-paper"><div className="detail-toolbar"><span>{active.category}</span><button onClick={closeEvent} aria-label="关闭文章"><X size={24} /></button></div>
          <h2 id="article-title"><BrushText text={active.title} /></h2><p className="detail-meta">{formatDate(active.date)}<span> / </span>{active.location}</p>
          <div className="article-body">{active.summary.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
          <section className="sources"><h3><Check size={20} />这段历史的出处</h3>{active.sources.map(source => <div key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer"><span>{source.name}</span><ExternalLink size={20} /></a>{source.evidence && <blockquote>{source.evidence}</blockquote>}</div>)}</section>
          <div className="detail-actions">{saveButton(active, true)}<button className="primary-button" disabled={exporting} onClick={() => exportEvent(active)}><ArrowDownToLine size={17} />{exporting ? '正在生成日签…' : '保存为日签'}</button></div>
          {notice && <p className="detail-notice" role="status">{notice}</p>}
          {posterPreview && <div className="poster-preview">{/* Browser-local exported image; intentionally use img for long-press save. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={posterPreview} alt={`${active.title}历史日签预览，包含真实日期和来源`} />
          </div>}
        </div>}
      </dialog>
    </div>
  );
}
