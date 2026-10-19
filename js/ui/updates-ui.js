/* The homepage's release/update and cloud-save status. External strings are never inserted as HTML. */
G.UpdatesUI = (() => {
  const $ = id => document.getElementById(id);
  const language = () => G.I18n.lang === 'zh-CN' ? 'zh' : G.I18n.lang === 'es' ? 'es' : 'en';
  const text = (zh, en, es) => ({ zh, en, es })[language()];
  let initialized = false, saving = false;

  function render() {
    if (!$('release-panel')) return;
    const r = G.RELEASE, s = G.UpstreamUpdates.state;
    $('release-version').textContent = text('汉化版 ', 'Chinese edition ', 'Edición china ') + r.version + ' · ' + r.v.slice(0, 7)
      + ' · ' + text('原版 ', 'Upstream ', 'Original ') + r.upstreamCommit.slice(0, 7);
    const messages = {
      idle: text('进入主页时检查原版更新', 'Checks upstream when entering the homepage', 'Busca actualizaciones al abrir el menú'),
      checking: text('正在检查原版更新…', 'Checking upstream…', 'Buscando actualizaciones…'),
      current: text('原版暂无新更新', 'Upstream is up to date', 'El original está al día'),
      available: text('原版有 ' + s.ahead + ' 个新提交，尚未合入汉化版', s.ahead + ' new upstream commits; not yet included', s.ahead + ' commits nuevos pendientes'),
      history: text('原版历史发生变化，需要人工核对', 'Upstream history changed; manual review is needed', 'El historial original cambió; hay que revisarlo'),
      error: s.error === 'rate' ? text('GitHub 检查次数受限，请稍后重试', 'GitHub rate limit reached; retry later', 'Límite de GitHub; inténtalo más tarde')
        : text('无法检查原版更新，可以稍后重试', 'Could not check upstream; retry later', 'No se pudo comprobar; inténtalo más tarde')
    };
    $('upstream-status').textContent = messages[s.status];
    if (s.checkedAt && s.status !== 'checking') $('upstream-status').textContent += ' · ' + new Date(s.checkedAt).toLocaleTimeString(G.I18n.lang, { hour: '2-digit', minute: '2-digit' });
    const check = $('upstream-check');
    check.textContent = text('检查原版更新', 'Check upstream', 'Buscar actualizaciones');
    check.disabled = s.status === 'checking';
    const available = s.status === 'available' || s.status === 'history';
    const diff = $('upstream-diff');
    diff.classList.toggle('hidden', !available);
    diff.textContent = text('查看更新', 'View changes', 'Ver cambios');
    diff.href = 'https://github.com/' + r.upstreamRepository + '/compare/' + r.upstreamCommit + '...' + (s.head || r.upstreamCommit);
    const sync = $('upstream-sync');
    sync.classList.toggle('hidden', !available);
    sync.textContent = text('同步到汉化版', 'Prepare update', 'Preparar actualización');
    sync.href = 'https://github.com/' + r.repository + '/actions/workflows/sync-upstream.yml';
    renderCloud();
  }

  function renderCloud() {
    const node = $('cloud-status');
    if (!node || !G.DB) return;
    const configured = !!(G.SITE_CONFIG && G.SITE_CONFIG.firebase);
    const state = G.DB.guest ? 'guest' : G.DB.syncState;
    const states = {
      guest: text('访客：进度不会保存', 'Guest: progress is not saved', 'Invitado: no se guarda'),
      local: configured ? text('云端暂不可用，仅保存在此浏览器', 'Cloud unavailable; saved in this browser only', 'Nube no disponible; sólo en este navegador')
        : text('云存档尚未配置，当前仅保存在此浏览器', 'Cloud not configured; saved in this browser only', 'Nube sin configurar; sólo en este navegador'),
      ok: text('云存档已同步，可在其他设备登录继续', 'Cloud saved; sign in on another device to continue', 'Guardado en la nube; puedes seguir en otro dispositivo'),
      syncing: text('正在同步云存档…', 'Syncing cloud save…', 'Sincronizando…'),
      pending: text('本地已保存，等待同步到云端', 'Saved locally; cloud upload pending', 'Guardado local; subida pendiente'),
      offline: text('离线：本地已保存，联网后重试同步', 'Offline: saved locally; will retry online', 'Sin conexión: guardado local; se reintentará')
    };
    node.textContent = states[state] || states.local;
    const button = $('cloud-save-menu');
    button.classList.toggle('hidden', G.DB.mode !== 'cloud' || G.DB.guest);
    button.disabled = saving || state === 'syncing';
    button.textContent = text('同步云存档', 'Save to cloud', 'Guardar en la nube');
  }

  async function save() {
    if (saving) return;
    saving = true; renderCloud();
    try {
      const result = await G.DB.saveNow();
      const message = !result.ok ? text('尚未同步成功，请检查网络后重试', 'Not synced; check your connection and retry', 'No se ha sincronizado; revisa la conexión')
        : result.why === 'wait' ? text('将在 ' + result.secs + ' 秒后同步，请等待显示同步成功', 'Syncing in ' + result.secs + ' s; wait for confirmation', 'Se sincronizará en ' + result.secs + ' s')
          : text('云存档已同步', 'Cloud save synced', 'Guardado sincronizado');
      G.UI.toast(message, 4500);
    } catch (e) {
      G.UI.toast(text('云存档同步失败，请稍后重试', 'Cloud save failed; retry later', 'Error al guardar; inténtalo más tarde'), 4500);
    } finally { saving = false; renderCloud(); }
  }
  function open() {
    if (!initialized) {
      initialized = true;
      $('upstream-check').onclick = () => G.UpstreamUpdates.check(true);
      $('cloud-save-menu').onclick = save;
      G.UpstreamUpdates.subscribe(render);
      G.DB.onSync(renderCloud);
    }
    render();
    G.UpstreamUpdates.check();
  }
  return { open };
})();
