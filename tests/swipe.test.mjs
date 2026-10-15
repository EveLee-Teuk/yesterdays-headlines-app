import test from 'node:test';
import assert from 'node:assert/strict';
import { getSwipeAxis, getSwipeDirection } from '../src/lib/swipe.ts';

test('left opens the next page and right opens the previous page', () => {
  assert.equal(getSwipeDirection(-100, 8), 1);
  assert.equal(getSwipeDirection(100, -8), -1);
});

test('a tap or short horizontal drag cannot change pages', () => {
  for (const dx of [0, 5, -5, 12, -12, 55, -55]) {
    assert.equal(getSwipeDirection(dx, 0), null, String(dx));
  }
  assert.equal(getSwipeDirection(-56, 0), 1);
  assert.equal(getSwipeDirection(56, 0), -1);
});

test('horizontal intent is recognized before a complete swipe', () => {
  assert.equal(getSwipeAxis(11, 0), 'pending');
  assert.equal(getSwipeAxis(-12, 2), 'horizontal');
  assert.equal(getSwipeDirection(-12, 2), null);
});

test('vertical reading gestures and ambiguous diagonal gestures never turn a page', () => {
  for (const [dx, dy] of [[0, 150], [20, -120], [90, 100], [-100, -90], [80, 80]]) {
    assert.equal(getSwipeDirection(dx, dy), null, `${dx}, ${dy}`);
  }
  assert.equal(getSwipeAxis(2, -15), 'vertical');
  assert.equal(getSwipeAxis(25, 25), 'pending');
  assert.equal(getSwipeAxis(90, 100), 'pending');
});

test('a decisive horizontal gesture permits small vertical finger movement', () => {
  assert.equal(getSwipeDirection(-100, 60), 1);
  assert.equal(getSwipeDirection(100, -60), -1);
  assert.equal(getSwipeDirection(70, 51), null);
});

test('invalid pointer coordinates cannot trigger navigation', () => {
  for (const [dx, dy] of [[NaN, 0], [0, NaN], [Infinity, 0], [-Infinity, 0], [90, Infinity]]) {
    assert.equal(getSwipeAxis(dx, dy), 'pending');
    assert.equal(getSwipeDirection(dx, dy), null);
  }
});
