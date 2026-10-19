const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function game(lang) {
  const sandbox = { console, navigator: { language: 'en-US' }, location: { pathname: '/' },
    localStorage: { getItem: () => lang }, document: { documentElement: {}, querySelector: () => ({ content: 'zh-CN' }) },
    CanvasRenderingContext2D: function () {} };
  sandbox.window = sandbox;
  sandbox.confirm = () => true;
  sandbox.alert = () => {};
  const context = vm.createContext(sandbox);
  for (const file of ['js/core/util.js', 'js/core/i18n.js', 'js/data/lang-en.js',
    'js/data/lang-zh-CN.js', 'js/data/pokedex.js', 'js/data/moves.js', 'js/data/move-names-zh-CN.js',
    'js/data/starters.js', 'js/data/upgrades.js', 'js/data/items.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return context.G;
}

const zh = game('zh-CN');
assert.equal(zh.I18n.lang, 'zh-CN');
assert.equal(game(null).I18n.lang, 'zh-CN');
assert.equal(zh.T('Bulbasaur'), '妙蛙种子');
assert.equal(zh.T('Pikachu'), '皮卡丘');
assert.equal(zh.T('Arceus'), '阿尔宙斯');
assert.equal(zh.Moves.BY_ID.psychic.name, '精神强念');
assert.equal(zh.T(zh.U.TYPE_NAME.psychic), '超能力');
assert.equal(zh.Moves.BY_ID.ember.name, '火花');
assert.equal(zh.T('Rayo'), '十万伏特');
assert.equal(zh.T('Banda Focus'), '气势披带');
assert.equal(zh.T('¡Has conseguido a Pikachu shiny!'), '获得了闪光 皮卡丘！');
assert.equal(zh.T('Los 151 Pokémon de la generación 1. ¡Los legendarios esperan!'), '共 151 只第 1 世代的宝可梦，传说宝可梦正等着你！');
assert.equal(zh.T('Impulsivo'), '冲动');
assert.equal(zh.T('Nv. 5'), '5 级');
assert.equal(zh.T('Nv.5'), '5 级');
assert.equal(zh.T('Nombre de Pokémon'), '名称');
assert.equal(zh.T('Kanto'), '关都');
for (const pokemon of zh.DEX) assert.match(zh.T(pokemon.name), /\p{Script=Han}/u, `Untranslated Pokémon: ${pokemon.name}`);

const es = game('es'), en = game('en');
assert.equal(es.T('Volver'), 'Volver');
assert.equal(en.T('Volver'), 'Back');
assert.equal(en.T('Bulbasaur'), 'Bulbasaur');
assert.equal(es.Moves.BY_ID.psychic.name, 'Psíquico');
// Names may change; IDs, numbers, types, evolution requirements and other rules must not.
const withoutDisplayNames = data => JSON.stringify(data, (key, value) => key === 'name' ? undefined : value);
assert.equal(withoutDisplayNames(zh.Moves.ALL), withoutDisplayNames(es.Moves.ALL));
assert.equal(JSON.stringify(zh.DEX), JSON.stringify(es.DEX));
for (const [id, evo] of Object.entries(zh.Moves.EVO)) {
  assert.equal(evo[1], es.Moves.EVO[id][1]);
  assert.match(evo[0], /\p{Script=Han}/u, `Untranslated evolution: ${id}`);
}
for (const move of zh.Moves.ALL) {
  assert.match(move.name, /\p{Script=Han}/u, `Untranslated move: ${move.id}`);
  assert.notEqual(zh.T(move.desc), move.desc, `Untranslated effect: ${move.id}`);
}

const dict = {};
vm.runInNewContext(read('js/data/lang-zh-CN.js'), { G: { I18n: { add: d => Object.assign(dict, d) } } });
const english = {};
vm.runInNewContext(read('js/data/lang-en.js'), { G: { I18n: { add: d => Object.assign(english, d) } } });
for (const source of Object.keys(english)) assert.ok(Object.hasOwn(dict, source), `New upstream UI text needs translation: ${source}`);
for (const [source, text] of Object.entries(dict)) {
  assert.equal((source.match(/\{x\}/g) || []).length, (text.match(/\{x\}/g) || []).length, `Placeholders: ${source}`);
  assert.equal(zh.T(text), text, `Translation applied twice: ${text}`);
}
const html = read('index.html');
for (const match of html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)(?:\?[^" ]*)?"/g)) {
  assert.ok(fs.existsSync(path.join(root, match[1])), `Missing asset: ${match[1]}`);
}
assert.ok(html.includes('js/data/lang-zh-CN.js'));
assert.ok(html.includes('js/core/local-config.js'));
console.log(`PASS: ${Object.keys(dict).length} translations; ${zh.DEX.length} Pokémon; ${zh.Moves.ALL.length} moves; ${Object.keys(zh.Moves.EVO).length} evolutions; Spanish/English compatibility; game rules unchanged.`);

// Surface any text in primary gameplay datasets which still needs a dictionary entry.
const untranslated = new Set();
const visit = (value, field) => {
  if (typeof value === 'string') {
    if (['desc', 'name', 't', 'q'].includes(field) && /[a-záéíóúñ]/i.test(value) && zh.T(value) === value && !/^[a-z-]+$/.test(value)) untranslated.add(value);
  } else if (Array.isArray(value)) value.forEach(v => visit(v, field));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => visit(v, k));
};
for (const data of [zh.Moves.ALL, zh.Upgrades, zh.Items, zh.PERSONALITY_TEST]) visit(data, '');
console.log('Remaining primary dataset text:', JSON.stringify([...untranslated]));

// Exercise real local registration/save/restore against isolated memory storage.
// This creates no browser account and never touches the player's progress.
async function verifyLocalSave() {
  const store = new Map();
  const localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  function loadDB() {
    const sandbox = { G: { ...zh }, console, localStorage, location: { protocol: 'http:', hostname: '127.0.0.1' },
      crypto: require('node:crypto').webcrypto, TextEncoder, clearTimeout, setTimeout };
    sandbox.window = sandbox;
    vm.runInNewContext(read('js/core/local-config.js'), sandbox);
    vm.runInNewContext(read('js/core/db.js'), sandbox);
    return sandbox.G.DB;
  }
  const first = loadDB();
  assert.equal(await first.ready(), false);
  assert.equal(first.mode, 'local');
  assert.equal(first.localReason, 'config');
  assert.equal((await first.register('local_qa', 'test-only-password')).ok, true);
  first.grant(25, 'starter');
  first.save.partner = 25;
  first.save.coins = 1234;
  assert.equal(first.commit(), true);
  const reopened = loadDB();
  assert.equal(await reopened.ready(), true);
  assert.equal(reopened.save.partner, 25);
  assert.equal(reopened.save.coins, 1234);
  assert.equal(reopened.owns(25), true);
  assert.equal(reopened.online, false);
  console.log('PASS: local account and progress restore after restarting; upstream cloud disabled.');
}
verifyLocalSave().catch(error => { console.error(error); process.exitCode = 1; });
