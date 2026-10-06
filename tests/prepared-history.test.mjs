import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadReviewedHistory, mergeHistoryResults, needsHistoryRetry, readingDates } from '../src/lib/history.ts';

const fixture = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'));
const today = '2026-09-22';
const dates = readingDates(today);
const index = { schemaVersion: 1, today, updatedAt: today, retentionDays: 7, dates };
const emptyIssue = date => ({ schemaVersion: 2, date, timezone: 'Asia/Shanghai', status: 'empty', events: [] });
const official = { ...emptyIssue(today), status: 'ready', events: [fixture.events[0]] };
const prepared = { ...official, events: [{ ...fixture.events[0], id: 'prepared-validated-event', verification: 'source-matched',
  sources: fixture.events[0].sources.map(source => ({ ...source, evidence: '1990年9月22日，第十一届亚洲运动会在北京开幕。' })) }] };
const noFallbackEvents = { ...fixture, events: [] };
const todayPath = `archives/${today}.json`;
const preparedPath = `prepared/${today}.json`;
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const archiveState of ['404', 'invalid', 'unavailable', 'empty']) {
  test(`a same-day ready prepared issue recovers today's ${archiveState} archive`, async () => {
    const warnings = [];
    const result = await loadReviewedHistory(async path => {
      if (path === 'archive_index.json') return index;
      if (path === preparedPath) return prepared;
      if (path === todayPath) {
        if (archiveState === '404') throw new Error('History HTTP 404');
        if (archiveState === 'invalid') return {};
        return { ...emptyIssue(today), status: archiveState };
      }
      return emptyIssue(path.slice(9, -5));
    }, noFallbackEvents, today, (path, reason) => warnings.push({ path, reason }));
    assert.equal(result.origin, 'remote');
    assert.deepEqual(result.catalog.events.map(event => event.id), ['prepared-validated-event']);
    assert.equal(result.catalog.issues.find(issue => issue.date === today).status, 'ready');
    assert.deepEqual(result.recovery, { indexFailed: false, failedDates: [] });
    assert.equal(result.catalog.issues.length, 7);
    if (['404', 'invalid'].includes(archiveState)) assert.equal(warnings[0].path, todayPath);
  });
}

test('a ready official archive wins without waiting for the optional prepared request', async () => {
  let rejectPrepared;
  const pendingPrepared = new Promise((_, reject) => { rejectPrepared = reject; });
  const result = await loadReviewedHistory(async path => {
    if (path === 'archive_index.json') return index;
    if (path === preparedPath) return pendingPrepared;
    return path === todayPath ? official : emptyIssue(path.slice(9, -5));
  }, noFallbackEvents, today, () => {});
  assert.deepEqual(result.catalog.events.map(event => event.id), official.events.map(event => event.id));
  // A late rejection must already have a handler even when the archive won the race.
  rejectPrepared(new Error('late optional timeout'));
  await tick();
});

test('a ready official archive wins over a different valid prepared issue', async () => {
  const result = await loadReviewedHistory(async path => {
    if (path === 'archive_index.json') return index;
    if (path === preparedPath) return prepared;
    return path === todayPath ? official : emptyIssue(path.slice(9, -5));
  }, noFallbackEvents, today, () => {});
  assert.deepEqual(result.catalog.events.map(event => event.id), official.events.map(event => event.id));
});

test('a ready official archive does not report an optional prepared failure', async () => {
  const warnings = [];
  const result = await loadReviewedHistory(async path => {
    if (path === 'archive_index.json') return index;
    if (path === preparedPath) throw new Error('History HTTP 404');
    return path === todayPath ? official : emptyIssue(path.slice(9, -5));
  }, noFallbackEvents, today, (path, reason) => warnings.push({ path, reason }));
  assert.deepEqual(result.catalog.events, official.events);
  assert.deepEqual(result.recovery.failedDates, []);
  assert.deepEqual(warnings, []);
  assert.equal(needsHistoryRetry(result), false);
});

for (const failure of ['History HTTP 404', 'optional timeout']) {
  test(`a later prepared ${failure} preserves previously recovered content and retries`, async () => {
    const read = fail => async path => {
      if (path === 'archive_index.json') return index;
      if (path === preparedPath) {
        if (fail) throw new Error(failure);
        return prepared;
      }
      return emptyIssue(path.slice(9, -5));
    };
    const previous = await loadReviewedHistory(read(false), noFallbackEvents, today, () => {});
    const warnings = [];
    const next = await loadReviewedHistory(read(true), noFallbackEvents, today, (path, reason) => warnings.push({ path, reason }));
    assert.equal(next.catalog.issues.find(issue => issue.date === today).status, 'empty');
    assert.deepEqual(next.catalog.events, []);
    assert.deepEqual(next.recovery.failedDates, [today]);
    assert.deepEqual(warnings, [{ path: preparedPath, reason: failure }]);
    assert.equal(needsHistoryRetry(next), true);
    assert.deepEqual(mergeHistoryResults(previous, next).catalog.events, prepared.events);
  });
}

