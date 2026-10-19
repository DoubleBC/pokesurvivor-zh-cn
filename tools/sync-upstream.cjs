/* Run on a clean CI checkout; prepare a tested branch without changing main. */
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const upstream = JSON.parse(fs.readFileSync(path.join(root, 'upstream.json')));
if (!/^[\w.-]+\/[\w.-]+$/.test(upstream.repository) || !/^[\w./-]+$/.test(upstream.branch)
    || upstream.branch.startsWith('-') || !/^[0-9a-f]{40}$/.test(upstream.commit)) throw Error('Invalid upstream');
if (git('status', '--porcelain')) throw Error('A clean checkout is required');
git('fetch', '--no-tags', 'https://github.com/' + upstream.repository + '.git', upstream.branch);
const head = git('rev-parse', 'FETCH_HEAD');
if (head === upstream.commit) { console.log('Upstream is unchanged'); process.exit(0); }
git('merge-base', '--is-ancestor', upstream.commit, head); // Refuse rewritten history.
const branch = 'sync/upstream-' + head.slice(0, 12);
git('checkout', '-b', branch);
try {
  git('merge', '--no-commit', '--no-ff', head);
} catch (error) {
  // Generated entry/metadata can be rebuilt. Source conflicts need human review.
  const conflicts = git('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
  const generated = new Set(['index.html', 'version.json']);
  if (!conflicts.length || conflicts.some(f => !generated.has(f))) {
    try { git('merge', '--abort'); } catch (_) {}
    throw Error('Upstream source conflicts need review: ' + conflicts.join(', '));
  }
  for (const file of conflicts) { git('checkout', '--ours', '--', file); git('add', '--', file); }
}
upstream.commit = head;
fs.writeFileSync(path.join(root, 'upstream.json'), JSON.stringify(upstream, null, 2) + '\n');
const configPath = path.join(root, 'config/site.json');
const config = JSON.parse(fs.readFileSync(configPath));
config.version = config.version.replace(/^(\d+\.\d+\.)(\d+)/, (_, prefix, patch) => prefix + (+patch + 1));
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'branch=' + branch + '\nhead=' + head + '\n');
console.log('Prepared ' + branch + '; build and verification must pass before committing.');
