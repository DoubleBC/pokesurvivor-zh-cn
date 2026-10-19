/* Contract tests run the actual DB module against an in-memory Firebase SDK double.
 * They do not substitute for deploying and checking the real Firestore rules. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
function backend() { return { accounts: new Map(), docs: new Map(), writes: [], fail: false }; }
function device(server, options = {}) {
  let now = 1800000000000, nextTimer = 0;
  const timers = new Map(), storage = new Map(), scripts = [];
  const auth = {
    currentUser: null, setPersistence: async () => {},
    onAuthStateChanged: fn => { queueMicrotask(() => fn(auth.currentUser)); return () => {}; },
    createUserWithEmailAndPassword: async (email, password) => {
      if (server.accounts.has(email)) throw { code: 'auth/email-already-in-use' };
      const user = { uid: 'uid-' + server.accounts.size, email, displayName: null };
      server.accounts.set(email, { user, password }); auth.currentUser = user;
      return { user };
    },
    signInWithEmailAndPassword: async (email, password) => {
      const account = server.accounts.get(email);
      if (!account || account.password !== password) throw { code: 'auth/invalid-credential' };
      auth.currentUser = account.user; return { user: account.user };
    },
    signOut: async () => { auth.currentUser = null; }
  };
  function snapshot(ref) {
    if (server.fail) throw { code: 'unavailable' };
    assert.equal(ref.id, auth.currentUser.uid, 'save requests must target the signed-in UID');
    const data = clone(server.docs.get(ref.id));
    return { exists: !!data, data: () => data };
  }
  const firestore = {
    settings: () => {}, collection: name => {
      assert.equal(name, 'saves');
      return { doc: id => { const ref = { id, get: async () => snapshot(ref) }; return ref; } };
    },
    runTransaction: async fn => {
      const pending = [];
      await fn({ get: async ref => snapshot(ref), set: (ref, doc) => pending.push({ ref, doc: clone(doc) }) });
      for (const { ref, doc } of pending) { server.docs.set(ref.id, doc); server.writes.push(ref.id); }
    }
  };
  const firebase = { initializeApp: cfg => assert.equal(cfg.projectId, 'personal-test'), auth: () => auth, firestore: () => firestore };
  firebase.auth.Auth = { Persistence: { LOCAL: 'local' } };
  firebase.firestore.FieldValue = { serverTimestamp: () => 'timestamp' };
  const site = { firebase: options.noConfig ? null : { projectId: 'personal-test', apiKey: 'public-test' },
    cloud: { allowedHosts: ['doublebc.github.io'], autoSaveMs: 60000, minGapMs: 5000 } };
  const context = { G: { SITE_CONFIG: site }, firebase, console,
    Date: class extends Date { static now() { return now; } },
    crypto: require('node:crypto').webcrypto, TextEncoder,
    navigator: { onLine: true }, location: { protocol: 'https:', hostname: options.host || 'doublebc.github.io' },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    document: { createElement: () => ({}), head: { appendChild: el => { scripts.push(el.src); queueMicrotask(() => el.onload()); } }, addEventListener: () => {} },
    addEventListener: () => {},
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, due: now + ms }); return id; },
    clearTimeout: id => timers.delete(id)
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['js/core/util.js', 'js/data/pokedex.js', 'js/data/moves.js', 'js/data/upgrades.js', 'js/core/local-config.js', 'js/core/db.js']) vm.runInContext(read(file), context);
  return { db: context.G.DB, context, scripts, timers, storage,
    async settle() { for (let i = 0; i < 40; i++) await Promise.resolve(); },
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); }
      await this.settle();
    }
  };
}
test('configuration/host isolation leaves cloud SDK unloaded', async () => {
  for (const options of [{ noConfig: true }, { host: 'other.example.com' }]) {
    const d = device(backend(), options);
    assert.equal(await d.db.ready(), false);
    assert.equal(d.db.mode, 'local');
    assert.equal(d.scripts.length, 0);
  }
});
test('two devices share a cloud account; offline changes and stale currency merge safely', async () => {
  const server = backend(), first = device(server), second = device(server);
  await first.db.ready(); assert.equal(first.db.mode, 'cloud');
  assert.equal((await first.db.register('Cloud_QA', 'test-password')).ok, true);
  await first.settle();
  assert.equal(first.db.syncState, 'ok');
  assert.equal(server.docs.size, 1);
  first.db.grant(25, 'starter'); first.db.save.partner = 25; first.db.save.coins += 100;
  first.db.commit();
  await first.advance(60000);
  assert.equal(first.db.syncState, 'ok');
  await second.db.ready();
  assert.equal((await second.db.login('Cloud_QA', 'wrong')).ok, false);
  assert.equal((await second.db.login('Cloud_QA', 'test-password')).ok, true);
  assert.equal(second.db.save.partner, 25);
  assert.equal(second.db.owns(25), true);
  assert.equal(second.db.save.coins, 600);
  // Device one earns more, while device two still holds the older balance.
  first.db.save.coins += 200; first.db.commit(); await first.advance(60000);
  second.context.navigator.onLine = false;
  second.db.grant(1, 'wild'); second.db.save.coins -= 50; second.db.commit();
  assert.equal((await second.db.saveNow()).why, 'offline');
  assert.equal(second.db.syncState, 'offline');
  assert.ok(second.storage.has('ps.cloud.uid-0'));
  second.context.navigator.onLine = true;
  await second.advance(60000);
  assert.equal((await second.db.saveNow()).ok, true);
  assert.equal(second.db.save.coins, 750);
  assert.equal(second.db.owns(25), true);
  assert.equal(second.db.owns(1), true);
  assert.equal(server.docs.get('uid-0').save.coins, 750);
  // Repeated saves must not apply the same earned/spent amounts twice.
  second.db.commit(); await second.advance(60000); await second.db.saveNow();
  assert.equal(server.docs.get('uid-0').save.coins, 750);
  assert.ok(server.writes.every(uid => uid === 'uid-0'));
});
test('transaction errors remain pending/offline and retry without losing local data', async () => {
  const server = backend(), d = device(server);
  await d.db.ready(); await d.db.register('Retry_QA', 'test-password'); await d.settle();
  d.db.save.coins += 80; d.db.commit();
  server.fail = true; await d.advance(60000);
  assert.equal(d.db.syncState, 'offline');
  assert.equal((await d.db.saveNow()).ok, false);
  assert.equal(d.db.save.coins, 580);
  server.fail = false; await d.advance(60000); await d.db.saveNow();
  assert.equal(d.db.syncState, 'ok');
  assert.equal(server.docs.get('uid-0').save.coins, 580);
});
