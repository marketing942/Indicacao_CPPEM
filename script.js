/* =========================================================
   Missão Indicação — formulário de indicação

   Grava na aba INDICAÇÕES da planilha de leads, pelo MESMO Apps Script que
   já recebe as LPs de captura e de venda direta. Lá, cada linha tem duas
   pessoas — quem indicou e quem foi indicado — e uma coluna BU que diz de
   qual unidade veio.

   ---------------------------------------------------------
   PARA REPLICAR ESTA PÁGINA EM OUTRA BU
   ---------------------------------------------------------
   1. Troque o bloco BU logo abaixo (é o único ponto obrigatório aqui).
   2. No index.html: tokens de cor no :root, fontes, logo, títulos e o texto
      dos prêmios.
   3. Nada a fazer no Apps Script: INDICACAO_UNICIVE e INDICACAO_COLEGIO já
      estão configurados lá e caem na mesma aba, mudando só a coluna BU.
   ========================================================= */

/* ---------- BU: o bloco que muda de uma página para a outra ---------- */

const BU = {
  /* Vai no ?aba= e é o que o backend usa para decidir a coluna BU.
     Valores aceitos: INDICACAO_CPPEM | INDICACAO_UNICIVE | INDICACAO_COLEGIO
     Escrever qualquer outra coisa manda a indicação para a aba IGNORADOS. */
  chave: "INDICACAO_CPPEM",

  nome: "CPPEM",

  /* WhatsApp do time, usado no botão da tela de sucesso e no rodapé. */
  whatsapp: "5581973105354",
  whatsappMsg: "Oi! Acabei de indicar alguém pelo programa de indicação do CPPEM.",

  /* O selo animado da faixa "para quem você indicar". O anel fecha a volta
     inteira enquanto o número sobe até `ate` — o gesto é de "carregando",
     não de proporção. */
  selo: { ate: 10, prefixo: "", sufixo: "%" }
};

const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbxdFplWVSfhTjvyIA7HIWb645xRjGNhBVhTdTf5UMjo0lSpW_A_jCuys0qB4uImKXPQ/exec" +
  "?aba=" + BU.chave;

/* =========================================================
   UTMs — first touch

   As UTMs só existem na URL do PRIMEIRO acesso. Se a pessoa recarrega, volta
   pelo histórico ou indica uma segunda pessoa depois de um tempo, o
   ?utm_source= já não está mais lá. Por isso gravamos na chegada e lemos do
   storage no envio. O try/catch cobre navegador com storage bloqueado (aba
   anônima, ITP), onde o comportamento volta a ser o de antes em vez de
   quebrar o formulário.
   ========================================================= */

const UTM_CAMPOS = ["utm_source", "utm_campaign"];

(function guardarUTMs() {
  const qs = new URLSearchParams(window.location.search);

  UTM_CAMPOS.forEach((chave) => {
    const valor = qs.get(chave);
    if (!valor) return;

    try {
      sessionStorage.setItem(chave, valor);
    } catch (e) {
      /* storage indisponível: segue sem persistir */
    }
  });
})();

function utm(chave) {
  const daUrl = new URLSearchParams(window.location.search).get(chave);
  if (daUrl) return daUrl;

  try {
    return sessionStorage.getItem(chave) || "";
  } catch (e) {
    return "";
  }
}

/* ---------- Elementos ---------- */

const form        = document.getElementById("form-indicacao");
const cartao      = document.getElementById("cartao-form");
const sucesso     = document.getElementById("sucesso");
const placarEl    = document.getElementById("sucesso-placar");
const botaoEnviar = document.getElementById("ind_enviar");
const botaoOutra  = document.getElementById("ind_outra");

const campos = {
  nome:              document.getElementById("ind_nome"),
  telefone:          document.getElementById("ind_telefone"),
  nomeIndicado:      document.getElementById("ind_nome_indicado"),
  telefoneIndicado:  document.getElementById("ind_telefone_indicado")
};

/* Campos que voltam a ficar em branco quando a pessoa indica outra pessoa.
   Os dados de quem indica ficam: a graça de indicar várias é não redigitar. */
const CAMPOS_DO_INDICADO = [campos.nomeIndicado, campos.telefoneIndicado];

/* ---------- WhatsApp ---------- */

const linkWhats = "https://wa.me/" + BU.whatsapp + "?text=" + encodeURIComponent(BU.whatsappMsg);

["ind_whats", "rodape-whats"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.href = linkWhats;
});

/* ---------- Erros ---------- */

function marcarErro(input, msg) {
  const alvo = document.querySelector(`[data-erro-de="${input.id}"]`);

  input.classList.add("is-invalid");
  input.setAttribute("aria-invalid", "true");
  if (alvo) alvo.textContent = msg;
}

function limparErro(input) {
  const alvo = document.querySelector(`[data-erro-de="${input.id}"]`);

  input.classList.remove("is-invalid");
  input.removeAttribute("aria-invalid");
  if (alvo) alvo.textContent = "";
}

/* =========================================================
   Telefone
   ========================================================= */

