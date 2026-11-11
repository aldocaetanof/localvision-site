/* Visualizador da Nuvem (spec 144-3): login por código enviado ao e-mail do
   dono, lista dos alertas com foto/clipe (URLs do R2 que expiram em 5 min),
   filtro por câmera, download e exclusão. A sessão (12 h) fica só nesta aba
   (sessionStorage). CSP do site só permite script de 'self'. */
(function () {
  "use strict";
  var main = document.getElementById("conteudo");
  var RELAY = (main.getAttribute("data-relay") || "").replace(/\/+$/, "");
  var KEY = "localvision_cloud_session";
  var $ = function (id) { return document.getElementById(id); };
  var session = null;
  var email = "";
  var nextBefore = null;
  var cams = {};

  function load() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) {
    try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch (e) {}
  }

  function api(method, path, body) {
    var headers = { "Content-Type": "application/json" };
    if (session) headers.Authorization = "Bearer " + session;
    return fetch(RELAY + path, {
      method: method, headers: headers, body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
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

  function msg(el, text, isErr) {
    el.textContent = text || "";
    el.classList.toggle("err", !!isErr);
  }

  function show(loggedIn) {
    $("login").hidden = loggedIn;
    $("list").hidden = !loggedIn;
    $("logout").hidden = !loggedIn;
  }

  function fmtDate(ts) {
    return new Date(ts * 1000).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }

  function button(text, cls) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn " + cls;
    b.textContent = text;
    return b;
  }

  function card(ev) {
    var art = document.createElement("article");
    art.className = "card cloud-item";
    var media;
    if (ev.jpg_url) {
      media = document.createElement("img");
      media.src = ev.jpg_url;
      media.alt = "Foto do alerta: " + ev.message;
      media.loading = "lazy";
    } else {
      media = document.createElement("div");
      media.style.aspectRatio = "16 / 9";
    }
    art.appendChild(media);

    var meta = document.createElement("div");
    meta.className = "meta";
    var title = document.createElement("strong");
    title.textContent = ev.message || "Alerta";
    var when = document.createElement("span");
    when.textContent = (ev.cam_name || "Câmera") + " · " + fmtDate(ev.ts);
    meta.appendChild(title);
    meta.appendChild(when);
    art.appendChild(meta);

    var actions = document.createElement("div");
    actions.className = "actions";
    if (ev.mp4_url) {
      var play = button("Ver clipe", "btn-primary");
      play.addEventListener("click", function () {
        var video = document.createElement("video");
        video.src = ev.mp4_url;
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        art.replaceChild(video, art.firstChild);
        play.remove();
      });
      actions.appendChild(play);
      var dl = document.createElement("a");
      dl.className = "btn btn-ghost";
      dl.href = ev.mp4_download_url || ev.mp4_url;
      dl.textContent = "Baixar";
      dl.rel = "noopener";
      actions.appendChild(dl);
    }
    var del = button("Apagar", "btn-ghost");
    del.addEventListener("click", function () {
      if (!window.confirm("Apagar este alerta da Nuvem? A cópia no seu computador não é afetada.")) return;
      del.disabled = true;
      api("POST", "/cloud/viewer/events/delete", { event_id: ev.event_id }).then(function () {
        art.remove();
      }).catch(function (e) {
        del.disabled = false;
        handleError(e, $("listMsg"));
      });
    });
    actions.appendChild(del);
    art.appendChild(actions);
    return art;
  }

  function handleError(e, el) {
    if (e.status === 401) {
      logout("Sua sessão expirou. Entre de novo.");
      return;
    }
    msg(el, e.message || "Não foi possível falar com a Nuvem.", true);
  }

  function addCams(events) {
    var sel = $("camFilter");
    events.forEach(function (ev) {
      if (ev.cam_name && !cams[ev.cam_name]) {
        cams[ev.cam_name] = true;
        var opt = document.createElement("option");
        opt.value = ev.cam_name;
        opt.textContent = ev.cam_name;
        sel.appendChild(opt);
      }
    });
  }

  function fetchPage(reset) {
    var grid = $("grid");
    if (reset) { grid.textContent = ""; nextBefore = null; }
    var q = "?limit=30";
    if (nextBefore) q += "&before=" + encodeURIComponent(nextBefore);
    var cam = $("camFilter").value;
    if (cam) q += "&cam=" + encodeURIComponent(cam);
    msg($("listMsg"), "Carregando…");
    $("more").hidden = true;
    return api("GET", "/cloud/viewer/events" + q).then(function (data) {
      $("retention").textContent = "Guardados por " + data.retention_days + " dias.";
      addCams(data.events);
      data.events.forEach(function (ev) { grid.appendChild(card(ev)); });
      nextBefore = data.next_before;
      $("more").hidden = !nextBefore;
      msg($("listMsg"), grid.children.length ? "" : "Nenhum alerta na Nuvem por enquanto.");
    }).catch(function (e) { handleError(e, $("listMsg")); });
  }

  function logout(text) {
    session = null;
    save(null);
    show(false);
    $("codeForm").hidden = true;
    $("emailForm").hidden = false;
    msg($("loginMsg"), text || "");
  }

  $("emailForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = e.target.elements.email;
    email = (input.value || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      msg($("loginMsg"), "Informe um e-mail válido.", true);
      return;
    }
    var btn = e.target.querySelector("button");
    btn.disabled = true;
    api("POST", "/cloud/viewer/login/start", { email: email }).then(function () {
      $("codeEmail").textContent = email;
      $("emailForm").hidden = true;
      $("codeForm").hidden = false;
      $("codeForm").elements.code.focus();
      msg($("loginMsg"), "Se este e-mail tiver a Nuvem ativa, o código chega em instantes. Confira também o spam.");
    }).catch(function (err) {
      msg($("loginMsg"), err.message, true);
    }).then(function () { btn.disabled = false; });
  });

  $("codeForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = (e.target.elements.code.value || "").trim();
    if (!/^\d{6}$/.test(code)) {
      msg($("loginMsg"), "O código tem 6 dígitos.", true);
      return;
    }
    var btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    api("POST", "/cloud/viewer/login/verify", { email: email, code: code }).then(function (data) {
      session = data.session;
      save(session);
      msg($("loginMsg"), "");
      show(true);
      fetchPage(true);
    }).catch(function (err) {
      msg($("loginMsg"), err.message, true);
    }).then(function () { btn.disabled = false; });
  });

  $("backToEmail").addEventListener("click", function () { logout(""); });
  $("logout").addEventListener("click", function () { logout("Você saiu."); });
  $("refresh").addEventListener("click", function () { fetchPage(true); });
  $("more").addEventListener("click", function () { fetchPage(false); });
  $("camFilter").addEventListener("change", function () { fetchPage(true); });

  session = load();
  if (session) {
    show(true);
    fetchPage(true);
  } else {
    show(false);
  }
})();
