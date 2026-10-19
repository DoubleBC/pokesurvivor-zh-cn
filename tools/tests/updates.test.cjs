const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/core/upstream-updates.js'), 'utf8');
const base = 'a'.repeat(40), head = 'b'.repeat(40);
function load(responses, storage = new Map()) {
  const calls = [];
  const context = { G: { RELEASE: { upstreamRepository: 'JPTER78/pokesurvivor', upstreamBranch: 'main', upstreamCommit: base } },
    console, Date, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      assert.ok(next, 'Unexpected API request');
      return { ok: !next.code, status: next.code || 200, json: async () => next };
    } };
  vm.runInNewContext(source, context);
  return { service: context.G.UpstreamUpdates, calls, storage };
}
test('same commit, TTL cache, explicit retry and concurrent callers', async () => {
  const { service, calls, storage } = load([{ object: { sha: base } }, { object: { sha: base } }]);
  const first = service.check();
  assert.equal(service.check(), first);
  assert.equal((await first).status, 'current');
  await service.check();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.credentials, 'omit');
  const reopened = load([], storage);
  assert.equal((await reopened.service.check()).status, 'current');
  assert.equal(reopened.calls.length, 0);
  await service.check(true);
  assert.equal(calls.length, 2);
});
test('new commits require ancestry comparison', async () => {
  const { service, calls } = load([{ object: { sha: head } }, { status: 'ahead', ahead_by: 7 }]);
  const result = await service.check();
  assert.equal(result.status, 'available');
  assert.equal(result.ahead, 7);
  assert.ok(calls[1].url.includes('/compare/' + base + '...' + head));
});
for (const status of ['behind', 'diverged']) test('rewritten history: ' + status, async () => {
  const { service } = load([{ object: { sha: head } }, { status }]);
  assert.equal((await service.check()).status, 'history');
});
for (const response of [new Error('offline'), { code: 429 }, { code: 403 }, { object: { sha: '<invalid>' } }]) {
  test('failed checks never claim current and allow immediate retry: ' + JSON.stringify(response), async () => {
    const { service } = load([response, { object: { sha: base } }]);
    const result = await service.check();
    assert.equal(result.status, 'error');
    assert.equal(result.checkedAt, 0);
    assert.equal((await service.check()).status, 'current');
  });
}
test('expired and malformed caches are ignored', async () => {
  for (const cached of ['{invalid', JSON.stringify({ status: 'current', head: base, ahead: 0, checkedAt: 1 })]) {
    const storage = new Map([['ps.upstream.JPTER78/pokesurvivor.' + base, cached]]);
    const { service, calls } = load([{ object: { sha: base } }], storage);
    await service.check();
    assert.equal(calls.length, 1);
  }
});
test('published update waits for the menu, flushes dirty save and then reloads', async () => {
  const events = [], timeouts = [], intervals = [];
  const context = {
    G: { Game: { state: 'run' }, UI: { isOpen: () => false, toast: () => {} },
      DB: { syncState: 'pending', flush: async () => events.push('flush') } },
    console, Date, location: { protocol: 'https:', reload: () => events.push('reload') },
    document: { querySelector: selector => selector.startsWith('meta') ? { content: '123456789abc' } : null,
      getElementById: () => null, addEventListener: () => {} },
    setTimeout: (fn, delay) => { timeouts.push({ fn, delay }); return timeouts.length; },
    setInterval: fn => { intervals.push(fn); return intervals.length; }, clearInterval: () => {},
    fetch: async () => ({ ok: true, json: async () => ({ v: 'abcdef123456' }) })
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/core/updater.js'), 'utf8'), context);
  const updater = context.G.Updater;
  updater.init(); await updater.check();
  assert.equal(updater.version, '123456789abc');
  assert.equal(updater.pending, true);
  intervals[0]();
  assert.equal(timeouts.filter(t => t.delay === 1000).length, 0);
  assert.equal(events.length, 0);
  context.G.Game.state = 'ui'; intervals[0]();
  for (let i = 0; i < 5; i++) timeouts.find(t => t.delay === 1000 && !t.done && (t.done = true)).fn();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.deepEqual(events, ['flush', 'reload']);
});
