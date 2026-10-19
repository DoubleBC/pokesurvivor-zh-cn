/* ============ boot.js — lo primero que corre (antes estaba dentro del HTML) ============
 * Fuera del HTML para que la política de seguridad (CSP, en dev.html) pueda
 * prohibir todo el código metido en la página: así, aunque algún día se
 * colara texto con código en algo que se pinta, el navegador no lo ejecuta.
 *   - PS_PAGES: hay guía y Pokédex (no con --sin-seo, ver tools/build.js).
 *   - El idioma de la pantalla de carga, antes de que cargue el juego.
 */
window.PS_PAGES = !!document.querySelector('meta[name="ps-pages"]');
(function () {
  var s = null; try { s = localStorage.getItem('ps.lang'); } catch (e) {}
  var n = ((navigator.languages && navigator.languages[0]) || navigator.language || 'es').toLowerCase();
  var pref = document.querySelector('meta[name="ps-default-lang"]');
  var l = ['es', 'en', 'zh-CN'].includes(s) ? s : (/\/en(\/|$)/.test(location.pathname) ? 'en' : (pref ? pref.content : (n.indexOf('zh') === 0 ? 'zh-CN' : n.indexOf('es') === 0 ? 'es' : 'en')));
  document.documentElement.lang = l;
  if (l === 'en') {
    var p = document.querySelectorAll('#boot p');
    p[0].textContent = 'A Pokémon survival game, free in your browser and on mobile.';
    p[1].textContent = 'Loading…';
  }
  if (l === 'zh-CN') {
    var p = document.querySelectorAll('#boot p');
    p[0].textContent = 'PokéSurvivor · 宝可梦幸存者 · 本地汉化版';
    p[1].textContent = '加载中…';
  }
})();
