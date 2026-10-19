const fs = require('node:fs');
const path = require('node:path');

function load(root, env = process.env) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config/site.json'), 'utf8'));
  if (env.FIREBASE_WEB_CONFIG && env.FIREBASE_WEB_CONFIG.trim()) config.firebase = JSON.parse(env.FIREBASE_WEB_CONFIG);
  if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(config.version)) throw new Error('Invalid site version');
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repository)) throw new Error('Invalid GitHub repository');
  if (config.firebase) {
    for (const field of ['apiKey', 'authDomain', 'projectId', 'appId']) {
      if (typeof config.firebase[field] !== 'string' || !config.firebase[field].trim()) throw new Error('Missing Firebase field: ' + field);
    }
    if (['pokesurvivor-free', 'pokesurvivor-jpter'].includes(config.firebase.projectId)) throw new Error('Configure your own Firebase project.');
    const allowed = ['apiKey', 'authDomain', 'projectId', 'appId', 'storageBucket', 'messagingSenderId', 'databaseURL', 'measurementId'];
    if (Object.keys(config.firebase).some(k => !allowed.includes(k))) throw new Error('Only public Firebase web configuration is accepted; do not provide service-account credentials.');
  }
  if (!config.cloud || !Array.isArray(config.cloud.allowedHosts) || !config.cloud.allowedHosts.length
      || config.cloud.allowedHosts.some(h => typeof h !== 'string' || !/^[a-z0-9.-]+$/i.test(h))) throw new Error('Configure cloud hostnames without URL schemes or paths.');
  for (const [key, min, max] of [['autoSaveMs', 15000, 1800000], ['minGapMs', 1000, 65000]]) {
    if (!Number.isInteger(config.cloud[key]) || config.cloud[key] < min || config.cloud[key] > max) throw new Error('Invalid cloud setting: ' + key);
  }
  return config;
}
module.exports = { load };
