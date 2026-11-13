/* Painel do operador (spec 152-2): lê /admin/stats do relay com o token de
   operador (só nesta aba, sessionStorage) e desenha KPIs, funil, séries e
   tabelas em SVG puro. CSP do site só permite script de 'self'. Texto vindo
   do banco (e-mail, perfil) passa sempre por esc(). */
(function () {
  "use strict";
  var main = document.getElementById("conteudo");
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // Em dev (site servido localmente) fala com o relay local.
  var RELAY = LOCAL ? "http://127.0.0.1:9000" : (main.getAttribute("data-relay") || "").replace(/\/+$/, "");
  var KEY = "localvision_ops_token";
  var SVGNS = "http://www.w3.org/2000/svg";
  var $ = function (id) { return document.getElementById(id); };
  var token = null;
  var days = 30;
  var last = null;

  var NF = new Intl.NumberFormat("pt-BR");
  var BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  var PCT = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
  var PLAN = { monthly: "Mensal", semiannual: "Semestral", annual: "Anual" };
  var PROVIDER = { mp: "Mercado Pago (R$)", paddle: "Paddle (US$)" };
  var DEVICE = { desktop: "Computador", mobile: "Celular", tablet: "Tablet", smarttv: "TV" };
  var REGION = (function () {
    try { return new Intl.DisplayNames(["pt-BR"], { type: "region" }); } catch (e) { return null; }
  })();
  var STEP = {
    visits: "Visitas no site", trial_requests: "Pedidos de trial", trial_installed: "Instalaram",
    registrations: "Cadastros no app", verified: "Confirmados", paying: "Pagantes",
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function load() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) {
    try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch (e) {}
  }
  function msg(el, text, isErr) { el.textContent = text || ""; el.classList.toggle("err", !!isErr); }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function pct(n, d) { return d > 0 ? PCT.format(n / d) : "—"; }
  function fmtDay(iso) { var p = iso.split("-"); return p[2] + "/" + p[1]; }
  function fmtTs(ts) {
    return ts ? new Date(ts * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  }

  function api(path) {
    return fetch(RELAY + path, { headers: { Authorization: "Bearer " + token } }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var err = new Error(data.detail || ("Erro " + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function show(logged) {
    $("login").hidden = logged;
    $("dash").hidden = !logged;
    $("logout").hidden = !logged;
  }

  function logout(text) {
    token = null;
    save(null);
    show(false);
    msg($("loginMsg"), text || "", !!text);
  }

  function refresh() {
    msg($("dashMsg"), "Carregando…");
    return api("/admin/stats?days=" + days).then(function (data) {
      last = data;
      msg($("dashMsg"), "");
      render(data);
      $("updated").textContent = "Atualizado " + fmtTs(data.generated_at) + " · janela de " + data.range.days + " dias";
    }).catch(function (e) {
      if (e.status === 401) return logout("Token inválido ou expirado.");
      msg($("dashMsg"), "Não deu para carregar: " + e.message, true);
    });
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────
  function kpi(label, value, deltaText) {
    return '<div class="kpi"><span class="label">' + esc(label) + '</span><span class="value">' + esc(value) +
      '</span><span class="delta">' + (deltaText || "&nbsp;") + "</span></div>";
  }
  function deltaText(cur, prev, d) {
    if (d == null) return prev === 0 && cur > 0 ? "novo vs período anterior (0)" : "vs anterior: " + NF.format(prev);
    var arrow = d > 0 ? "▲" : d < 0 ? "▼" : "■";
    return "<b>" + arrow + " " + PCT.format(Math.abs(d)) + "</b> vs anterior (" + NF.format(prev) + ")";
  }
  function renderKpis(d) {
    var o = d.overview, p = o.previous, dl = o.deltas;
    var web = o.visits != null
      ? [kpi("Visitas no site", NF.format(o.visits), deltaText(o.visits, p.visits, dl.visits))] : [];
    $("kpis").innerHTML = web.concat([
      kpi("Pedidos de trial", NF.format(o.trials), deltaText(o.trials, p.trials, dl.trials)),
      kpi("Cadastros confirmados", NF.format(o.verified), deltaText(o.verified, p.verified, dl.verified)),
      kpi("Novos pagantes", NF.format(o.new_paying), deltaText(o.new_paying, p.new_paying, dl.new_paying)),
      kpi("Cancelamentos", NF.format(o.cancelled), deltaText(o.cancelled, p.cancelled, dl.cancelled)),
      kpi("Assinaturas ativas", NF.format(o.paying), NF.format(o.paying_locations) + " locais cobertos"),
      kpi("MRR (R$)", BRL.format(o.mrr_brl), "ARR " + BRL.format(o.arr_brl)),
    ]).join("");
  }

  // ── Funil ────────────────────────────────────────────────────────────────
  // Duas coortes diferentes: a landing (pedido de trial → instalou) e o app
  // (cadastro → confirmado → pagante). Nem todo cadastro veio de um pedido de
  // trial, então a conversão só é calculada dentro de cada grupo.
  function renderFunnel(d) {
    var by = {};
    d.funnel.steps.forEach(function (s) { by[s.key] = s.count; });
    var groups = [
      // "Visitas" só vem quando a Cloudflare respondeu (152-3).
      ["Landing", ("visits" in by ? ["visits"] : []).concat(["trial_requests", "trial_installed"])],
      ["No app", ["registrations", "verified", "paying"]],
    ];
    var html = "";
    groups.forEach(function (g) {
      // Escala por grupo: as visitas (centenas) não achatam as outras etapas.
      var top = Math.max.apply(null, g[1].map(function (k) { return by[k] || 0; }).concat([1]));
      html += '<p class="ops-note" style="margin:6px 0 0">' + esc(g[0]) + "</p>";
      g[1].forEach(function (key, i) {
        var n = by[key] || 0, w = (n / top) * 100;
        var prev = i > 0 ? by[g[1][i - 1]] || 0 : 0;
        var conv = i > 0 ? pct(n, prev) + " da etapa anterior" : "";
        html += '<div class="fstep"><span class="name">' + esc(STEP[key] || key) + '</span>' +
          '<div class="fbar' + (w > 22 ? " inside" : "") + '"><span style="width:' + w.toFixed(1) + '%"></span>' +
          '<b style="' + (w > 22 ? "" : "left:calc(" + w.toFixed(1) + "% + 8px)") + '">' + NF.format(n) + "</b></div>" +
          (conv ? '<span class="fconv">' + conv + "</span>" : "") + "</div>";
      });
    });
    $("funnel").innerHTML = html;
    $("funnelNote").textContent = ("visits" in by ? "visita → trial: " + pct(by.trial_requests || 0, by.visits) + " · " : "") +
      "cadastro → pagante: " + pct(by.paying || 0, by.registrations || 0);
  }

  // ── Gráficos SVG ─────────────────────────────────────────────────────────
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  // Teto "redondo" e divisível por 4: as 4 linhas de grade caem em inteiros.
  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var n = Math.ceil(v / p);
    var m = (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
    return Math.ceil(m / 4) * 4;
  }
  function legend(target, series) {
    target.innerHTML = series.map(function (s) {
      return '<li><i style="background:' + cssVar(s.color) + '"></i>' + esc(s.label) + "</li>";
    }).join("");
  }
  function table(target, head, rows) {
    target.innerHTML = '<table class="tbl"><thead><tr>' + head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows.map(function (r) {
        return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
  }
  function tooltip(box, title, series, row) {
    var tip = box.querySelector(".tip");
    if (!tip) { tip = document.createElement("div"); tip.className = "tip"; box.appendChild(tip); }
    tip.innerHTML = '<div class="t">' + esc(title) + "</div>" + series.map(function (s) {
      return '<div class="row"><i style="background:' + cssVar(s.color) + '"></i>' + esc(s.label) + ": <b>" + NF.format(row[s.key]) + "</b></div>";
    }).join("");
    tip.hidden = false;
    return tip;
  }
  function placeTip(box, tip, x) {
    var bw = box.clientWidth, tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(bw - tw, x + 12)) + "px";
    tip.style.top = "0px";
  }
  function axes(svg, W, H, M, max) {
    for (var i = 0; i <= 4; i++) {
      var y = M.t + (H - M.t - M.b) * (1 - i / 4);
      el("line", { x1: M.l, x2: W - M.r, y1: y, y2: y, "class": "gridline" }, svg);
      var t = el("text", { x: M.l - 6, y: y + 4, "text-anchor": "end" }, svg);
      t.textContent = NF.format(max * i / 4);
    }
  }

  // Linhas com crosshair + tooltip (uma posição por dia).
  function lineChart(box, rows, labelOf, series) {
    box.innerHTML = "";
    var W = 640, H = 270, M = { t: 10, r: 12, b: 26, l: 34 };
    var max = niceMax(Math.max.apply(null, rows.map(function (r) {
      return Math.max.apply(null, series.map(function (s) { return r[s.key]; }));
    }).concat([0])));
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": series.map(function (s) { return s.label; }).join(", ") + " por dia" }, box);
    axes(svg, W, H, M, max);
    var n = rows.length, iw = W - M.l - M.r, ih = H - M.t - M.b;
    var X = function (i) { return M.l + (n <= 1 ? iw / 2 : (iw * i) / (n - 1)); };
    var Y = function (v) { return M.t + ih * (1 - v / max); };
    var ticks = Math.min(6, n);
    for (var k = 0; k < ticks; k++) {
      var i = Math.round((k * (n - 1)) / Math.max(1, ticks - 1));
      var t = el("text", { x: X(i), y: H - 6, "text-anchor": k === 0 ? "start" : k === ticks - 1 ? "end" : "middle" }, svg);
      t.textContent = labelOf(rows[i]);
    }
    series.forEach(function (s) {
      var d = rows.map(function (r, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(r[s.key]).toFixed(1); }).join(" ");
      el("path", { d: d, fill: "none", stroke: cssVar(s.color), "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    });
    var cross = el("line", { "class": "cross", y1: M.t, y2: H - M.b, x1: -10, x2: -10, visibility: "hidden" }, svg);
    var dots = series.map(function (s) {
      return el("circle", { r: 4, cx: -10, cy: -10, visibility: "hidden", fill: cssVar(s.color), stroke: cssVar("--bg-surface"), "stroke-width": 2 }, svg);
    });
    var hit = el("rect", { x: M.l, y: M.t, width: iw, height: ih, fill: "transparent" }, svg);
    function move(ev) {
      var r = svg.getBoundingClientRect();
      var px = ((ev.clientX - r.left) / r.width) * W;
      var i = n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - M.l) / iw) * (n - 1))));
      cross.setAttribute("visibility", "visible"); cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i));
      dots.forEach(function (c, j) { c.setAttribute("visibility", "visible"); c.setAttribute("cx", X(i)); c.setAttribute("cy", Y(rows[i][series[j].key])); });
      var tip = tooltip(box, labelOf(rows[i], true), series, rows[i]);
      placeTip(box, tip, (X(i) / W) * r.width);
    }
    function leave() {
      cross.setAttribute("visibility", "hidden");
      dots.forEach(function (c) { c.setAttribute("visibility", "hidden"); });
      var tip = box.querySelector(".tip"); if (tip) tip.hidden = true;
    }
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", leave);
  }

  // Barras agrupadas por semana, tooltip por grupo.
  function groupedBars(box, rows, labelOf, series) {
    box.innerHTML = "";
    var W = 640, H = 210, M = { t: 10, r: 8, b: 26, l: 30 };
    var max = niceMax(Math.max.apply(null, rows.map(function (r) {
      return Math.max.apply(null, series.map(function (s) { return r[s.key]; }));
    }).concat([0])));
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": series.map(function (s) { return s.label; }).join(" e ") + " por semana" }, box);
    axes(svg, W, H, M, max);
    var n = rows.length, iw = W - M.l - M.r, ih = H - M.t - M.b;
    var gw = iw / n, bw = Math.min(14, (gw - 8) / series.length - 2);
    rows.forEach(function (r, i) {
      var gx = M.l + gw * i + (gw - (bw + 2) * series.length + 2) / 2;
      series.forEach(function (s, j) {
        var v = r[s.key], h = (ih * v) / max, x = gx + j * (bw + 2), y = M.t + ih - h;
        if (v > 0) {
          var rr = Math.min(4, bw / 2, h);
          el("path", { fill: cssVar(s.color), d: "M" + x + " " + (M.t + ih) + "V" + (y + rr) + "Q" + x + " " + y + " " + (x + rr) + " " + y +
            "H" + (x + bw - rr) + "Q" + (x + bw) + " " + y + " " + (x + bw) + " " + (y + rr) + "V" + (M.t + ih) + "Z" }, svg);
        }
      });
      if (i % 2 === 0 || n <= 6) {
        var t = el("text", { x: M.l + gw * i + gw / 2, y: H - 6, "text-anchor": "middle" }, svg);
        t.textContent = labelOf(r);
      }
      var hit = el("rect", { x: M.l + gw * i, y: M.t, width: gw, height: ih, fill: "transparent" }, svg);
      var show = function () {
        var rect = svg.getBoundingClientRect();
        var tip = tooltip(box, "Semana de " + labelOf(r), series, r);
        placeTip(box, tip, ((M.l + gw * i + gw / 2) / W) * rect.width);
      };
      hit.addEventListener("pointerenter", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", function () { var tip = box.querySelector(".tip"); if (tip) tip.hidden = true; });
    });
  }

  function hbars(items, empty) {
    var top = Math.max.apply(null, items.map(function (i) { return i[1]; }).concat([1]));
    if (!items.length) return '<p class="empty">' + esc(empty || "Nenhuma assinatura ativa.") + "</p>";
    return '<div class="hbars">' + items.map(function (it) {
      return '<div class="hbar"><span class="k" title="' + esc(it[0]) + '">' + esc(it[0]) + '</span><div class="track"><span style="width:' + ((it[1] / top) * 100).toFixed(1) +
        '%"></span></div><span class="n">' + NF.format(it[1]) + "</span></div>";
    }).join("") + "</div>";
  }

  // ── Site (Cloudflare Web Analytics, 152-3) ───────────────────────────────
  // Rótulos vêm da Cloudflare (caminho, host de origem): sempre via esc().
  function webRows(rows, labelOf) {
    return (rows || []).map(function (r) { return [labelOf(r.key), r.visits]; });
  }
  function country(code) {
    try { return (REGION && /^[A-Z]{2}$/.test(code) && REGION.of(code)) || code || "Desconhecido"; } catch (e) { return code; }
  }
  function renderWeb(d) {
    var w = d.web || { available: false, reason: "not_configured" };
    $("webOn").hidden = !w.available;
    $("webOff").hidden = !!w.available;
    if (!w.available) {
      $("webOff").innerHTML = '<h3 class="kicker" style="margin:0 0 6px">Visitas no site</h3><p class="ops-note">' +
        (w.reason === "error"
          ? "Cloudflare indisponível agora (" + esc(w.error || "erro") + "). O resto do painel não depende dela."
          : "Web Analytics não configurado no relay: faltam os segredos CF_ANALYTICS_API_TOKEN e CF_ACCOUNT_ID.") +
        "</p>";
      return;
    }
    var series = [
      { key: "visits", label: "Visitas", color: "--s1" },
      { key: "pageviews", label: "Páginas vistas", color: "--s2" },
    ];
    legend($("webLegend"), series);
    lineChart($("webDaily"), w.daily, function (r) { return fmtDay(r.day); }, series);
    table($("webTable"), ["Dia", "Visitas", "Páginas vistas"], w.daily.slice().reverse().map(function (r) {
      return [fmtDay(r.day), NF.format(r.visits), NF.format(r.pageviews)];
    }));
    $("webNote").textContent = NF.format(w.totals.pageviews) + " páginas vistas · aproximado" +
      (w.clamped ? " · só os últimos " + w.days + " dias" : "");
    $("webPages").innerHTML = hbars(webRows(w.pages, function (k) { return k || "/"; }), "Sem visitas no período.");
    $("webRefs").innerHTML = hbars(webRows(w.referrers, function (k) { return k || "Direto / sem origem"; }), "Sem visitas no período.") +
      (w.hosts && w.hosts.length > 1
        ? '<p class="ops-note" style="margin:14px 0 6px">Por site</p>' + hbars(webRows(w.hosts, function (k) { return k || "—"; }))
        : "");
    $("webAudience").innerHTML =
      '<p class="ops-note" style="margin:0 0 6px">Países</p>' + hbars(webRows(w.countries, country), "Sem visitas no período.") +
      '<p class="ops-note" style="margin:14px 0 6px">Dispositivos</p>' +
      hbars(webRows(w.devices, function (k) { return DEVICE[k] || k || "Desconhecido"; }), "Sem visitas no período.");
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function render(d) {
    renderKpis(d);
    renderWeb(d);
    renderFunnel(d);

    var dailySeries = [
      { key: "trials", label: "Pedidos de trial", color: "--s1" },
      { key: "registrations", label: "Cadastros no app", color: "--s2" },
      { key: "verified", label: "Confirmados", color: "--s3" },
    ];
    legend($("dailyLegend"), dailySeries);
    lineChart($("daily"), d.funnel.daily, function (r) { return fmtDay(r.day); }, dailySeries);
    table($("dailyTable"), ["Dia", "Trials", "Cadastros", "Confirmados"], d.funnel.daily.slice().reverse().map(function (r) {
      return [fmtDay(r.day), NF.format(r.trials), NF.format(r.registrations), NF.format(r.verified)];
    }));

    table($("cohorts"), ["Semana", "Cadastros", "Confirmados", "Pagantes", "Conv."], d.funnel.cohorts.slice().reverse().map(function (c) {
      return [fmtDay(c.week), NF.format(c.registrations), NF.format(c.verified), NF.format(c.paying), pct(c.paying, c.registrations)];
    }));
    var profiles = d.funnel.by_profile;
    if (profiles.length) {
      table($("profiles"), ["Perfil", "Trials", "Cadastros", "Confirm.", "Pagantes"], profiles.map(function (p) {
        return [esc(p.profile), NF.format(p.trials), NF.format(p.registrations), NF.format(p.verified), NF.format(p.paying)];
      }));
    } else {
      $("profiles").innerHTML = '<p class="empty">Ainda sem cadastros.</p>';
    }

    var pay = d.payments;
    var weeklySeries = [
      { key: "new", label: "Novas pagantes", color: "--s1" },
      { key: "cancelled", label: "Canceladas", color: "--s2" },
    ];
    legend($("weeklyLegend"), weeklySeries);
    groupedBars($("weekly"), pay.weekly, function (r) { return fmtDay(r.week); }, weeklySeries);
    table($("weeklyTable"), ["Semana", "Novas", "Canceladas"], pay.weekly.slice().reverse().map(function (w) {
      return [fmtDay(w.week), NF.format(w.new), NF.format(w.cancelled)];
    }));

    var byCount = function (a, b) { return b[1] - a[1]; };
    var plans = Object.keys(pay.active_by_plan).map(function (k) { return [PLAN[k] || k, pay.active_by_plan[k]]; }).sort(byCount);
    var providers = Object.keys(pay.active_by_provider).filter(function (k) { return pay.active_by_provider[k] > 0; })
      .map(function (k) { return [PROVIDER[k] || k, pay.active_by_provider[k]]; }).sort(byCount);
    var locs = Object.keys(pay.locations_hist).sort(function (a, b) { return a - b; })
      .map(function (k) { return [k + (k === "1" ? " local" : " locais"), pay.locations_hist[k]]; });
    $("mix").innerHTML =
      '<p class="ops-note" style="margin:0 0 6px">Por plano</p>' + hbars(plans) +
      '<p class="ops-note" style="margin:14px 0 6px">Por meio de pagamento</p>' + hbars(providers) +
      '<p class="ops-note" style="margin:14px 0 6px">Locais por assinatura</p>' + hbars(locs);
    $("mrrNote").innerHTML = "ARPA " + esc(BRL.format(pay.arpa_brl)) + " · churn no período " + esc(PCT.format(pay.churn_rate)) +
      " · checkouts abandonados " + esc(NF.format(pay.abandoned_checkouts)) +
      " · Nuvem: " + esc(NF.format(pay.cloud.enabled)) + " ativa(s), " + esc(fmtBytes(pay.cloud.bytes_month)) + " em " + esc(pay.cloud.month) +
      ". MRR só em R$ (Mercado Pago); Paddle cobra em US$.";
  }

  function fmtBytes(b) {
    var u = ["B", "KB", "MB", "GB", "TB"], i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (i ? b.toFixed(1).replace(".", ",") : String(b)) + " " + u[i];
  }

  function loadRecent() {
    var box = $("recent");
    box.innerHTML = '<p class="empty">Carregando…</p>';
    api("/admin/stats/recent?limit=30").then(function (r) {
      var regs = r.registrations.map(function (x) {
        var s = x.subscription;
        var sub = s ? '<span class="badge' + (s.active ? " on" : "") + '">' + esc((PLAN[s.plan] || s.plan) + (s.active ? " · ativa" : " · " + s.status)) + "</span>" : "—";
        return ['<span class="l">' + esc(x.email) + "</span>", esc(x.profile),
          x.status === "verified" ? "confirmado" : "pendente", fmtTs(x.requested_at), sub];
      });
      box.innerHTML = '<h3 class="kicker" style="margin:4px 0 8px">Cadastros no app</h3><div class="tbl-wrap" id="recentRegs"></div>' +
        '<h3 class="kicker" style="margin:18px 0 8px">Pedidos de trial (landing)</h3><div class="tbl-wrap" id="recentTrials"></div>';
      if (regs.length) table($("recentRegs"), ["E-mail", "Perfil", "Status", "Pedido em", "Assinatura"], regs);
      else $("recentRegs").innerHTML = '<p class="empty">Nenhum cadastro.</p>';
      var trials = r.trials.map(function (t) {
        return ['<span class="l">' + esc(t.email) + "</span>", esc(t.profile), NF.format(t.camera_count || 0), fmtTs(t.created_at),
          t.download_sent_at ? "enviado" : "—"];
      });
      if (trials.length) table($("recentTrials"), ["E-mail", "Perfil", "Câmeras", "Pedido em", "Download"], trials);
      else $("recentTrials").innerHTML = '<p class="empty">Nenhum pedido.</p>';
    }).catch(function (e) {
      if (e.status === 401) return logout("Token inválido ou expirado.");
      box.innerHTML = '<p class="ops-msg err">' + esc(e.message) + "</p>";
    });
  }

  // ── Eventos ──────────────────────────────────────────────────────────────
  $("tokenForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var v = ev.target.token.value.trim();
    if (!v) return msg($("loginMsg"), "Informe o token.", true);
    token = v;
    msg($("loginMsg"), "Conferindo…");
    api("/admin/stats?days=" + days).then(function (data) {
      save(token);
      ev.target.reset();
      msg($("loginMsg"), "");
      show(true);
      last = data;
      render(data);
      $("updated").textContent = "Atualizado " + fmtTs(data.generated_at) + " · janela de " + data.range.days + " dias";
    }).catch(function (e) {
      token = null;
      msg($("loginMsg"), e.status === 401 ? "Token inválido." : "Não deu para conectar ao relay: " + e.message, true);
    });
  });
  $("logout").addEventListener("click", function () { logout(""); $("recent").innerHTML = ""; });
  $("refresh").addEventListener("click", refresh);
  $("loadRecent").addEventListener("click", loadRecent);
  Array.prototype.forEach.call(document.querySelectorAll(".seg button"), function (b) {
    b.addEventListener("click", function () {
      days = Number(b.getAttribute("data-days"));
      Array.prototype.forEach.call(document.querySelectorAll(".seg button"), function (o) {
        o.setAttribute("aria-pressed", String(o === b));
      });
      refresh();
    });
  });
  // Troca de tema recolore os SVGs (cores lidas das variáveis CSS).
  new MutationObserver(function () { if (last) render(last); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  token = load();
  if (token) { show(true); refresh(); } else { show(false); }
})();
