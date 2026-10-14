import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { getCalendarMetadata } from '../src/lib/calendar.ts';

// Independent reference: Hong Kong Observatory Gregorian–lunar tables.
// https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2026.pdf
// https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2025.pdf
test('calendar matches the HKO date for the current calendar design', () => {
  assert.deepEqual(getCalendarMetadata('2026-10-14'), {
    weekday: '星期三',
    lunarMonth: '九月',
    lunarDay: '初五',
    lunarDate: '九月初五',
    cyclicalYear: '丙午',
  });
});

test('the lunar year changes at Lunar New Year, not January 1', () => {
  assert.equal(getCalendarMetadata('2026-01-01').cyclicalYear, '乙巳');
  assert.equal(getCalendarMetadata('2026-02-16').lunarDate, '腊月廿九');
  assert.equal(getCalendarMetadata('2026-02-16').cyclicalYear, '乙巳');
  assert.equal(getCalendarMetadata('2026-02-17').lunarDate, '正月初一');
  assert.equal(getCalendarMetadata('2026-02-17').cyclicalYear, '丙午');
  assert.equal(getCalendarMetadata('2026-02-17').weekday, '星期二');
});

test('leap months remain distinct and day names cover 10, 20 and 30', () => {
  assert.equal(getCalendarMetadata('2025-07-24').lunarDate, '六月三十');
  assert.equal(getCalendarMetadata('2025-07-25').lunarDate, '闰六月初一');
  assert.equal(getCalendarMetadata('2025-08-03').lunarDate, '闰六月初十');
  assert.equal(getCalendarMetadata('2025-08-13').lunarDate, '闰六月二十');
  assert.equal(getCalendarMetadata('2025-08-22').lunarDate, '闰六月廿九');
  assert.equal(getCalendarMetadata('2025-08-23').lunarDate, '七月初一');
});

test('traditional month names distinguish the first, eleventh and twelfth months', () => {
  assert.equal(getCalendarMetadata('2026-02-17').lunarDate, '正月初一');
  assert.equal(getCalendarMetadata('2026-12-09').lunarDate, '冬月初一');
  assert.equal(getCalendarMetadata('2026-01-19').lunarDate, '腊月初一');
});

test('calendar day is independent of the device timezone and UTC date conversion', () => {
  const sourceUrl = new URL('../src/lib/calendar.ts', import.meta.url).href;
  const program = `import { getCalendarMetadata } from ${JSON.stringify(sourceUrl)}; console.log(JSON.stringify(getCalendarMetadata('2026-02-17')));`;
  for (const TZ of ['Pacific/Kiritimati', 'America/Adak', 'UTC']) {
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', program], {
      encoding: 'utf8', env: { ...process.env, TZ },
    }));
    assert.equal(result.lunarDate, '正月初一', TZ);
    assert.equal(result.weekday, '星期二', TZ);
  }
});

test('invalid and unsupported dates return no decorative calendar data', () => {
  for (const input of ['', '2026-2-17', '2026-02-30', '2025-02-29', '2026-13-01', '2026-00-01', '2026-10-14T00:00:00Z', '0000-01-01']) {
    assert.equal(getCalendarMetadata(input), null, input);
  }
  assert.ok(getCalendarMetadata('2024-02-29'));
});

test('unsupported Chinese calendars do not silently display Gregorian dates', t => {
  const NativeFormatter = Intl.DateTimeFormat;
  t.mock.method(Intl, 'DateTimeFormat', function (_locale, options) {
    return new NativeFormatter('zh-CN', { ...options, calendar: 'gregory' });
  });
  assert.equal(getCalendarMetadata('2026-10-14'), null);
});

test('old engines without formatToParts return null', t => {
  t.mock.method(Intl, 'DateTimeFormat', function () {
    return { resolvedOptions: () => ({ calendar: 'chinese' }) };
  });
  assert.equal(getCalendarMetadata('2026-10-14'), null);
});

test('missing Intl support and formatter errors return null', t => {
  t.mock.method(Intl, 'DateTimeFormat', function () { throw new RangeError('Unsupported calendar'); });
  assert.equal(getCalendarMetadata('2026-10-14'), null);
});

test('malformed lunar parts are rejected instead of guessed', t => {
  t.mock.method(Intl, 'DateTimeFormat', function () {
    return {
      resolvedOptions: () => ({ calendar: 'chinese' }),
      formatToParts: () => [{ type: 'month', value: 'October' }, { type: 'day', value: '14' }],
    };
  });
  assert.equal(getCalendarMetadata('2026-10-14'), null);
});

test('missing sexagenary year is optional rather than invented', t => {
  t.mock.method(Intl, 'DateTimeFormat', function () {
    return {
      resolvedOptions: () => ({ calendar: 'chinese' }),
      formatToParts: () => [{ type: 'month', value: '九月' }, { type: 'day', value: '5' }],
    };
  });
  const result = getCalendarMetadata('2026-10-14');
  assert.equal(result.lunarDate, '九月初五');
  assert.equal(result.cyclicalYear, null);
});