test('prepared loading starts before a slow index and runs alongside the archive', async () => {
  let releaseIndex, releaseArchive;
  const pendingIndex = new Promise(resolve => { releaseIndex = resolve; });
  const pendingArchive = new Promise(resolve => { releaseArchive = resolve; });
  const requested = [];
  const loading = loadReviewedHistory(async path => {
    requested.push(path);
    if (path === 'archive_index.json') return pendingIndex;
    if (path === preparedPath) return prepared;
    if (path === todayPath) return pendingArchive;
    return emptyIssue(path.slice(9, -5));
  }, noFallbackEvents, today, () => {});
  try {
    await tick();
    assert.ok(requested.includes(preparedPath), 'prepared issue should be prefetched while index is pending');
    releaseIndex(index);
    await tick();
    assert.ok(requested.includes(todayPath), 'archive should still be fetched independently');
  } finally {
    releaseIndex(index);
    releaseArchive(emptyIssue(today));
  }
  assert.equal((await loading).catalog.events[0].id, prepared.events[0].id);
});

for (const problem of ['404', 'empty', 'malformed', 'future-date', 'wrong-event-day', 'wrong-source-date', 'duplicate-id']) {
  test(`an optional prepared issue with ${problem} cannot alter valid archives`, async () => {
    const candidate = structuredClone(prepared);
    if (problem === 'empty') { candidate.status = 'empty'; candidate.events = []; }
    if (problem === 'future-date') {
      candidate.date = '2026-09-23'; candidate.events[0].date = '1990-09-23';
      candidate.events[0].sources = candidate.events[0].sources.map(source => ({ ...source, date: '1990-09-23' }));
    }
    if (problem === 'wrong-event-day') candidate.events[0].date = '1990-09-23';
    if (problem === 'wrong-source-date') candidate.events[0].sources[0].date = '1990-09-23';
    if (problem === 'duplicate-id') candidate.events.push(candidate.events[0]);
    const requested = [];
    const result = await loadReviewedHistory(async path => {
      requested.push(path);
      if (path === 'archive_index.json') return index;
      if (path === preparedPath) {
        if (problem === '404') throw new Error('History HTTP 404');
        return problem === 'malformed' ? {} : candidate;
      }
      return emptyIssue(path.slice(9, -5));
    }, noFallbackEvents, today, () => {});
    assert.deepEqual(result.catalog.issues, dates.map(emptyIssue));
    assert.deepEqual(result.recovery.failedDates, problem === 'empty' ? [] : [today]);
    assert.equal(result.origin, 'remote');
    assert.deepEqual(requested.filter(path => path.startsWith('prepared/')), [preparedPath]);
    assert.ok(result.catalog.issues.every(issue => issue.date <= today));
  });
}

test('prepared recovery retains stale-index diagnostics and never expands the seven-day window', async () => {
  const result = await loadReviewedHistory(async path => {
    if (path === 'archive_index.json') return { ...index, today: '2026-09-21', dates: readingDates('2026-09-21') };
    if (path === preparedPath) return prepared;
    if (path === todayPath) throw new Error('History HTTP 404');
    return emptyIssue(path.slice(9, -5));
  }, noFallbackEvents, today, () => {});
  assert.equal(result.origin, 'remote');
  assert.deepEqual(result.catalog.issues.map(issue => issue.date), dates);
  assert.equal(result.catalog.events[0].id, prepared.events[0].id);
  assert.deepEqual(result.recovery, { indexFailed: true, failedDates: [] });
});

