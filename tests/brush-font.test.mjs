import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrushFont } from '../src/lib/brush-font.ts';

test('a title is not ready while any required font face is still loading', async () => {
  let finish;
  let settled = false;
  const fonts = { load: (spec, text) => {
    assert.equal(spec, '400 48px "Ma Shan Zheng"');
    assert.equal(text, '北京亚运会开幕');
    return new Promise(resolve => { finish = resolve; });
  } };
  const loading = loadBrushFont(fonts, '北京亚运会开幕', 1000).then(value => { settled = true; return value; });
  await Promise.resolve();
  assert.equal(settled, false);
  finish([{}, {}]);
  assert.equal(await loading, 'ready');
});

test('failed and missing faces allow readable, stable fallback', async () => {
  assert.equal(await loadBrushFont({ load: async () => { throw new Error('offline'); } }, '历史'), 'fallback');
  assert.equal(await loadBrushFont({ load: async () => [] }, '历史'), 'fallback');
  assert.equal(await loadBrushFont(undefined, '历史'), 'fallback');
});

test('a late font response cannot change a title after the deadline', async () => {
  let finish;
  const loading = loadBrushFont({ load: () => new Promise(resolve => { finish = resolve; }) }, '历史', 5);
  assert.equal(await loading, 'fallback');
  finish([{}]);
  await Promise.resolve();
  assert.equal(await loading, 'fallback');
});
