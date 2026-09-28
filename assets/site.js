/* Local Vision — página de venda standalone: progressive enhancement only.
   Sem coleta de dados, sem fetch, sem injecao de HTML. */
(function () {
  "use strict";

  function setYear() {
    var el = document.getElementById("year");
    if (!el) return;
    var y = String(new Date().getFullYear());
    // textContent apenas: sem HTML injetado.
    el.textContent = "© " + y + " Local Vision — processamento principal no seu computador.";
  }

  function menu() {
    var btn = document.getElementById("menuBtn");
    var nav = document.getElementById("nav");
    if (!btn || !nav) return;
    btn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (ev) {
      var t = ev.target;
      if (t && t.tagName === "A") {
        nav.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  function activeNav() {
    var links = document.querySelectorAll("#nav a[href^='#']");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var map = {};
    links.forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      var sec = document.getElementById(id);
      if (sec) map[id] = a;
    });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var a = map[e.target.id];
        if (a && e.isIntersecting) {
          links.forEach(function (l) { l.classList.remove("active"); });
          a.classList.add("active");
        }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    Object.keys(map).forEach(function (id) {
      obs.observe(document.getElementById(id));
    });
  }

  function trialForm() {
    var form = document.getElementById("trialForm");
    if (!form) return;
    // Em desenvolvimento (arquivo local ou relay Python em 127.0.0.1), envia ao
    // relay local; publicado, mantém o action do HTML (relay no Supabase).
    var host = window.location.hostname;
    if (window.location.protocol === "file:" || host === "127.0.0.1" || host === "localhost") {
      form.action = "http://127.0.0.1:9000/trial-interest";
    }
  }

  /* Demonstração interativa do Agente Vigilante */
  var CAMS = {
    "1": {
      name: "CAM 01 · Portão",
      chip: "● PORTÃO",
      provider: "Agente Vigilante · CPU",
      colorClass: "cam-crit",
      verdict: "ATENÇÃO NECESSÁRIA",
      stateClass: "agent-state-warn",
      summary: "Pessoa com o rosto oculto aproximando-se do perímetro.",
      detect: "Rosto oculto + aproximação",
      zone: "82%",
      action: "Local · 43 ms · imagem privada"
    },
    "2": {
      name: "CAM 02 · Acesso",
      chip: "● ACESSO",
      provider: "Agente Vigilante · CPU",
      colorClass: "cam-info",
      verdict: "PLACA IDENTIFICADA",
      stateClass: "agent-state-monitoring",
      summary: "OCR concluiu a leitura da placa ABC-1234 na entrada.",
      detect: "Veículo + placa ABC-1234",
      zone: "96%",
      action: "Local · OCR concluído"
    },
    "3": {
      name: "CAM 03 · Corredor",
      chip: "● CORREDOR",
      provider: "Agente Vigilante · CPU",
      colorClass: "cam-ok",
      verdict: "ROSTO RECONHECIDO",
      stateClass: "agent-state-monitoring",
      summary: "João foi reconhecido no corredor; rosto cadastrado sem disparo de alerta.",
      detect: "Rosto conhecido · João",
      zone: "92%",
      action: "Local · base facial privada"
    },
    "4": {
      name: "CAM 04 · Cozinha",
      chip: "● COZINHA",
      provider: "Agente Vigilante · CPU",
      colorClass: "cam-warn",
      verdict: "PET EM ZONA RESTRITA",
      stateClass: "agent-state-warn",
      summary: "Cachorro detectado invadindo a zona restrita próxima à lixeira.",
      detect: "Pet (Cachorro) + Zona da lixeira",
      zone: "92%",
      action: "Local · Alerta de pet disparado"
    }
  };

  function selectCam(camId, skipVideoSync) {
    var data = CAMS[String(camId)];
    if (!data) return;

    var camEls = document.querySelectorAll(".mock-cam");
    camEls.forEach(function (cam) {
      cam.classList.remove("active-cam", "cam-crit", "cam-warn", "cam-ok", "cam-info");
      if (cam.getAttribute("data-cam-id") === String(camId)) {
        cam.classList.add("active-cam", data.colorClass);
      }
    });

    var tabs = document.querySelectorAll(".agent-cam-tab");
    tabs.forEach(function (tab) {
      if (tab.getAttribute("data-cam") === String(camId)) {
        tab.classList.add("active");
      } else {
        tab.classList.remove("active");
      }
    });

    var stageChipActive = document.querySelector(".stage-chip-active");
    if (stageChipActive) {
      stageChipActive.textContent = data.chip;
    }

    var provTag = document.getElementById("agentProviderTag");
    if (provTag) provTag.textContent = data.provider;

    var panelEl = document.getElementById("agentPanel");
    var stateEl = document.getElementById("agentState");
    var verdictEl = document.getElementById("agentVerdict");
    if (panelEl) panelEl.classList.toggle("is-analyzing", data.stateClass !== "agent-state-monitoring");
    if (stateEl) {
      stateEl.classList.remove("agent-state-monitoring", "agent-state-warn", "agent-state-critical");
      stateEl.classList.add(data.stateClass);
    }
    if (verdictEl) verdictEl.textContent = data.verdict;

    var dEl = document.getElementById("agentMetaDetect");
    var zEl = document.getElementById("agentMetaZone");
    var aEl = document.getElementById("agentMetaAction");
    if (dEl) dEl.textContent = data.detect;
    if (zEl) zEl.textContent = data.zone;
    if (aEl) aEl.textContent = data.action;

    var textEl = document.getElementById("agentText");
    if (textEl) textEl.textContent = data.summary;

    if (String(camId) === "1" && !skipVideoSync) {
      cam1Phase = "";
      var cam1Video = document.querySelector('.mock-cam[data-cam-id="1"] video');
      syncCam1WithVideo(cam1Video);
    }
  }

  var autoInterval = null;
  var currentCam = 1;
  var cam1Phase = "risk";

  function showCam1Monitoring() {
    var panelEl = document.getElementById("agentPanel");
    var stateEl = document.getElementById("agentState");
    var verdictEl = document.getElementById("agentVerdict");
    var textEl = document.getElementById("agentText");
    var dEl = document.getElementById("agentMetaDetect");
    var zEl = document.getElementById("agentMetaZone");
    var aEl = document.getElementById("agentMetaAction");

    if (panelEl) panelEl.classList.remove("is-analyzing");
    if (stateEl) {
      stateEl.classList.remove("agent-state-warn", "agent-state-critical");
      stateEl.classList.add("agent-state-monitoring");
    }
    if (verdictEl) verdictEl.textContent = "MONITORANDO";
    if (textEl) textEl.textContent = "Pessoa detectada; analisando o contexto visual da aproximação.";
    if (dEl) dEl.textContent = "Pessoa no campo de visão";
    if (zEl) zEl.textContent = "Calculando…";
    if (aEl) aEl.textContent = "Local · CPU · imagem privada";
  }

  function syncCam1WithVideo(video) {
    if (currentCam !== 1 || !video) return;
    var nextPhase = video.currentTime < 0.72 ? "monitoring" : "risk";
    if (nextPhase === cam1Phase) return;
    cam1Phase = nextPhase;
    if (nextPhase === "monitoring") {
      showCam1Monitoring();
    } else {
      selectCam(1, true);
    }
  }

  function startAutoplay() {
    if (autoInterval) clearInterval(autoInterval);
    autoInterval = setInterval(function () {
      currentCam = (currentCam % 4) + 1;
      selectCam(currentCam);
    }, 7000);
  }

  function pauseAutoplayBriefly() {
    if (autoInterval) clearInterval(autoInterval);
    setTimeout(startAutoplay, 25000);
  }

  function initInteractiveDemo() {
    var camEls = document.querySelectorAll(".mock-cam");
    camEls.forEach(function (cam) {
      cam.addEventListener("click", function () {
        var id = parseInt(cam.getAttribute("data-cam-id"), 10);
        if (id) {
          currentCam = id;
          selectCam(id);
          pauseAutoplayBriefly();
        }
      });
    });

    var tabs = document.querySelectorAll(".agent-cam-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var id = parseInt(tab.getAttribute("data-cam"), 10);
        if (id) {
          currentCam = id;
          selectCam(id);
          pauseAutoplayBriefly();
        }
      });
    });

    var cam1Video = document.querySelector('.mock-cam[data-cam-id="1"] video');
    if (cam1Video) {
      cam1Video.addEventListener("timeupdate", function () { syncCam1WithVideo(cam1Video); });
      cam1Video.addEventListener("seeked", function () { syncCam1WithVideo(cam1Video); });
    }

    selectCam(1);
    startAutoplay();
  }

  document.addEventListener("DOMContentLoaded", function () {
    setYear();
    menu();
    activeNav();
    trialForm();
    initInteractiveDemo();
  });
})();
