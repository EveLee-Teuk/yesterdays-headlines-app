import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const modulePath = new URL('../src/lib/history.ts', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));

test('history contract and anniversary regressions', async (t) => {
  assert.ok(existsSync(modulePath), 'Missing source-validated history boundary');
  const { parseCatalog, eventsOnDay, beijingToday, rolloverDate } = await import(modulePath.href);
  const catalog = parseCatalog(fixture);
  await t.test('09-22 contains the Asian Games, never the atomic test', () => {
    const events = eventsOnDay(catalog.events, '2026-09-22');
    assert.deepEqual(events.map(e => e.id), ['beijing-asian-games']);
    assert.equal(eventsOnDay(catalog.events, '2026-10-16')[0].id, 'first-atomic-test');
  });
  await t.test('Beijing rollover is independent of device timezone', () => {
    assert.equal(beijingToday(new Date('2026-09-21T16:01:00Z')), '2026-09-22');
  });
  await t.test('midnight follows today but preserves an intentionally selected past date', () => {
    assert.equal(typeof rolloverDate, 'function', 'Missing midnight date synchronization');
    assert.equal(rolloverDate('2026-09-22', '2026-09-22', '2026-09-23'), '2026-09-23');
    assert.equal(rolloverDate('2026-10-16', '2026-09-22', '2026-09-23'), '2026-10-16');
  });
  await t.test('rejects legacy generated data and conflicting sources', () => {
    assert.throws(() => parseCatalog([{ title: 'wrong', summary: '1964年09月22日' }]));
    const bad = structuredClone(fixture);
    bad.events[0].sources[0].date = '1990-09-23';
    assert.throws(() => parseCatalog(bad));
  });
  await t.test('rejects invalid dates, duplicate ids and unsafe source links', () => {
    for (const change of [e => e.date = '2001-02-29', e => e.sources = [], e => e.sources[0].url = 'javascript:alert(1)']) {
      const bad = structuredClone(fixture);
      change(bad.events[0]);
      assert.throws(() => parseCatalog(bad));
    }
    assert.throws(() => parseCatalog({ ...fixture, events: [fixture.events[0], fixture.events[0]] }));
  });
  await t.test('empty days remain empty and future events stay hidden', () => {
    assert.deepEqual(eventsOnDay(catalog.events, '2026-01-01'), []);
    assert.deepEqual(eventsOnDay(catalog.events, '1900-09-22'), []);
    assert.throws(() => eventsOnDay(catalog.events, '2026-02-30'));
  });
});

test('dated issues reject unrelated months and restrict the reading window', async () => {
  const { parseIssue, readingDates, clampReadingDate } = await import(modulePath.href);
  const issue = { schemaVersion: 2, date: '2026-09-22', timezone: 'Asia/Shanghai', status: 'ready', events: [fixture.events.find(e => e.id === 'beijing-asian-games')] };
  assert.equal(parseIssue(issue).events.length, 1);
  assert.throws(() => parseIssue({ ...issue, events: [fixture.events.find(e => e.id === 'three-gorges-start')] }));
  assert.deepEqual(readingDates('2026-09-22', 7), ['2026-09-16','2026-09-17','2026-09-18','2026-09-19','2026-09-20','2026-09-21','2026-09-22']);
  assert.equal(clampReadingDate('2026-09-23', '2026-09-22', 7), '2026-09-22');
  assert.equal(clampReadingDate('2026-09-15', '2026-09-22', 7), '2026-09-22');
  assert.equal(clampReadingDate('2026-09-16', '2026-09-22', 7), '2026-09-16');
});