/* Máscara visual. Só reescreve o que a pessoa digitou — a validação e o envio
   trabalham em cima dos dígitos, nunca do texto formatado. */
function mascararTelefone(valor) {
  const d = String(valor).replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);

  if (d.length <= 2)  return d.length ? "(" + d : "";
  if (d.length <= 6)  return "(" + d.slice(0, 2) + ") " + d.slice(2);
  if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);

  return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
}

/* Celular brasileiro: DDD (2) + 9 dígitos, com o 9 na terceira posição.
   O "55" inicial é removido antes de contar — se ficasse, "+55 81 9996-741"
   somaria 11 dígitos e passaria mesmo faltando dois do número real. */
function telefoneValido(valor) {
  const d = String(valor).replace(/\D/g, "").replace(/^55(?=\d{11}$)/, "");

  return d.length === 11 && d[2] === "9" && Number(d.slice(0, 2)) >= 11;
}

[campos.telefone, campos.telefoneIndicado].forEach((input) => {
  input.addEventListener("input", () => {
    input.value = mascararTelefone(input.value);
    limparErro(input);
  });
});

/* =========================================================
   Validação/* =========================================================
   Validação
   ========================================================= */

/* Nome de verdade tem pelo menos duas partes. O time liga para essa pessoa —
   "João" sozinho não identifica ninguém numa lista de indicações. */
function nomeValido(valor) {
  const partes = String(valor).trim().split(/\s+/).filter((p) => p.length >= 2);

  return partes.length >= 2;
}

function validar() {
  let ok = true;

  const regras = [
    [campos.nome,             nomeValido,     "Informe seu nome e sobrenome."],
    [campos.telefone,         telefoneValido, "Informe seu WhatsApp com DDD. Exemplo: (81) 90000-0000."],
    [campos.nomeIndicado,     nomeValido,     "Informe o nome e o sobrenome de quem você está indicando."],
    [campos.telefoneIndicado, telefoneValido, "Informe o WhatsApp da pessoa com DDD. Exemplo: (81) 90000-0000."]
  ];

  regras.forEach(([input, teste, msg]) => {
    limparErro(input);

    if (!teste(input.value)) {
      marcarErro(input, msg);
      ok = false;
    }
  });

  /* Indicar a si mesmo não é indicação. Comparação por dígitos porque um dos
     campos pode estar com máscara e o outro não. */
  if (ok) {
    const meu = campos.telefone.value.replace(/\D/g, "");
    const dele = campos.telefoneIndicado.value.replace(/\D/g, "");

    if (meu === dele) {
      marcarErro(campos.telefoneIndicado, "Este é o seu próprio WhatsApp. Informe o de quem você está indicando.");
      ok = false;
    }
  }

  const primeiroErro = form.querySelector(".is-invalid");
  if (primeiroErro) primeiroErro.focus({ preventScroll: false });

  return ok;
}

/* =========================================================
   Placar local

   Só conta o que foi enviado NESTA sessão, e serve de confirmação visual de
   que a segunda e a terceira indicação também foram registradas. O placar que
   vale é o do time, conferido na planilha — por isso o texto nunca promete
   nível nenhum a partir daqui.
   ========================================================= */

const CHAVE_PLACAR = "cppem_indicacoes_enviadas";

function lerPlacar() {
  try {
    return Number(sessionStorage.getItem(CHAVE_PLACAR)) || 0;
  } catch (e) {
    return 0;
  }
}

function somarPlacar() {
  const total = lerPlacar() + 1;

  try {
    sessionStorage.setItem(CHAVE_PLACAR, String(total));
  } catch (e) {
    /* storage bloqueado: o placar só não aparece */
  }

  return total;
}

function mostrarPlacar(total) {
  if (total < 2) {
    placarEl.hidden = true;
    return;
  }

  placarEl.textContent = total + " indicações enviadas por você";
  placarEl.hidden = false;
}

/* ---------- Tracking ---------- */

function track(evento, dados) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(Object.assign({ event: evento, bu: BU.nome }, dados || {}));
}

/* =========================================================
   Envio
   ========================================================= */

