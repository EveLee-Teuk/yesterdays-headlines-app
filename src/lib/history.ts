import { z } from 'zod';

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= '0001-01-01';
}, '无效日期');
const text = z.string().trim().min(1);
const sourceSchema = z.object({ name: text, url: z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}), date: dateSchema, evidence: text.optional() });
export const eventSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), date: dateSchema, title: text,
  category: z.enum(['科技', '民生', '社会']), location: text, summary: text,
  sources: z.array(sourceSchema).min(1), reviewedAt: dateSchema,
  verification: z.literal('source-matched').optional(),
}).refine(event => event.sources.every(source => source.date === event.date), '来源日期与事件日期冲突')
  .refine(event => event.reviewedAt >= event.date, '核对日期早于事件日期');
export const issueSchema = z.object({ schemaVersion: z.literal(2), date: dateSchema, timezone: z.literal('Asia/Shanghai'), status: z.enum(['ready', 'empty', 'unavailable']), events: z.array(eventSchema) })
  .refine(issue => issue.events.every(event => event.date.slice(5) === issue.date.slice(5) && event.date <= issue.date), '日报中混入其他日期的事件')
  .refine(issue => (issue.events.length > 0) === (issue.status === 'ready'), '日报状态与内容冲突');
export const parseIssue = (data: unknown) => issueSchema.parse(data);
export function readingDates(today: string, days = 7): string[] {
  dateSchema.parse(today);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (days - 1 - index));
    return date.toISOString().slice(0, 10);
  });
}
export function clampReadingDate(date: string, today: string, days = 7) {
  return readingDates(today, days).includes(date) ? date : today;
}
const catalogSchema = z.object({ schemaVersion: z.literal(2), updatedAt: dateSchema, events: z.array(eventSchema),
  issues: z.array(issueSchema).default([]), retentionDays: z.number().int().min(1).max(31).default(7),
  lastRun: z.object({ date: dateSchema, completedAt: z.string().datetime({ offset: true }), sourceCount: z.number().int().nonnegative(), addedCount: z.number().int().nonnegative(), status: z.enum(['ready', 'empty']) }).optional(),
})
  .refine(catalog => new Set(catalog.events.map(event => event.id)).size === catalog.events.length, '重复的事件 ID');
export type HistoryEvent = z.infer<typeof eventSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogResult = { catalog: Catalog; origin: 'remote' | 'bundled' };
export function parseCatalog(data: unknown): Catalog { return catalogSchema.parse(data); }
export function beijingToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function rolloverDate(selected: string, previousToday: string, nextToday: string) {
  return selected === previousToday ? nextToday : selected;
}
export function eventsOnDay(events: HistoryEvent[], date: string) {
  dateSchema.parse(date);
  return events.filter(event => event.date.slice(5) === date.slice(5) && event.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export function formatDate(date: string, withYear = true) {
  const [year, month, day] = date.split('-');
  return `${withYear ? `${year}年` : ''}${Number(month)}月${Number(day)}日`;
}
