/* Generate the local entry from dev.html without downloading build tools. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const config = require('./site-config.cjs').load(root);
const upstream = JSON.parse(fs.readFileSync(path.join(root, 'upstream.json'), 'utf8'));
if (!/^[0-9a-f]{40}$/.test(upstream.commit) || !/^[\w.-]+\/[\w.-]+$/.test(upstream.repository)
    || !/^[\w./-]+$/.test(upstream.branch)) throw new Error('Invalid upstream reference');
fs.writeFileSync(path.join(root, 'js/data/site-config.js'), '/* Generated public web configuration. */\nG.SITE_CONFIG = ' + JSON.stringify(config, null, 2) + ';\n');
const source = fs.readFileSync(path.join(root, 'dev.html'), 'utf8');
const scripts = [...source.matchAll(/<script[^>]*src="(js\/[^"?]+\.js)"/g)].map(m => m[1]).filter(f => f !== 'js/data/release.js');
const hash = crypto.createHash('sha256');
for (const file of [...scripts, 'css/style.css', 'manifest.webmanifest']) hash.update(fs.readFileSync(path.join(root, file)));
hash.update(source).update(JSON.stringify(upstream));
const release = { v: hash.digest('hex').slice(0, 12), version: config.version, upstreamCommit: upstream.commit,
  upstreamRepository: upstream.repository, upstreamBranch: upstream.branch, repository: config.repository };
fs.writeFileSync(path.join(root, 'js/data/release.js'), '/* Generated release metadata. */\nG.RELEASE = ' + JSON.stringify(release, null, 2) + ';\n');
fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify(release, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ v: release.v, version: release.version, at: new Date().toISOString() }) + '\n');
const html = source
  .replace(/<!-- seo:begin -->[\s\S]*?<!-- seo:end -->\n?/g, '')
  .replace(/<!-- dev.html: página fuente[^>]*-->/, '<!-- Generated from dev.html by tools/build-local.js. -->')
  .replace('<html lang="es">', '<html lang="zh-CN">')
  .replace(/<title>[^<]*<\/title>/, '<title>PokéSurvivor · 宝可梦幸存者 · 本地汉化版</title>')
  .replace('__RELEASE_HASH__', release.v)
  .replace(/^[\t ]+$/gm, '');
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('Generated index.html, version ' + release.version + ' (' + release.v + '), cloud ' + (config.firebase ? 'configured' : 'not configured'));
