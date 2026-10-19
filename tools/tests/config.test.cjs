const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { load } = require('../site-config.cjs');
const root = path.resolve(__dirname, '../..');
const own = { apiKey: 'test-public-key', projectId: 'personal-test', authDomain: 'personal-test.firebaseapp.com', appId: 'test-app' };
test('default configuration never connects to upstream author services', () => {
  assert.equal(load(root, {}).firebase, null);
});
test('deployment can supply only public Firebase web fields', () => {
  assert.equal(load(root, { FIREBASE_WEB_CONFIG: JSON.stringify(own) }).firebase.projectId, own.projectId);
  for (const firebase of [ { ...own, projectId: 'pokesurvivor-free' }, { ...own, private_key: 'not-a-web-config' }, { projectId: 'missing-fields' } ]) {
    assert.throws(() => load(root, { FIREBASE_WEB_CONFIG: JSON.stringify(firebase) }));
  }
  assert.throws(() => load(root, { FIREBASE_WEB_CONFIG: '{bad' }));
});
