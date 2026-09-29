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

  var IS_EN = (document.documentElement.lang || "").toLowerCase().indexOf("en") === 0;
  if (IS_EN) {
    CAMS = {
      "1": {
        name: "CAM 01 · Gate",
        chip: "● GATE",
        provider: "Watch Agent · CPU",
        colorClass: "cam-crit",
        verdict: "ATTENTION NEEDED",
        stateClass: "agent-state-warn",
        summary: "Person with a hidden face approaching the perimeter.",
        detect: "Hidden face + approach",
        zone: "82%",
        action: "Local · 43 ms · private image"
      },
      "2": {
        name: "CAM 02 · Driveway",
        chip: "● DRIVEWAY",
        provider: "Watch Agent · CPU",
        colorClass: "cam-info",
        verdict: "PLATE IDENTIFIED",
        stateClass: "agent-state-monitoring",
        summary: "OCR finished reading plate ABC-1234 at the entrance.",
        detect: "Vehicle + plate ABC-1234",
        zone: "96%",
        action: "Local · OCR complete"
      },
      "3": {
        name: "CAM 03 · Hallway",
        chip: "● HALLWAY",
        provider: "Watch Agent · CPU",
        colorClass: "cam-ok",
        verdict: "FACE RECOGNIZED",
        stateClass: "agent-state-monitoring",
        summary: "John was recognized in the hallway; registered face, no alert triggered.",
        detect: "Known face · John",
        zone: "92%",
        action: "Local · private face database"
      },
      "4": {
        name: "CAM 04 · Kitchen",
        chip: "● KITCHEN",
        provider: "Watch Agent · CPU",
        colorClass: "cam-warn",
        verdict: "PET IN RESTRICTED ZONE",
        stateClass: "agent-state-warn",
        summary: "Dog detected entering the restricted zone next to the trash can.",
        detect: "Pet (Dog) + Trash zone",
        zone: "92%",
        action: "Local · Pet alert triggered"
      }
    };
  }
  var CAM1_MONITORING = IS_EN
    ? { verdict: "MONITORING", text: "Person detected; analyzing the visual context of the approach.", detect: "Person in field of view", zone: "Calculating…", action: "Local · CPU · private image" }
    : { verdict: "MONITORANDO", text: "Pessoa detectada; analisando o contexto visual da aproximação.", detect: "Pessoa no campo de visão", zone: "Calculando…", action: "Local · CPU · imagem privada" };

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
    if (verdictEl) verdictEl.textContent = CAM1_MONITORING.verdict;
    if (textEl) textEl.textContent = CAM1_MONITORING.text;
    if (dEl) dEl.textContent = CAM1_MONITORING.detect;
    if (zEl) zEl.textContent = CAM1_MONITORING.zone;
    if (aEl) aEl.textContent = CAM1_MONITORING.action;
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
