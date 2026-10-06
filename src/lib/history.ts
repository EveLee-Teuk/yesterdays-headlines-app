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
const lastAttemptSchema = z.object({ date: dateSchema,
  outcome: z.enum(['ready', 'empty', 'failed', 'validation_failed', 'review_rejected']),
  completedAt: z.string().datetime({ offset: true }) }).optional();
const catalogSchema = z.object({ schemaVersion: z.literal(2), updatedAt: dateSchema, events: z.array(eventSchema),
  issues: z.array(issueSchema).default([]), retentionDays: z.number().int().min(1).max(31).default(7),
  lastAttempt: lastAttemptSchema,
  lastRun: z.object({ date: dateSchema, completedAt: z.string().datetime({ offset: true }), sourceCount: z.number().int().nonnegative(), addedCount: z.number().int().nonnegative(), status: z.enum(['ready', 'empty']) }).optional(),
})
  .refine(catalog => new Set(catalog.events.map(event => event.id)).size === catalog.events.length, '重复的事件 ID');
export type HistoryEvent = z.infer<typeof eventSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
const recoverySchema = z.object({ indexFailed: z.boolean(), failedDates: z.array(dateSchema) });
export type CatalogResult = { catalog: Catalog; origin: 'remote' | 'bundled'; recovery?: z.infer<typeof recoverySchema> };
export function parseHistoryResult(data: unknown): CatalogResult {
  return z.object({ catalog: catalogSchema, origin: z.enum(['remote', 'bundled']), recovery: recoverySchema.optional() }).parse(data);
}
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

const indexSchema = z.object({ schemaVersion: z.literal(1), today: dateSchema, updatedAt: dateSchema,
  retentionDays: z.number().int().min(1).max(31), dates: z.array(dateSchema), lastRun: catalogSchema.innerType().shape.lastRun,
  lastAttempt: lastAttemptSchema })
  .refine(index => JSON.stringify(index.dates) === JSON.stringify(readingDates(index.today, index.retentionDays)), 'Invalid archive window');

// Match the data collector's reusable-evidence contract for prepared issues.
// Published archives retain their existing compatibility with reviewed legacy data.
const preparedSourceHosts = ['gov.cn', 'cas.cn', 'news.cn', 'xinhuanet.com', 'people.com.cn', 'cmse.gov.cn',
  'cnsa.gov.cn', 'cctv.com', 'chinanews.com', 'gmw.cn', 'edu.cn', 'wto.org', 'un.org'];
function checkPreparedReview(issue: z.infer<typeof issueSchema>, today: string) {
  for (const event of issue.events) {
    if (event.verification !== 'source-matched' || event.date >= today || event.reviewedAt > today) {
      throw new Error('Prepared event is not a reviewed historical event');
    }
    const [year, month, day] = event.date.split('-').map(Number);
    const datedEvent = new RegExp('(?<!\\d)(?:' + year + '\\s*年\\s*0?' + month + '\\s*月\\s*0?' + day + '\\s*日'
      + '|' + year + '\\s*-\\s*0?' + month + '\\s*-\\s*0?' + day + '(?!\\d)'
      + '|' + year + '\\s*\\.\\s*0?' + month + '\\s*\\.\\s*0?' + day + '(?!\\d))');
    for (const source of event.sources) {
      const url = new URL(source.url);
      const evidence = source.evidence;
      const length = evidence ? [...evidence].length : 0;
      if (url.port || !preparedSourceHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host))
        || !evidence || length < 18 || length > 160 || !datedEvent.test(evidence)
        || /发布时间|发布日期|更新时间|责任编辑|浏览次数/.test(evidence)) {
        throw new Error('Prepared event lacks approved dated source evidence');
      }
    }
  }
}

