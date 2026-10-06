import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as history from '../src/lib/history.ts';

const fixture = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'));
const today = '2026-09-22';
const dates = history.readingDates(today);
const issue = date => ({ schemaVersion: 2, date, timezone: 'Asia/Shanghai', status: date === today ? 'ready' : 'empty', events: date === today ? [fixture.events[0]] : [] });
const index = { schemaVersion: 1, today, updatedAt: today, retentionDays: 7, dates };

for (const failure of ['timeout', '404', 'schema']) {
  test(`one archive ${failure} preserves all other validated days`, async () => {
    assert.equal(typeof history.loadReviewedHistory, 'function');
    const warnings = [];
    const result = await history.loadReviewedHistory(async path => {
      if (path === 'archive_index.json') return index;
      const date = path.slice(9, -5);
      if (date === dates[2]) {
        if (failure === 'schema') return { ...issue(date), events: [fixture.events[0]], status: 'ready' };
        throw new Error(failure);
      }
      return issue(date);
    }, fixture, today, (path, reason) => warnings.push({ path, reason }));
    assert.equal(result.origin, 'remote');
    assert.equal(result.catalog.events[0].id, fixture.events[0].id);
    assert.equal(result.catalog.issues.filter(day => day.status === 'empty').length, 5);
    assert.equal(result.catalog.issues.find(day => day.date === dates[2]).status, 'unavailable');
    assert.deepEqual(result.recovery.failedDates, [dates[2]]);
    assert.equal(warnings[0].path, `archives/${dates[2]}.json`);
  });
}
for (const problem of ['offline', 'stale', 'malformed']) {
  test(`an ${problem} index still attempts the current seven days`, async () => {
    assert.equal(typeof history.loadReviewedHistory, 'function');
    const requested = [];
    const result = await history.loadReviewedHistory(async path => {
      requested.push(path);
      if (path === 'archive_index.json') {
        if (problem === 'offline') throw new Error('offline');
        return problem === 'stale' ? { ...index, today: '2026-09-21', dates: history.readingDates('2026-09-21') } : {};
      }
      return issue(path.slice(9, -5));
    }, fixture, today, () => {});
    assert.deepEqual(requested.slice(1).sort(), dates.map(date => `archives/${date}.json`).sort());
    assert.equal(result.catalog.events.length, 1);
    assert.equal(result.recovery.indexFailed, true);
  });
}
test('a failed refresh retains good days but a successful empty issue replaces old content', () => {
  assert.equal(typeof history.mergeHistoryResults, 'function');
  const previous = { origin: 'remote', catalog: history.parseCatalog({ ...fixture, issues: [issue(today)], events: issue(today).events }) };
  const unavailable = { ...issue(today), status: 'unavailable', events: [] };
  const next = { origin: 'bundled', catalog: history.parseCatalog({ ...fixture, issues: [unavailable], events: [] }), recovery: { indexFailed: true, failedDates: [today] } };
  assert.equal(history.mergeHistoryResults(previous, next).catalog.events.length, 1);
  const success = { origin: 'remote', catalog: history.parseCatalog({ ...fixture, issues: [{ ...unavailable, status: 'empty' }], events: [] }) };
  assert.equal(history.mergeHistoryResults(previous, success).catalog.events.length, 0);
});
test('total remote failure is explicit and does not manufacture an empty result', async () => {
  assert.equal(typeof history.loadReviewedHistory, 'function');
  const result = await history.loadReviewedHistory(async () => { throw new Error('offline'); }, fixture, '2026-10-06', () => {});
  assert.equal(result.origin, 'bundled');
  assert.equal(result.catalog.issues.length, 7);
  assert.ok(result.catalog.issues.every(day => day.status === 'unavailable'));
  assert.equal(result.recovery.failedDates.length, 7);
});

test('client refresh starts immediately, retries finitely, then returns to five-minute checks', async () => {
  assert.equal(typeof history.startHistoryRefresh, 'function');
  let calls = 0;
  let healthy = false;
  let scheduled;
  const refresh = history.startHistoryRefresh(async () => { calls++; return healthy; }, {
    isVisible: () => true,
    schedule: (callback, delay) => { scheduled = { callback, delay }; return 1; },
    cancel: () => { scheduled = undefined; },
  });
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  await settle();
  assert.equal(calls, 1);
  for (const delay of [3000, 15000, 45000]) {
    assert.equal(scheduled.delay, delay);
    scheduled.callback(); await settle();
  }
  assert.equal(calls, 4);
  assert.equal(scheduled.delay, 300000);
  healthy = true;
  scheduled.callback(); await settle();
  assert.equal(scheduled.delay, 300000);
  refresh.stop();
  assert.equal(scheduled, undefined);
});

test('current failed collection status survives loading without triggering network recovery', async () => {
  const lastAttempt = { date: today, outcome: 'validation_failed', completedAt: '2026-09-22T11:00:00+08:00' };
  const lastRun = { date: today, completedAt: '2026-09-22T01:00:00+08:00', sourceCount: 3, addedCount: 0, status: 'empty' };
  const result = await history.loadReviewedHistory(async path => path === 'archive_index.json'
    ? { ...index, lastRun, lastAttempt }
    : { ...issue(path.slice(9, -5)), status: 'empty', events: [] }, fixture, today, () => {});
  assert.deepEqual(result.catalog.lastAttempt, lastAttempt);
  assert.equal(history.hasFailedCollection(result.catalog, today), true);
  assert.equal(history.needsHistoryRetry(result), false);
  assert.equal(result.catalog.lastRun.status, 'empty');
});

test('old catalogs remain compatible and past or successful attempts do not claim a current failure', () => {
  assert.equal(typeof history.hasFailedCollection, 'function');
  const catalog = history.parseCatalog(fixture);
  assert.equal(history.hasFailedCollection(catalog, today), false);
  for (const outcome of ['ready', 'empty', 'failed', 'validation_failed', 'review_rejected']) {
    const parsed = history.parseCatalog({ ...catalog, lastAttempt: { date: today, outcome, completedAt: '2026-09-22T11:00:00+08:00' } });
    assert.equal(history.hasFailedCollection(parsed, today), !['ready', 'empty'].includes(outcome));
    assert.equal(history.hasFailedCollection(parsed, '2026-09-23'), false);
  }
});
