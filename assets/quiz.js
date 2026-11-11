/* Quiz de encaminhamento da landing (27/10/2026): quem já tem câmeras e um PC
   ligado começa sozinho pelo trial; os demais vão ao consultor no WhatsApp
   com as respostas já escritas. Nada sai do navegador até o clique no
   resultado. CSP do site só permite script de 'self'. */
(function () {
  "use strict";
  var WA = "https://wa.me/5571999391315?text=";
  var form = document.getElementById("quiz");
  var section = document.getElementById("monte");
  var out = document.getElementById("quizResult");
  if (!form || !section || !out) return;
  section.hidden = false; // sem JS, o quiz fica escondido

  var LABELS = {
    para: { casa: "minha casa", negocio: "meu negócio", instalador: "sou instalador" },
    cameras: { todas: "já tenho todas", algumas: "tenho algumas", nenhuma: "ainda não tenho" },
    central: { pc: "tenho um PC Windows ligado", pronta: "quero uma central pronta", naosei: "não sei" },
    qtd: { "1-2": "1–2", "3-4": "3–4", "5-8": "5–8", "9+": "mais de 8" },
    backup: { sim: "sim", nao: "não", talvez: "quero saber mais" },
  };
  var ORDER = ["para", "cameras", "central", "qtd", "backup"];
  var COUNT = { "1-2": 2, "3-4": 4, "5-8": 8 };

  function answers() {
    var a = {};
    ORDER.forEach(function (k) {
      var el = form.querySelector('input[name="' + k + '"]:checked');
      if (el) a[k] = el.value;
    });
    return a;
  }

  function waLink(a, intro) {
    var lines = [intro];
    var names = { para: "Para", cameras: "Câmeras", central: "Central", qtd: "Quantidade", backup: "Backup anti-roubo" };
    ORDER.forEach(function (k) {
      if (a[k]) lines.push("• " + names[k] + ": " + LABELS[k][a[k]]);
    });
    lines.push("Quero um orçamento.");
    return WA + encodeURIComponent(lines.join("\n"));
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function cta(text, href, primary, external) {
    var link = el("a", "btn " + (primary ? "btn-primary" : "btn-ghost"), text);
    link.href = href;
    if (external) { link.target = "_blank"; link.rel = "noopener"; }
    return link;
  }

  function prefillTrial(a) {
    var trial = document.getElementById("trialForm");
    if (!trial) return;
    var profile = trial.elements.profile;
    if (profile) profile.value = a.para === "instalador" ? "installer" : "home";
    var count = trial.elements.camera_count;
    if (count && COUNT[a.qtd]) count.value = COUNT[a.qtd];
  }

  function render() {
    var a = answers();
    out.textContent = "";
    var box;
    if (a.para === "instalador") {
      box = el("div", "quiz-card");
      box.appendChild(el("h3", "", "Condições para instaladores"));
      box.appendChild(el("p", "", "Licença por instalação, painel de administração sob seu controle e acesso só de leitura para o cliente. Fale com a gente para combinar as condições."));
      var row = el("div", "quiz-actions");
      row.appendChild(cta("Falar no WhatsApp", waLink(a, "Olá! Sou instalador e fiz o quiz do Local Vision:"), true, true));
      row.appendChild(cta("Cadastrar como instalador", "#cadastro", false, false));
      row.lastChild.addEventListener("click", function () { prefillTrial(a); });
      box.appendChild(row);
      out.appendChild(box);
      return;
    }
    var missing = ORDER.filter(function (k) { return !a[k]; }).length;
    if (missing) {
      out.appendChild(el("p", "quiz-hint", missing === 1
        ? "Falta 1 resposta para ver a recomendação."
        : "Faltam " + missing + " respostas para ver a recomendação."));
      return;
    }

    box = el("div", "quiz-card");
    var selfServe = a.cameras === "todas" && a.central === "pc" && a.qtd !== "9+";
    if (selfServe) {
      box.appendChild(el("h3", "", "Você já pode começar sozinho"));
      var total = a.backup === "sim"
        ? "R$ 39,90/mês do Local Vision + R$ 34,90/mês do backup anti-roubo de 30 dias (R$ 74,80/mês). No plano anual, o Local Vision sai por R$ 29,92/mês."
        : "R$ 39,90/mês, ou R$ 29,92/mês no plano anual. Os primeiros 14 dias são grátis e sem cartão.";
      box.appendChild(el("p", "", total));
      if (a.backup === "talvez") {
        box.appendChild(el("p", "quiz-note", "O backup anti-roubo guarda foto e clipe de cada alerta fora de casa por 7, 30 ou 90 dias, a partir de R$ 19,90/mês."));
      }
      var r1 = el("div", "quiz-actions");
      var go = cta("Testar grátis por 14 dias", "#cadastro", true, false);
      go.addEventListener("click", function () { prefillTrial(a); });
      r1.appendChild(go);
      r1.appendChild(cta("Prefiro falar com um consultor", waLink(a, "Olá! Fiz o quiz do Local Vision:"), false, true));
      box.appendChild(r1);
    } else {
      var title = a.qtd === "9+" ? "Projeto sob medida"
        : (a.central !== "pc") ? "Montamos uma central pronta para você"
        : (a.para === "negocio" ? "Vamos montar o kit certo para o seu negócio" : "Vamos montar o kit certo para a sua casa");
      box.appendChild(el("h3", "", title));
      box.appendChild(el("p", "", a.central !== "pc"
        ? "Um mini PC já configurado, à vista ou em comodato, ou o Pacote Completo com instalação, câmeras e backup. O consultor monta o orçamento com as suas respostas."
        : "O consultor indica as câmeras que faltam e monta o orçamento com as suas respostas."));
      var r2 = el("div", "quiz-actions");
      r2.appendChild(cta("Falar com consultor no WhatsApp", waLink(a, "Olá! Fiz o quiz do Local Vision:"), true, true));
      box.appendChild(r2);
    }
    out.appendChild(box);
  }

  form.addEventListener("change", render);
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  render();
})();
