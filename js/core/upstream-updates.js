/* Read-only upstream discovery. Publishing/merging is handled in GitHub, never in the browser. */
G.UpstreamUpdates = (() => {
  const release = G.RELEASE || {};
  const repo = release.upstreamRepository, base = release.upstreamCommit, branch = release.upstreamBranch;
  const valid = /^[\w.-]+\/[\w.-]+$/.test(repo || '') && /^[0-9a-f]{40}$/.test(base || '') && /^[\w./-]+$/.test(branch || '');
  const endpoint = valid ? 'https://api.github.com/repos/' + repo : '';
  const key = 'ps.upstream.' + repo + '.' + base, TTL = 10 * 60 * 1000;
  const listeners = new Set();
  let state = { status: 'idle', checkedAt: 0 }, running = null;
  try {
    const old = JSON.parse(localStorage.getItem(key));
    if (old && ['current', 'available', 'history'].includes(old.status)
        && /^[0-9a-f]{40}$/.test(old.head) && Number.isFinite(old.checkedAt)
        && old.checkedAt <= Date.now() && Number.isInteger(old.ahead) && old.ahead >= 0) state = old;
  } catch (e) { /* Storage is optional. */ }

  function publish(next) {
    state = next;
    for (const fn of listeners) { try { fn({ ...state }); } catch (e) { console.warn('[Updates]', e); } }
  }
  async function get(url) {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 8000);
    try {
      const response = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: abort.signal,
        headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'rate' : 'network');
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function check(force = false) {
    if (running) return running;
    if (!valid) { publish({ status: 'error', error: 'config', checkedAt: 0 }); return Promise.resolve(state); }
    if (!force && state.checkedAt && Date.now() - state.checkedAt < TTL) return Promise.resolve({ ...state });
    publish({ ...state, status: 'checking', error: null });
    running = (async () => {
      try {
        const ref = await get(endpoint + '/git/ref/heads/' + branch.split('/').map(encodeURIComponent).join('/'));
        const head = ref && ref.object && ref.object.sha;
        if (!/^[0-9a-f]{40}$/.test(head || '')) throw new Error('response');
        let status = 'current', ahead = 0;
        if (head !== base) {
          const diff = await get(endpoint + '/compare/' + base + '...' + head + '?per_page=1');
          if (diff.status === 'ahead' && Number.isInteger(diff.ahead_by) && diff.ahead_by > 0) { status = 'available'; ahead = diff.ahead_by; }
          else if (diff.status === 'behind' || diff.status === 'diverged') status = 'history';
          else if (diff.status !== 'identical') throw new Error('response');
        }
        const next = { status, head, ahead, checkedAt: Date.now() };
        try { localStorage.setItem(key, JSON.stringify(next)); } catch (e) { /* no storage */ }
        publish(next);
      } catch (e) {
        // An unsuccessful check must never say "up to date" or suppress retry for ten minutes.
        publish({ status: 'error', error: e.message === 'rate' ? 'rate' : 'network', checkedAt: 0 });
      } finally { running = null; }
      return { ...state };
    })();
    return running;
  }
  return { check, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, get state() { return { ...state }; } };
})();
