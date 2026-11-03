import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receiveNativeOfflineVerification as receive } from '../src/native-observation.mjs';

// Synthetic reporter records test the receiver only, never native acceptance.
const start = { time: 1000, pid: 123, level: 'debug', name: 'pnpm:lockfile-verification', status: 'started', entries: 7, lockfilePath: '/fixture/pnpm-lock.yaml' };
const done = { ...start, time: 1010, status: 'done', elapsedMs: 10 };
const input = (events = [start, done]) => ({ stdout: events.map(event => JSON.stringify(event) + '\n').join(''),
  terminal: { invoked: true, code: 0, signal: null }, observation: { startedAt: 999, endedAt: 1011, complete: true }, lockfilePath: start.lockfilePath });

test('receives only a complete fresh native sequence and preserves original measurements', () => {
  const result = receive(input());
  assert.equal(result.accepted, true);
  assert.equal(result.reason, 'fresh-native-verification-observed');
  assert.deepEqual(result.events, [start, done]);
  assert.equal(result.stream.records, 2);
  assert.equal(result.stream.sha256.length, 64);
  assert.equal(Object.isFrozen(result.events[0]), true);
  assert.equal(receive({ ...input(), stdout: Buffer.from(input().stdout) }).stream.representation, 'original-bytes');
  const other = { name: 'pnpm:progress', status: 'found_in_store' };
  assert.equal(receive(input([other, start, other, done])).accepted, true);
});

test('cached native success is retained as prior verdict, never fresh qualification', () => {
  const cached = { ...start, status: 'cached', verifiedAt: '2026-10-24T00:00:00.000Z' }; delete cached.entries;
  const result = receive(input([cached]));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'native-prior-verdict-reused');
  assert.equal(result.events[0].verifiedAt, cached.verifiedAt);
  assert.equal(receive(input([start, cached, done])).accepted, false);
});

test('failed, missing, reordered, duplicate and mixed native sequences refuse', () => {
  for (const events of [[], [start], [done], [done, start], [start, start, done], [start, done, done],
    [start, { ...done, status: 'failed' }], [start, { ...done, pid: 124 }], [start, { ...done, entries: 8 }],
    [{ ...start, time: 1008 }, { ...done, time: 1007 }], [start, { ...done, status: 'unknown' }]]) {
    assert.equal(receive(input(events)).accepted, false);
  }
});

test('partial capture and unsuccessful terminal outcomes cannot qualify', () => {
  const good = input();
  for (const stdout of [good.stdout.trimEnd(), good.stdout + 'not-json\n', good.stdout + 'null\n',
    good.stdout + JSON.stringify('scalar') + '\n', good.stdout + '\ud800\n', good.stdout + 'x'.repeat(65537) + '\n',
    Buffer.concat([Buffer.from(good.stdout), Buffer.from([255, 10])])]) assert.equal(receive({ ...good, stdout }).accepted, false);
  assert.equal(receive({ ...good, observation: { ...good.observation, complete: false } }).accepted, false);
  for (const terminal of [{ invoked: false, code: 0, signal: null }, { invoked: true, code: null, signal: null },
    { invoked: true, code: 1, signal: null }, { invoked: true, code: 0, signal: 'SIGTERM' }])
    assert.equal(receive({ ...good, terminal }).accepted, false);
});

test('wrong path, malformed measures, out-of-window records and excess events refuse', () => {
  for (const change of [{ time: 998 }, { time: 1012 }, { time: '1000' }, { pid: 0 }, { entries: 0 },
    { lockfilePath: '/other/pnpm-lock.yaml' }, { level: 'info' }]) assert.equal(receive(input([{ ...start, ...change }, done])).accepted, false);
  for (const elapsedMs of [-1, 1.5, 100, '10']) assert.equal(receive(input([start, { ...done, elapsedMs }])).accepted, false);
  assert.equal(receive(input(Array(17).fill(start))).accepted, false);
});

test('invalid input contracts refuse without evaluating accessors', () => {
  for (const value of [null, [], { ...input(), extra: true }, { ...input(), stdout: {} },
    { ...input(), stdout: 'x'.repeat(8388609) }, { ...input(), lockfilePath: 'relative' },
    { ...input(), observation: { startedAt: 2, endedAt: 1, complete: true } },
    { ...input(), observation: { startedAt: 0, endedAt: 86400001, complete: true } }]) assert.throws(() => receive(value), TypeError);
  let called = false; const value = input();
  Object.defineProperty(value.terminal, 'code', { get() { called = true; return 0; } });
  assert.throws(() => receive(value), TypeError); assert.equal(called, false);
});
