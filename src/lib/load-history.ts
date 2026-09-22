import 'server-only';
import { z } from 'zod';
import bundled from '@/data/catalog.json';
import { beijingToday, dateSchema, eventsOnDay, parseCatalog, parseIssue, readingDates, type CatalogResult } from './history';

const ROOT = 'https://raw.githubusercontent.com/EveLee-Teuk/yesterdays-headlines-data/main/';
const indexSchema = z.object({ schemaVersion: z.literal(1), today: dateSchema, updatedAt: dateSchema,
  retentionDays: z.number().int().min(1).max(31), dates: z.array(dateSchema), lastRun: z.unknown().optional() })
  .refine(index => JSON.stringify(index.dates) === JSON.stringify(readingDates(index.today, index.retentionDays)), 'Invalid archive window');
async function readRemote(path: string) {
  const response = await fetch(ROOT + path, { next: { revalidate: 60 }, signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`History HTTP ${response.status}`);
  return response.json();
}
export async function loadHistory(): Promise<CatalogResult> {
  try {
    const index = indexSchema.parse(await readRemote('archive_index.json'));
    const issues = await Promise.all(index.dates.map(async date => {
      const issue = parseIssue(await readRemote(`archives/${date}.json`));
      if (issue.date !== date) throw new Error('Archive filename/date mismatch');
      return issue;
    }));
    return { catalog: parseCatalog({ schemaVersion: 2, updatedAt: index.updatedAt,
      events: issues.flatMap(issue => issue.events), issues, retentionDays: index.retentionDays,
      ...(index.lastRun ? { lastRun: index.lastRun } : {}) }), origin: 'remote' };
  } catch {
    const today = beijingToday();
    const issues = readingDates(today).map(date => {
      const events = eventsOnDay(parseCatalog(bundled).events, date);
      return { schemaVersion: 2, timezone: 'Asia/Shanghai', date, status: events.length ? 'ready' : 'unavailable', events };
    });
    return { catalog: parseCatalog({ ...bundled, issues, events: issues.flatMap(issue => issue.events) }), origin: 'bundled' };
  }
}