// Inject only the network boundary so the same validation runs in production and tests.
export async function loadReviewedHistory(read: (path: string) => Promise<unknown>, bundled: unknown, today: string,
  report: (path: string, reason: string) => void): Promise<CatalogResult> {
  const fallback = parseCatalog(bundled);
  const readIssue = async (path: string, date: string) => {
    const issue = parseIssue(await read(path));
    if (issue.date !== date) throw new Error('Archive filename/date mismatch');
    if (new Set(issue.events.map(event => event.id)).size !== issue.events.length) throw new Error('Duplicate event ID');
    return issue;
  };
  // Prefetch only today's reviewed reserve. Handle rejection immediately even if
  // a ready archive wins, so an optional timeout cannot become unhandled.
  const preparedPath = `prepared/${today}.json`;
  const preparedToday = readIssue(preparedPath, today).then(issue => {
    checkPreparedReview(issue, today);
    return { issue, error: undefined };
  }).catch(error => ({ issue: undefined, error: error instanceof Error ? error.message : 'Invalid prepared issue' }));
  let index: z.infer<typeof indexSchema> | undefined;
  let indexFailed = false;
  try {
    index = indexSchema.parse(await read('archive_index.json'));
    if (index.today !== today) throw new Error(`Stale archive index: ${index.today}; expected ${today}`);
  } catch (error) {
    index = undefined; indexFailed = true;
    report('archive_index.json', error instanceof Error ? error.message : 'Invalid index');
  }
  const dates = readingDates(today, index?.retentionDays ?? 7);
  const results = await Promise.all(dates.map(async date => {
    const path = `archives/${date}.json`;
    try {
      const issue = await readIssue(path, date);
      return { issue, failed: false };
    } catch (error) {
      report(path, error instanceof Error ? error.message : 'Invalid archive');
      const events = eventsOnDay(fallback.events, date);
      return { issue: parseIssue({ schemaVersion: 2, timezone: 'Asia/Shanghai', date,
        status: events.length ? 'ready' : 'unavailable', events }), failed: true };
    }
  }));
  // IDs must also be unique across separate day files. Isolate a conflicting day
  // before deciding whether today's archive needs the reviewed reserve.
  const seen = new Set<string>();
  for (const result of results) {
    if (result.issue.events.some(event => seen.has(event.id))) {
      report(`archives/${result.issue.date}.json`, 'Duplicate event ID across archives');
      result.issue = { ...result.issue, status: 'unavailable', events: [] }; result.failed = true;
    }
    result.issue.events.forEach(event => seen.add(event.id));
  }
  const current = results.find(result => result.issue.date === today);
  if (current && (current.failed || current.issue.status !== 'ready')) {
    const { issue: prepared, error } = await preparedToday;
    if (error !== undefined) {
      report(preparedPath, error);
      current.failed = true;
    }
    if (prepared?.status === 'ready') {
      const otherIds = new Set(results.filter(result => result !== current).flatMap(result => result.issue.events.map(event => event.id)));
      if (prepared.events.some(event => otherIds.has(event.id))) {
        report(preparedPath, 'Duplicate event ID across archives');
        current.failed = true;
      } else {
        current.issue = prepared; current.failed = false;
      }
    }
  }
  const issues = results.map(result => result.issue);
  return { origin: results.some(result => !result.failed) ? 'remote' : 'bundled',
    catalog: parseCatalog({ schemaVersion: 2, updatedAt: index?.updatedAt ?? fallback.updatedAt,
      retentionDays: dates.length, issues, events: issues.flatMap(issue => issue.events),
      ...(index?.lastRun ? { lastRun: index.lastRun } : {}), ...(index?.lastAttempt ? { lastAttempt: index.lastAttempt } : {}) }),
    recovery: { indexFailed, failedDates: results.filter(result => result.failed).map(result => result.issue.date) } };
}

export function hasFailedCollection(catalog: Catalog, date: string) {
  return catalog.lastAttempt?.date === date && !['ready', 'empty'].includes(catalog.lastAttempt.outcome);
}

export function needsHistoryRetry(result: CatalogResult) {
  return result.origin === 'bundled' || !!result.recovery?.indexFailed || !!result.recovery?.failedDates.length
    || result.catalog.issues.some(issue => issue.status === 'unavailable');
}

export function mergeHistoryResults(previous: CatalogResult, next: CatalogResult): CatalogResult {
  const issues = next.catalog.issues.map(issue => {
    const old = previous.catalog.issues.find(day => day.date === issue.date);
    return old && old.status !== 'unavailable' && (issue.status === 'unavailable' || next.recovery?.failedDates.includes(issue.date)) ? old : issue;
  });
  return { ...next, catalog: parseCatalog({ ...next.catalog, issues, events: issues.flatMap(issue => issue.events) }) };
}

// Three bounded recovery attempts, then normal polling. A visibility change starts a fresh cycle.
export function startHistoryRefresh(update: () => Promise<boolean>, options: {
  isVisible: () => boolean;
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false, running = false, retries = 0;
  const normalDelay = 5 * 60 * 1000;
  const retryDelays = [3000, 15000, 45000];
  const run = async () => {
    if (stopped || running) return;
    if (timer !== undefined) options.cancel(timer);
    if (!options.isVisible()) { timer = options.schedule(run, normalDelay); return; }
    running = true;
    let healthy = false;
    try { healthy = await update(); } catch { /* The reader retains its last valid data. */ }
    running = false;
    if (stopped) return;
    const delay = !healthy && retries < retryDelays.length ? retryDelays[retries++] : normalDelay;
    if (healthy || delay === normalDelay) retries = 0;
    timer = options.schedule(run, delay);
  };
  void run();
  return { trigger: () => { retries = 0; void run(); }, stop: () => {
    stopped = true;
    if (timer !== undefined) options.cancel(timer);
  } };
}