for (const problem of ['missing-verification', 'missing-evidence', 'short-evidence', 'long-evidence', 'wrong-evidence-date',
  'same-day-event', 'future-reviewed-at', 'publication-metadata', 'unapproved-source', 'nonstandard-source-port']) {
  test(`an unreviewed prepared issue with ${problem} cannot bypass publication checks`, async () => {
    const candidate = structuredClone(prepared);
    const event = candidate.events[0];
    if (problem === 'missing-verification') delete event.verification;
    if (problem === 'missing-evidence') delete event.sources[0].evidence;
    if (problem === 'short-evidence') event.sources[0].evidence = '1990年9月22日开幕';
    if (problem === 'long-evidence') event.sources[0].evidence += '资料'.repeat(100);
    if (problem === 'wrong-evidence-date') event.sources[0].evidence = '1990年9月23日，第十一届亚洲运动会在北京开幕。';
    if (problem === 'same-day-event') {
      event.date = today;
      event.sources[0].date = today;
      event.sources[0].evidence = '2026年9月22日，这是一则当天发生的事件并非历史。';
    }
    if (problem === 'future-reviewed-at') event.reviewedAt = '2026-09-23';
    if (problem === 'publication-metadata') event.sources[0].evidence = '发布时间：1990年9月22日，第十一届亚洲运动会在北京开幕。';
    if (problem === 'unapproved-source') event.sources[0].url = 'https://gov.cn.example.com/article';
    if (problem === 'nonstandard-source-port') event.sources[0].url = 'https://www.gov.cn:8080/article';
    const result = await loadReviewedHistory(async path => {
      if (path === 'archive_index.json') return index;
      if (path === preparedPath) return candidate;
      return emptyIssue(path.slice(9, -5));
    }, noFallbackEvents, today, () => {});
    assert.deepEqual(result.catalog.events, []);
    assert.deepEqual(result.recovery.failedDates, [today]);
    assert.equal(needsHistoryRetry(result), true);
  });
}

for (const dateText of ['1990年9月22日', '1990年 09 月 22 日', '1990-09-22', '1990.9.22']) {
  test(`a reviewed prepared issue accepts complete event evidence dated ${dateText}`, async () => {
    const candidate = structuredClone(prepared);
    candidate.events[0].sources[0].evidence = `${dateText}，第十一届亚洲运动会在北京开幕。`;
    const result = await loadReviewedHistory(async path => {
      if (path === 'archive_index.json') return index;
      if (path === preparedPath) return candidate;
      return emptyIssue(path.slice(9, -5));
    }, noFallbackEvents, today, () => {});
    assert.deepEqual(result.catalog.events, candidate.events);
    assert.deepEqual(result.recovery.failedDates, []);
  });
}

test('a prepared ID conflicting with an earlier day cannot replace a valid empty archive', async () => {
  const earlierDate = dates.at(-2);
  const earlierEvent = { ...prepared.events[0], date: '1990-09-21', sources: prepared.events[0].sources.map(source => ({ ...source, date: '1990-09-21' })) };
  const earlierIssue = { ...emptyIssue(earlierDate), status: 'ready', events: [earlierEvent] };
  const result = await loadReviewedHistory(async path => {
    if (path === 'archive_index.json') return index;
    if (path === preparedPath) return prepared;
    if (path === `archives/${earlierDate}.json`) return earlierIssue;
    return emptyIssue(path.slice(9, -5));
  }, noFallbackEvents, today, () => {});
  assert.deepEqual(result.catalog.issues.find(issue => issue.date === earlierDate), earlierIssue);
  assert.equal(result.catalog.issues.find(issue => issue.date === today).status, 'empty');
  assert.deepEqual(result.recovery.failedDates, [today]);
});

test('a prepared issue can recover an official archive with a cross-day duplicate ID', async () => {
  const earlierDate = dates.at(-2);
  const earlierEvent = { ...official.events[0], date: '1990-09-21', sources: official.events[0].sources.map(source => ({ ...source, date: '1990-09-21' })) };
  const earlierIssue = { ...emptyIssue(earlierDate), status: 'ready', events: [earlierEvent] };
  const result = await loadReviewedHistory(async path => {
    if (path === 'archive_index.json') return index;
    if (path === preparedPath) return prepared;
    if (path === todayPath) return official;
    if (path === `archives/${earlierDate}.json`) return earlierIssue;
    return emptyIssue(path.slice(9, -5));
  }, noFallbackEvents, today, () => {});
  assert.deepEqual(result.catalog.issues.find(issue => issue.date === earlierDate), earlierIssue);
  assert.deepEqual(result.catalog.issues.find(issue => issue.date === today), prepared);
  assert.deepEqual(result.recovery.failedDates, []);
});

test('a ready prepared issue is remote data even if the index and all archives fail', async () => {
  const result = await loadReviewedHistory(async path => {
    if (path === preparedPath) return prepared;
    throw new Error('offline');
  }, noFallbackEvents, today, () => {});
  assert.equal(result.origin, 'remote');
  assert.equal(result.catalog.events[0].id, prepared.events[0].id);
  assert.deepEqual(result.recovery, { indexFailed: true, failedDates: dates.slice(0, -1) });
});