async function enviar() {
  if (!validar()) return;

  botaoEnviar.disabled = true;
  botaoEnviar.textContent = "Enviando...";

  const payload = {
    nome: campos.nome.value.trim(),
    telefone: campos.telefone.value.trim(),
    nome_indicado: campos.nomeIndicado.value.trim(),
    telefone_indicado: campos.telefoneIndicado.value.trim(),
    origem: BU.chave,
    pagina_url: window.location.href,
    utm_source: utm("utm_source"),
    utm_campaign: utm("utm_campaign")
  };

  try {
    /* mode "no-cors": o Apps Script não devolve cabeçalho de CORS, então a
       resposta chega opaca e não dá para ler o corpo. O que ainda dá para
       saber é se a requisição SAIU — o fetch rejeita quando a rede falha. É
       pouco, mas é a diferença entre mostrar sucesso de mentira e avisar que
       deu errado. Por isso este await existe, ao contrário do envio das LPs
       de captura, que dispara e redireciona sem esperar. */
    await fetch(SHEET_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const total = somarPlacar();

    track("indicacao_enviada", { indicacao_numero: total });

    mostrarPlacar(total);
    cartao.dataset.enviado = "true";
    sucesso.dataset.ativo = "true";
    cartao.scrollIntoView({ behavior: "smooth", block: "center" });

  } catch (erro) {
    console.error("[Indicação] Falha ao enviar:", erro);

    marcarErro(campos.telefoneIndicado, "Não conseguimos enviar agora. Confira sua conexão e tente de novo.");
    track("indicacao_erro");

  } finally {
    botaoEnviar.disabled = false;
    botaoEnviar.textContent = "Enviar indicação";
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  enviar();
});

/* ---------- Indicar outra pessoa ---------- */

botaoOutra.addEventListener("click", () => {
  CAMPOS_DO_INDICADO.forEach((input) => {
    input.value = "";
    limparErro(input);
  });

  cartao.dataset.enviado = "false";
  sucesso.dataset.ativo = "false";

  track("indicacao_nova_tentativa", { indicacao_numero: lerPlacar() + 1 });

  campos.nomeIndicado.focus({ preventScroll: true });
  cartao.scrollIntoView({ behavior: "smooth", block: "center" });
});

/* Limpa o erro assim que a pessoa começa a corrigir — o texto vermelho só
   some quando o campo muda, não no próximo submit. */
Object.values(campos).forEach((input) => {
  input.addEventListener("input", () => limparErro(input));
});

/* =========================================================
   ANIMAÇÕES DE ENTRADA

   Tudo aqui é enfeite: se o IntersectionObserver não existir, ou se a pessoa
   pediu menos movimento no sistema, o conteúdo aparece pronto e no lugar. A
   página nunca depende disto para funcionar.
   ========================================================= */

const MENOS_MOVIMENTO =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Dispara `aoEntrar` uma única vez, quando o elemento aparece na tela.
   Sem observer disponível, roda na hora — melhor ver sem animação do que não
   ver. */
function aoAparecer(elemento, aoEntrar, margem) {
  if (!elemento) return;

  if (!("IntersectionObserver" in window)) {
    aoEntrar();
    return;
  }

  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;

      observador.disconnect();
      aoEntrar();
    });
  }, { threshold: 0, rootMargin: margem || "0px 0px -18% 0px" });

  observador.observe(elemento);
}

/* ---------- Níveis: caem e batem no lugar ----------
   O CSS tem a queda inteira; aqui só marcamos o momento de começar. O atraso
   de cada card vem do --atraso no HTML, o que mantém o escalonamento junto da
   cor, num lugar só. */
(function animarNiveis() {
  const cards = Array.from(document.querySelectorAll(".nivel"));
  if (!cards.length) return;

  if (MENOS_MOVIMENTO) {
    cards.forEach((card) => { card.style.opacity = "1"; });
    return;
  }

  /* Quando a queda termina, o card troca de estado: sai de "visivel"
     (animação rodando) para "pousado" (parado, no lugar). A troca existe
     porque uma animação com fill-mode "forwards" congela o transform e
     deixaria o :hover sem efeito pelo resto da página. */
  cards.forEach((card) => {
    card.addEventListener("animationend", (evento) => {
      if (evento.animationName !== "nivel-cair") return;

      // pousado ANTES de tirar visivel: invertido, o card pisca em opacity 0
      card.dataset.pousado = "true";
      delete card.dataset.visivel;
    });
  });

  /* Observa o primeiro card e solta os três juntos: observar um a um faria a
     sequência recomeçar no meio da rolagem, e o escalonamento sumiria. */
  aoAparecer(cards[0], () => {
    cards.forEach((card) => { card.dataset.visivel = "true"; });
  }, "0px 0px -22% 0px");
})();

/* ---------- Selo do indicado: o anel carrega enquanto o valor sobe ----------
   O anel fecha a volta inteira enquanto o número vai de 1 até BU.selo.ate.
   O gesto é de "carregando", não de "N% de uma barra" — por isso o anel
   chega a 100% mesmo quando o número para em outro lugar. */
(function animarSelo() {
  const selo = document.getElementById("selo-desconto");
  const valor = document.getElementById("selo-valor");
  if (!selo || !valor) return;

  const { ate, prefixo, sufixo } = BU.selo;
  const DURACAO = 1400;

  const pintar = (proporcao) => {
    const numero = Math.max(1, Math.round(proporcao * ate));

    selo.style.setProperty("--p", String(proporcao * 100));
    valor.textContent = prefixo + numero + sufixo;
  };

  if (MENOS_MOVIMENTO) {
    pintar(1);
    return;
  }

  aoAparecer(selo, () => {
    const inicio = performance.now();

    const quadro = (agora) => {
      const t = Math.min((agora - inicio) / DURACAO, 1);

      // desacelera no fim, para o número "assentar" no 10 em vez de estancar
      pintar(1 - Math.pow(1 - t, 3));

      if (t < 1) requestAnimationFrame(quadro);
    };

    requestAnimationFrame(quadro);
  });
})();
