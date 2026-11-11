/* Modo claro/escuro do site. Carregado no <head> (sem defer) para aplicar o
   tema antes da pintura; o botão sol/lua entra no cabeçalho (.top-actions).
   CSP do site só permite script de 'self', por isso não é inline. */
(function () {
  var KEY = "localvision_site_theme";
  var COLORS = { dark: "#08101d", light: "#f5f8fc" };
  var root = document.documentElement;
  // Padrão claro (27/10/2026); a escolha salva no botão sol/lua prevalece.
  var theme = "light";
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") theme = saved;
  } catch (e) {}

  function apply(t) {
    theme = t;
    root.setAttribute("data-theme", t);
    root.style.colorScheme = t;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", COLORS[t]);
    swapLogos();
  }

  // Bico branco da coruja some no fundo claro: variante com bico navy
  // (gerada por scripts/make_logo.py).
  function swapLogos() {
    var imgs = document.querySelectorAll('img[src*="logo-owl-refined"]');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute("src");
      var next = src.replace(/logo-owl-refined(-light)?\.png(\?[^"]*)?/,
        theme === "light" ? "logo-owl-refined-light.png?v=20261012" : "logo-owl-refined.png?v=20260927-lens");
      if (next !== src) imgs[i].setAttribute("src", next);
    }
  }
  apply(theme);

  var en = (root.getAttribute("lang") || "").toLowerCase().indexOf("en") === 0;
  var LABELS = en
    ? { light: "Switch to light mode", dark: "Switch to dark mode" }
    : { light: "Mudar para modo claro", dark: "Mudar para modo escuro" };
  var SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var SUN = SVG + '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = SVG + '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';

  function paint(btn) {
    var label = theme === "dark" ? LABELS.light : LABELS.dark;
    btn.innerHTML = theme === "dark" ? SUN : MOON;
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }

  function mount() {
    swapLogos();
    var host = document.querySelector(".top-actions");
    if (!host || host.querySelector(".theme-btn")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-btn";
    paint(btn);
    btn.addEventListener("click", function () {
      apply(theme === "dark" ? "light" : "dark");
      try { localStorage.setItem(KEY, theme); } catch (e) {}
      paint(btn);
    });
    host.insertBefore(btn, host.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
