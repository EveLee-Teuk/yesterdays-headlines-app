'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, ArrowRight, Bookmark, Check } from 'lucide-react';
import { formatDate, type HistoryEvent } from '@/lib/history';
import { prepareBrushText } from '@/lib/brush-font';
import { useHorizontalSwipe } from '@/hooks/useHorizontalSwipe';
import BrushText from '@/components/BrushText';

gsap.registerPlugin(useGSAP);
type Turn = { id: number; from: HistoryEvent; toId: string; direction: number; height: number };

export default function StoryBook({ events, onOpen, renderSave, onFinish, disabled = false }: {
  events: HistoryEvent[];
  onOpen: (event: HistoryEvent) => void;
  renderSave: (event: HistoryEvent) => ReactNode;
  onFinish?: () => void;
  disabled?: boolean;
}) {
  const [selectedId, setSelectedId] = useState(events[0]?.id);
  const [turn, setTurn] = useState<Turn | null>(null);
  const serial = useRef(0);
  const book = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLElement>(null);
  const index = Math.max(0, events.findIndex(event => event.id === selectedId));
  const current = events[index];

  useEffect(() => {
    if (current?.id !== selectedId) {
      setSelectedId(current?.id);
      setTurn(null);
    }
  }, [current?.id, selectedId]);

  useEffect(() => {
    // Prepare nearby brush headings before a swipe reveals the next sheet.
    for (const event of events.slice(Math.max(0, index - 1), index + 2)) void prepareBrushText(event.title);
  }, [events, index]);

  function move(amount: number) {
    const next = events[index + amount];
    if (disabled || !next || !current) return;
    const top = book.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 16) {
      window.scrollTo({ top: Math.max(0, window.scrollY + top - 16), behavior: 'instant' });
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTurn(reduced ? null : {
      id: ++serial.current, from: current, toId: next.id, direction: amount,
      height: page.current?.offsetHeight || 0,
    });
    setSelectedId(next.id);
  }
  const swipe = useHorizontalSwipe(move, disabled || events.length < 2);

  useGSAP(() => {
    if (!turn) return;
    const finish = () => setTurn(value => value?.id === turn.id ? null : value);
    if (disabled || current?.id !== turn.toId) { finish(); return; }
    const media = gsap.matchMedia();
    media.add({ motion: '(prefers-reduced-motion: no-preference)', reduced: '(prefers-reduced-motion: reduce)' }, context => {
      if (context.conditions?.reduced) { finish(); return; }
      const oldPage = book.current?.querySelector('.turning-page');
      const newPage = book.current?.querySelector('.book-page');
      const shadow = book.current?.querySelector('.book-turn-shadow');
      const origin = turn.direction > 0 ? '0% 50%' : '100% 50%';
      const timeline = gsap.timeline({ defaults: { ease: 'power2.inOut' }, onComplete: finish });
      // A complete single page turn needs 480ms; only transforms/opacity animate.
      if (oldPage) timeline.fromTo(oldPage,
        { rotationY: 0, opacity: 1, transformPerspective: 1500, transformOrigin: origin, willChange: 'transform,opacity' },
        { rotationY: 104 * turn.direction, duration: 0.48 }, 0)
        .to(oldPage, { opacity: 0, duration: 0.12 }, 0.34);
      if (newPage) timeline.fromTo(newPage, { opacity: 0.6 },
        { opacity: 1, duration: 0.3, clearProps: 'opacity' }, 0.08);
      if (shadow) timeline.fromTo(shadow, { opacity: 0.2 }, { opacity: 0, duration: 0.44 }, 0);
    }, book);
    return () => media.revert();
  }, { scope: book, dependencies: [turn, current?.id, disabled], revertOnUpdate: true });

  if (!current) return null;

  const content = (event: HistoryEvent, decorative = false) => <>
    <span className="paper-corners" aria-hidden="true"><i /><i /><i /><i /></span>
    <div className="story-topline"><span className="story-category">{event.category}</span>{decorative ? <span className="save-button"><Bookmark size={22} /></span> : renderSave(event)}</div>
    <div className="story-page-content">
      <div className="story-era"><span>{event.date.slice(0, 4)}</span><small>年 / {formatDate(event.date, false)}</small></div>
      <h2 className={event.title.length > 20 ? 'long-title' : undefined}>{decorative
        ? <BrushText text={event.title} />
        : <button data-swipe-title onClick={() => onOpen(event)}><BrushText text={event.title} /></button>}</h2>
      <p className="lead-summary">{event.summary.split('\n')[0]}</p>
    </div>
    <div className="story-foot"><span><Check size={14} />来源：{event.sources[0].name}</span>{decorative
      ? <span className="read-link">读这一页<ArrowRight size={17} /></span>
      : <button className="read-link" onClick={() => onOpen(event)}>读这一页<ArrowRight size={17} /></button>}</div>
  </>;

  return <div className="story-book" ref={book}>
    <div className="book-stack swipe-surface" style={{ minHeight: turn?.height || undefined }}
      role="group" aria-label="历史日签，可左右滑动翻阅" tabIndex={events.length > 1 ? 0 : undefined}
      {...swipe} onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); }
      }}>
      {events.length > 1 && <div className="book-underpages" aria-hidden="true"><i /><i /></div>}
      <article className="lead-story book-page" ref={page} aria-label={current.title}>{content(current)}</article>
      {turn && <div className="lead-story turning-page" aria-hidden="true">{content(turn.from, true)}</div>}
      <span className="book-turn-shadow" aria-hidden="true" />
    </div>
    {events.length > 1 && <nav className="book-navigation" aria-label="文章翻页">
      <button disabled={index === 0 || disabled} onClick={() => move(-1)}><ArrowLeft size={18} />上一篇</button>
      <span className="book-position" aria-live="polite" aria-atomic="true" aria-label={`第${index + 1}篇，共${events.length}篇`}>{index + 1} / {events.length}</span>
      <button disabled={index === events.length - 1 || disabled} onClick={() => move(1)}>下一篇<ArrowRight size={18} /></button>
    </nav>}
    {onFinish && index === events.length - 1 && <div className="end-note"><span>终</span><p>这一天，读完了。</p><button onClick={onFinish}>翻阅其他日期<ArrowRight size={16} /></button></div>}
  </div>;
}
