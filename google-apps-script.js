/* =========================================================
   CPPEM — Backend único de captura (Google Apps Script)

   Uma implantação recebe os leads de todos os sites e roteia por origem:

     aba CPPEM        captura-cppem, pmpe, captura-manychat-pmpe,
                      mentoria-individual, presencial-em-casa,
                      supletivo-filiado-cppem
     aba UNICIVE_Novo captura-unicive
     aba COLEGIO_Novo captura-colegio
     aba Venda_Direta operacao-alvorada, apostila, site-cppem /qg e o
                      modal de WhatsApp — venda direta, fora do funil
     aba INDICAÇÕES   indica.cppem.com.br, indica.colegio.cppem.com.br e
                      indica.unicive.cppem.com.br — o programa de indicação.
                      Layout próprio: quem indica e quem foi indicado na MESMA
                      linha, e coluna BU no lugar da Origem
     aba IGNORADOS    só o que o script não reconheceu. Deve viver VAZIA:
                      linha aqui é sinal de configuração quebrada

   Quem manda para onde é o ORIGENS + ABA_POR_ORIGEM, logo abaixo.

   A escrita é feita POR NOME DE COLUNA, lendo o cabeçalho da aba — nunca por
   posição fixa. É o que permite conviver com a coluna VENDEDOR, preenchida à
   mão: o script só escreve nas colunas que conhece, e qualquer coluna que ele
   não conheça fica intocada. Mudar a ordem das colunas na planilha também não
   quebra nada.

   Como publicar:
   1) Planilha → Extensões → Apps Script → cole ESTE arquivo inteiro
      (substituindo o Codigo.gs antigo) e salve.
   2) Implantar → Gerenciar implantações → editar a implantação atual
      → Versão: Nova versão → Implantar. A URL /exec não muda.
   3) Rodar `conferirPlanilha` — NÃO altera nada, só mostra no log em qual
      coluna cada campo vai cair. Confira antes de seguir.
   4) Rodar `prepararAba` — formata as colunas de texto (mata o #ERROR! do
      telefone) e congela o cabeçalho. Não mexe em valor nenhum.
   5) Opcional: `migrarAbasParaCPPEM` traz o histórico das outras abas.
   ========================================================= */

/* ---------- CONFIGURAÇÃO ---------- */

const ABA_DESTINO = "CPPEM";

/* Aba do programa de indicação. É a única com layout próprio: em vez de um
   lead por linha, cada linha tem DUAS pessoas — quem indicou e quem foi
   indicado — mais a chave PIX de quem recebe o prêmio.

   O nome vai acentuado porque é assim que a aba se chama na planilha. Ainda
   assim, a busca compara os nomes sem acento (ver `abaPorNomeAproximado`):
   um
   "INDICACOES" digitado à mão continua sendo encontrado, em vez de virar uma
   aba duplicada que ninguém olha. */
const ABA_INDICACOES = "INDICAÇÕES";

/* Qual valor vai na coluna BU. Os três são fixos e definidos pelo time — é por
   eles que os relatórios filtram, então não podem variar de escrita. */
const BU_POR_ORIGEM = {
  INDICACAO_CPPEM:   "CPPEM",
  INDICACAO_UNICIVE: "UNICIVE",
  INDICACAO_COLEGIO: "COLEGIO"
};

/* Origens que NÃO vão para a aba padrão. Quem não estiver aqui cai na
   ABA_DESTINO. A aba é criada no primeiro lead, já no padrão de colunas
   daqui — as abas "UNICIVE" e "COLEGIO" antigas têm outro layout e ficam
   intocadas, por isso o sufixo _Novo. */
const ABA_POR_ORIGEM = {
  UNICIVE:   "UNICIVE_Novo",
  COLEGIO:   "COLEGIO_Novo",

  // Programa de indicação: as três BUs dividem UMA aba, separadas pela coluna BU.
  INDICACAO_CPPEM:   ABA_INDICACOES,
  INDICACAO_UNICIVE: ABA_INDICACOES,
  INDICACAO_COLEGIO: ABA_INDICACOES,

  // Venda direta: leads que ficam fora do funil principal de propósito.
  QG:        "Venda_Direta",   // site-cppem  /qg
  WHATSAPP:  "Venda_Direta",   // site-cppem  modal de WhatsApp
  OPERACAO:  "Venda_Direta",   // operacao-alvorada
  APOSTILA:  "Venda_Direta"    // apostila
};

/* Rede de segurança, e SÓ isso: aqui cai o que o script NÃO reconheceu.

   Antes esta aba acumulava dois casos opostos — a venda direta, que é uma
   DECISÃO, e o ?aba= errado, que é um ACIDENTE. Misturados, o acidente ficava
   invisível: a aba sempre tinha conteúdo legítimo, então ninguém percebia que
   havia site quebrado ali dentro. Foi exatamente assim que os leads do
   Presencial em casa e do Supletivo ficaram caindo aqui sem ninguém notar.

   Separadas, a regra fica legível: esta aba deve viver VAZIA. Linha aqui é
   sinal de configuração quebrada, não de lead a trabalhar. */
const ABA_DESCONHECIDOS = "IGNORADOS";

const FUSO = "America/Recife";

/* Quais abas o `migrarAbasParaCPPEM` deve trazer. Lista VAZIA = todas.

   Migrar uma de cada vez é mais seguro: você confere o resultado antes de ir
   para a próxima. Edite esta linha, salve, e rode a função. */
const ABAS_PARA_MIGRAR = ["MarkTeste"];

/* Campos que o script sabe preencher. `titulos` são os nomes de cabeçalho
   aceitos (minúsculos, sem depender de acento na comparação). O primeiro é o
   usado ao criar uma aba do zero. */
const CAMPOS = [
  { chave: "data",         titulo: "Data e Hora",  largura: 160, titulos: ["data e hora", "data"],                                  formato: "dd/MM/yyyy HH:mm:ss" },
  { chave: "origem",       titulo: "Origem",       largura: 120, titulos: ["origem"],                                               formato: "@" },
  { chave: "nome",         titulo: "Nome",         largura: 220, titulos: ["nome"],                                                 formato: "@" },
  { chave: "email",        titulo: "Email",        largura: 250, titulos: ["email", "e-mail"],                                      formato: "@" },
  { chave: "telefone",     titulo: "Telefone",     largura: 180, titulos: ["telefone", "whatsapp", "celular"],                      formato: "@" },
  { chave: "url",          titulo: "Pagina URL",   largura: 320, titulos: ["pagina url", "página url", "pagina", "página", "url"],  formato: "@" },
  { chave: "utm_source",   titulo: "UTM Source",   largura: 150, titulos: ["utm source", "utm_source"],                             formato: "@" },
  { chave: "utm_campaign", titulo: "UTM Campaign", largura: 220, titulos: ["utm campaign", "utm_campaign"],                         formato: "@" },

  /* Campos exclusivos do formulário do Colégio (4 passos). As outras abas não
     têm estas colunas no cabeçalho, e `mapaColunas` simplesmente não escreve o
     que não encontra — por isso viverem no CAMPOS global não afeta ninguém.
     Para criá-las na aba que já existe, rode `adicionarColunasDoColegio`. */
  { chave: "faixa_salarial",    titulo: "Faixa salarial",                               largura: 220, titulos: ["faixa salarial"],                                             formato: "@" },
  { chave: "qtd_filhos",        titulo: "QTD. Filhos",                                  largura: 110, titulos: ["qtd. filhos", "qtd filhos", "quantidade de filhos"],          formato: "@" },
  { chave: "serie",             titulo: "Série que vão fazer",                          largura: 200, titulos: ["serie que vao fazer", "serie"],                               formato: "@" },
  { chave: "dificuldades",      titulo: "Dificuldades encontradas nos outros colégios", largura: 380, titulos: ["dificuldades encontradas nos outros colegios", "dificuldades"], formato: "@" },
  { chave: "expectativas",      titulo: "o que espera",                                 largura: 380, titulos: ["o que espera", "expectativas"],                               formato: "@" },
  { chave: "dificuldade_filho", titulo: "se o filho tem dificuldades",                  largura: 180, titulos: ["se o filho tem dificuldades", "dificuldade especifica"],      formato: "@" },

  /* Exclusivos da aba INDICAÇÕES, pela mesma lógica dos campos do Colégio
     acima: as outras abas não têm estes títulos no cabeçalho, `mapaColunas`
     não os encontra e eles nunca chegam a ser escritos.

     O `grupo` existe por causa do `adicionarColunasDoColegio`, que percorre
     CAMPOS inteiro criando o que falta: sem a marca, rodá-lo criaria BU e as
     colunas de indicado dentro da COLEGIO_Novo. */
  { chave: "bu",                titulo: "BU",                  largura: 110, grupo: "indicacao", titulos: ["bu", "unidade"],                                                  formato: "@" },
  { chave: "chave_pix",         titulo: "Chave pix indicador", largura: 230, grupo: "indicacao", titulos: ["chave pix indicador", "chave pix", "pix"],                        formato: "@" },
  { chave: "nome_indicado",     titulo: "Nome Indicado",       largura: 220, grupo: "indicacao", titulos: ["nome indicado", "nome do indicado"],                              formato: "@" },
  { chave: "telefone_indicado", titulo: "Telefone Indicado",   largura: 180, grupo: "indicacao", titulos: ["telefone indicado", "telefone do indicado", "whatsapp indicado"], formato: "@" }
];

/* Exceção de formato, por TÍTULO de coluna.

   A aba INDICAÇÕES chama a primeira coluna de "Data", não "Data e Hora", e as
   linhas que já existem lá mostram só a data. Gravar dd/MM/yyyy HH:mm:ss
   deixaria cada linha nova com uma cara diferente das antigas. O valor gravado
   continua sendo o timestamp completo — muda só a exibição. */
const FORMATO_POR_TITULO = {
  "data": "dd/MM/yyyy"
};

/* Colunas criadas junto com uma aba nova mas que o script NUNCA escreve — são
   do time. Ficam depois das colunas de dados. */
const COLUNAS_MANUAIS = ["VENDEDOR"];

/* Quem pode gravar. Chave = o que chega em ?aba= (ou ?origem=); valor = o
   rótulo da coluna Origem, que também é o que decide a aba (ver
   ABA_POR_ORIGEM).

   Os cinco projetos que compartilham a aba CPPEM usam o mesmo rótulo de
   propósito: assim nenhum site precisa trocar o ?aba= dele. O que diferencia
   um do outro na planilha é a Página URL.

   Quem NÃO está aqui vai para a aba IGNORADOS, que é rede de segurança e não
   destino — ver ABA_DESCONHECIDOS. */
const ORIGENS = {
  // → aba CPPEM
  CPPEM:               "CPPEM",   // captura-cppem  (contato.cppem.com.br)
  CAPTURA:             "CPPEM",   // apelido histórico do captura-cppem
  CAPTURA_COMUNIDADE:  "CPPEM",   // exit popup do captura-cppem
  PMPE:                "CPPEM",   // pmpe           (pmpe.cppem.com.br)
  LIVE_PMPE:           "CPPEM",   // livepmpe       (livepmpe.cppem.com.br) — Operação Praça PMPE
  PMPE_COMUNIDADE:     "CPPEM",   // exit popup do pmpe
  MANYCHAT:            "CPPEM",   // captura-manychat-pmpe
  MANYCHAT_ANTIGO:     "CPPEM",   // aba antiga do manychat
  INDIVIDUAL:          "CPPEM",   // mentoria-individual     (individual.cppem.com.br)
  CASA:                "CPPEM",   // presencial-em-casa      (presencialemcasa.cppem.com.br)
  SUPLETIVO:           "CPPEM",   // supletivo-filiado-cppem
  TURMAS:              "CPPEM",   // site-cppem              (cppem.com.br/turmas)

  // → aba UNICIVE_Novo
  UNICIVE:             "UNICIVE", // captura-unicive (contato.unicive.cppem.com.br)
  UNICIVE_COMUNIDADE:  "UNICIVE", // exit popup do captura-unicive

  // → aba COLEGIO_Novo
  COLEGIO:             "COLEGIO", // captura-colegio

  // → aba INDICAÇÕES
  INDICACAO_CPPEM:     "INDICACAO_CPPEM",   // indica.cppem.com.br
  INDICACAO_UNICIVE:   "INDICACAO_UNICIVE", // indica.unicive.cppem.com.br
  INDICACAO_COLEGIO:   "INDICACAO_COLEGIO", // indica.colegio.cppem.com.br

  // → aba Venda_Direta
  QG:                  "QG",        // site-cppem /qg
  WHATSAPP:            "WHATSAPP",  // site-cppem, modal de WhatsApp
  OPERACAO:            "OPERACAO",  // operacao-alvorada
  OPERACAO_COMUNIDADE: "OPERACAO",  // exit popup da alvorada
  APOSTILA:            "APOSTILA",  // apostila
  APOSTILA_PMPE:       "APOSTILA",
  APOSTILA_COMUNIDADE: "APOSTILA"
};

/* Dedução pela URL, para quando o ?aba= vier errado ou faltar.

   Ancorado no host EXATO de propósito: o padrão antigo era /cppem/i, que casa
   com qualquer subdomínio — foi ele que fez os leads de apostila.cppem.com.br
   e operacaoalvorada.cppem.com.br entrarem rotulados como CPPEM.

   As duas primeiras olham o CAMINHO, não só o host: /qg e /turmas dividem o
   mesmo cppem.com.br e vão para abas diferentes, então o host sozinho não
   resolve. Por isso vêm antes — a primeira regra que casar decide, e
   `cppem.com.br` casaria com as duas. */
const DOMINIOS = [
  /* Indicação vem antes de tudo: os três domínios terminam em cppem.com.br e
     casariam com as regras de baixo. Na prática o ?aba= já decide sozinho
     (ORIGENS_CONFIAVEIS), mas a dedução precisa estar certa de qualquer forma
     — é ela que socorre um link compartilhado sem o parâmetro.

     A da UniCive é a que mais importa. Sem ela, "unicive" no endereço é
     encontrado pela regra de CAMPANHAS e a indicação cai na aba UNICIVE_Novo,
     contada como lead de captura. As outras duas, sem regra, cairiam em
     IGNORADOS: errado também, mas pelo menos visível.

     `indic(a|que)` cobre os dois prefixos: os domínios no ar são indica.*, e
     os links curtos publicados (links.cppem.com.br/cppem-indique) usam
     "indique". Se um dia virar alias de verdade, já está previsto.

     As duas mais específicas vêm primeiro, porque indica.colegio e
     indica.unicive também terminam em cppem.com.br. */
  { teste: /\/\/indic(a|que)[a-z0-9-]*\.unicive\.cppem\.com\.br/i, chave: "INDICACAO_UNICIVE" },
  { teste: /\/\/indic(a|que)[a-z0-9-]*\.colegio\.cppem\.com\.br/i, chave: "INDICACAO_COLEGIO" },
  { teste: /\/\/indic(a|que)[a-z0-9-]*\.cppem\.com\.br/i,          chave: "INDICACAO_CPPEM" },

  /* Os endereços da Vercel continuam funcionando e podem ter sido
     compartilhados antes do domínio próprio entrar. */
  { teste: /\/\/indicacao-unicive[a-z0-9-]*\.vercel\.app/i,        chave: "INDICACAO_UNICIVE" },
  { teste: /\/\/indicacao-colegio[a-z0-9-]*\.vercel\.app/i,        chave: "INDICACAO_COLEGIO" },
  { teste: /\/\/indicacao-cppem[a-z0-9-]*\.vercel\.app/i,          chave: "INDICACAO_CPPEM" },

  { teste: /\/\/(www\.)?cppem\.com\.br\/qg/i,           chave: "QG" },
  { teste: /\/\/(www\.)?cppem\.com\.br\/turmas/i,       chave: "TURMAS" },

  { teste: /\/\/contato\.unicive\.cppem\.com\.br/i,     chave: "UNICIVE" },
  { teste: /\/\/pmpe\.cppem\.com\.br/i,                 chave: "PMPE" },
  { teste: /\/\/livepmpe\.cppem\.com\.br/i,             chave: "LIVE_PMPE" },
  { teste: /\/\/colegio[a-z0-9.-]*\.cppem\.com\.br/i,   chave: "COLEGIO" },
  { teste: /\/\/contato\.cppem\.com\.br/i,              chave: "CPPEM" },
  { teste: /\/\/individual\.cppem\.com\.br/i,           chave: "INDIVIDUAL" },
  { teste: /\/\/presencialemcasa\.cppem\.com\.br/i,     chave: "CASA" },

  /* O supletivo ainda aparece pelo domínio da Vercel em alguns links (é para
     lá que o captura-unicive manda quem não tem Ensino Médio), então os dois
     endereços contam. */
  { teste: /\/\/supletivo[a-z0-9.-]*\.cppem\.com\.br/i, chave: "SUPLETIVO" },
  { teste: /\/\/cppem-supletivo-filiado\.vercel\.app/i, chave: "SUPLETIVO" },

  // Venda direta:
  { teste: /\/\/apostila\.cppem\.com\.br/i,             chave: "APOSTILA" },
  { teste: /\/\/operacaoalvorada\.cppem\.com\.br/i,     chave: "OPERACAO" }
];

/* A campanha também identifica a origem, e às vezes é o único sinal: o mesmo
   anúncio pode apontar para uma landing genérica. "bau_unicive" em qualquer
   variação cai aqui. Comparado contra a UTM Campaign e contra a URL inteira,
   porque a campanha costuma aparecer nas duas. */
const CAMPANHAS = [
  { teste: /unicive/i, chave: "UNICIVE" }
];

/* Origens em que o ?aba= é MAIS confiável que a URL, e por isso decide sozinho.

   Vale para o site-cppem: lá o parâmetro é montado no servidor a partir do
   campo `source` do formulário, então não tem como vir errado por
   copiar/colar — que é justamente o risco que fez a URL ter precedência para
   todo o resto.

   E aqui a URL seria ativamente ERRADA: /qg, /turmas e o modal de WhatsApp
   dividem o mesmo cppem.com.br, e o modal abre em qualquer página. Um lead do
   modal aberto em /turmas seria lido como lead de /turmas se a URL mandasse. */
/* As três páginas de indicação entram aqui pelo mesmo motivo do /qg: a URL
   seria ambígua. São irmãs, com o mesmo código e o mesmo formulário, e podem
   acabar publicadas em qualquer subdomínio de cppem.com.br — inclusive um que
   já casa com outra regra de DOMINIOS. O ?aba= é montado dentro do script de
   cada página e diz a BU sem ambiguidade. */
const ORIGENS_CONFIAVEIS = [
  "QG", "TURMAS", "WHATSAPP",
  "INDICACAO_CPPEM", "INDICACAO_UNICIVE", "INDICACAO_COLEGIO"
];

/* ---------- ENTRADA ---------- */

function doPost(e) {
  /* O editor do Apps Script deixa `doPost` pré-selecionado no menu de execução,
     por ser a primeira função do arquivo. Clicar em "Executar" sem trocar roda
     ISTO, sem requisição nenhuma — e antes disso gravava uma linha vazia numa
     aba, parecendo que "nada aconteceu". */
  if (!e || !e.postData) {
    Logger.log(
      "doPost só roda por requisição do site. Para tarefas manuais, escolha no " +
      "menu: conferirPlanilha, prepararAba ou migrarAbasParaCPPEM."
    );
    return json({ status: "erro", mensagem: "sem requisição" });
  }

  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    lock.waitLock(30000);
    locked = true;

    const dados = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const params = (e && e.parameter) || {};
    const lead = montarLead(dados, params);
    const planilha = obterAba(lead.aba);

    escreverLead(planilha, lead.valores);

    return json({
      status: lead.permitida ? "ok" : "ignorado",
      aba: planilha.getName(),
      origem: lead.valores.origem
    });

  } catch (err) {
    return json({ status: "erro", mensagem: err.message });

  } finally {
    if (locked) lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput(
    "CPPEM Sheets — funcionando (abas: " + abasDeDestino().join(", ") + ")."
  );
}

/* ---------- MONTAGEM DO LEAD ---------- */

/* Aceita os nomes de campo de TODOS os fronts. O captura-unicive manda
   name/phone; os outros mandam nome/telefone, e alguns mandam `pagina` em vez
   de `pagina_url`. O backend entende os dois dialetos para não depender de os
   sites serem atualizados no mesmo dia. */
function montarLead(dados, params) {
  const chave = normalizarChave(
    params.aba || params.origem || dados.aba || dados.origem || ""
  );

  const url = pegar(dados, ["pagina_url", "pagina", "page_url", "url"]);
  const campanha = pegar(dados, ["utm_campaign", "utmCampaign"]);
  const chaveFinal = resolverOrigem(chave, url, campanha);
  const origem = ORIGENS[chaveFinal] || "";

  return {
    permitida: origem !== "",
    aba: origem ? abaDaOrigem(origem) : ABA_DESCONHECIDOS,
    valores: {
      data: new Date(),
      origem: origem || chaveFinal || "DESCONHECIDA",
      nome: pegar(dados, ["nome", "name", "nome_completo"]),
      email: pegar(dados, ["email", "e-mail", "mail"]),
      telefone: telefoneTexto(pegar(dados, ["telefone", "phone", "whatsapp", "celular", "phone_e164"])),
      url: url,
      utm_source: pegar(dados, ["utm_source", "utmSource"]),
      utm_campaign: campanha,

      // Exclusivos do Colégio; vazios para os demais sites, que não os enviam.
      faixa_salarial:    pegar(dados, ["faixa_salarial", "salary_range"]),
      qtd_filhos:        pegar(dados, ["qtd_filhos", "number_of_children"]),
      serie:             pegar(dados, ["serie", "grade_level"]),
      dificuldades:      pegar(dados, ["dificuldades", "previous_difficulties"]),
      expectativas:      pegar(dados, ["expectativas", "cppem_expectations"]),
      dificuldade_filho: pegar(dados, ["dificuldade_filho", "specific_difficulty"]),

      /* Exclusivos da indicação. Em qualquer outra aba estes quatro não têm
         coluna e nunca chegam a ser escritos, então mandá-los sempre não
         custa nada. */
      bu: BU_POR_ORIGEM[chaveFinal] || "",
      chave_pix: pegar(dados, ["chave_pix", "chavePix", "pix"]),
      nome_indicado: pegar(dados, ["nome_indicado", "nomeIndicado"]),
      telefone_indicado: telefoneTexto(pegar(dados, ["telefone_indicado", "telefoneIndicado", "whatsapp_indicado"]))
    }
  };
}

/* Decide de quem é o lead, nesta ordem:

   0. Origem declarada por um servidor de confiança (site-cppem), que não tem
      como vir errada e cuja URL seria ambígua — ver ORIGENS_CONFIAVEIS.
   1. URL de site BLOQUEADO manda no resto. Sem isso, um `||` deixava o ?aba=
      resgatar o que a URL tinha acabado de barrar — foi assim que um lead de
      operacaoalvorada.cppem.com.br entrou rotulado como CPPEM.
   2. A campanha DECLARADA na UTM, que identifica sozinha ("bau_unicive" é
      lead da UniCV mesmo que o anúncio caia numa landing genérica).
   3. A URL reconhecida.
   3b. A campanha ADIVINHADA dentro da própria URL — só quando a URL não casou
      com domínio nenhum. Ver a nota abaixo.
   4. O ?aba=, que é só o que o site diz de si mesmo — o sinal mais fraco,
      porque sobrevive a copiar/colar de um projeto para outro. */
function resolverOrigem(chaveDoSite, url, campanha) {
  // 0. Origem declarada pelo servidor (site-cppem): mais confiável que a URL.
  if (ORIGENS_CONFIAVEIS.indexOf(chaveDoSite) >= 0) return chaveDoSite;

  const porUrl = deduzirPorUrl(url);
  if (porUrl && !ORIGENS[porUrl]) return porUrl;

  /* Procurar a campanha DENTRO da URL só faz sentido quando a URL não casou
     com domínio nenhum — é um palpite para landing genérica, não um sinal.

     Sem essa condição, o palpite atropelava o domínio: a regra /unicive/i
     casa com o endereço "indique.unicive.cppem.com.br" inteiro, e uma
     indicação da UniCV sem o ?aba= ia parar na aba UNICIVE_Novo, como lead de
     captura. Para os endereços que já existiam o resultado não muda — em
     contato.unicive.cppem.com.br o domínio e a campanha diziam a mesma coisa.

     A campanha declarada na UTM continua acima da URL, como sempre esteve. */
  const porCampanha = deduzirPorCampanha(campanha) || (porUrl ? "" : deduzirPorCampanha(url));
  if (porCampanha) return porCampanha;

  return porUrl || chaveDoSite;
}

/* Para onde vai o lead depois de identificado. */
function abaDaOrigem(origem) {
  return ABA_POR_ORIGEM[origem] || ABA_DESTINO;
}

/* Abas que a migração nunca pode usar como fonte: as de destino e a de
   ignorados. Comparadas sem acento — ver o uso em `migrarAbasParaCPPEM`. */
function abaProtegida(nome) {
  const alvo = normalizarTitulo(nome);

  return abasDeDestino()
    .concat([ABA_DESCONHECIDOS])
    .some(function (n) { return normalizarTitulo(n) === alvo; });
}

/* Todas as abas que recebem lead — a padrão mais as desviadas. */
function abasDeDestino() {
  const abas = [ABA_DESTINO];

  Object.keys(ABA_POR_ORIGEM).forEach(function (origem) {
    if (abas.indexOf(ABA_POR_ORIGEM[origem]) === -1) abas.push(ABA_POR_ORIGEM[origem]);
  });

  return abas;
}

function pegar(obj, chaves) {
  for (let i = 0; i < chaves.length; i++) {
    const v = obj[chaves[i]];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function normalizarChave(v) {
  return String(v || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function deduzirPorUrl(url) {
  if (!url) return "";

  for (let i = 0; i < DOMINIOS.length; i++) {
    if (DOMINIOS[i].teste.test(url)) return DOMINIOS[i].chave;
  }

  return "";
}

function deduzirPorCampanha(texto) {
  if (!texto) return "";

  for (let i = 0; i < CAMPANHAS.length; i++) {
    if (CAMPANHAS[i].teste.test(texto)) return CAMPANHAS[i].chave;
  }

  return "";
}

/* O telefone chega da máscara da PixelX como "+55 81 9 9996-7415". O "+" no
   começo faz o Sheets interpretar a célula como fórmula — é a origem dos
   #ERROR! que já existem na planilha. Duas travas:
   1) a célula recebe formato de texto ANTES do valor (ver `escreverLead`);
   2) o número é normalizado sem o "+" inicial, então continua legível mesmo
      se alguém limpar a formatação da coluna à mão. */
function telefoneTexto(valor) {
  if (!valor) return "";

  const digitos = String(valor).replace(/\D/g, "");
  if (!digitos) return "";

  const br = digitos.replace(/^0+/, "").replace(/^55/, "");

  if (br.length === 10 || br.length === 11) {
    const ddd = br.slice(0, 2);
    const resto = br.slice(2);
    const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
    const fim = resto.length === 9 ? resto.slice(5) : resto.slice(4);

    return "55 " + ddd + " " + meio + "-" + fim;
  }

  return digitos;
}

/* ---------- COLUNAS (o coração da coisa) ---------- */

/* Descobre em que coluna cada campo mora, lendo o cabeçalho da aba.
   Devolve { chave: indice0 }. Campo sem coluna correspondente fica de fora e
   simplesmente não é escrito — é o caso de "origem" na aba CPPEM hoje. */
function mapaColunas(planilha) {
  const largura = Math.max(planilha.getLastColumn(), 1);
  const cabecalho = planilha
    .getRange(1, 1, 1, largura)
    .getValues()[0]
    .map(function (t) { return normalizarTitulo(t); });

  const mapa = {};

  CAMPOS.forEach(function (campo) {
    for (let i = 0; i < campo.titulos.length; i++) {
      const pos = cabecalho.indexOf(normalizarTitulo(campo.titulos[i]));
      if (pos >= 0) {
        mapa[campo.chave] = pos;
        return;
      }
    }
  });

  return mapa;
}

/* Compara títulos ignorando caixa, espaços extras e acento — "Página URL",
   "Pagina URL" e "PÁGINA  URL" são a mesma coluna. */
function normalizarTitulo(t) {
  return String(t)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira os acentos separados pelo NFD
    .replace(/\s+/g, " ");
}

/* ---------- ESCRITA ---------- */

/* Escreve SÓ nas colunas conhecidas — nem sequer encosta nas outras.

   A versão anterior montava a linha inteira e preenchia com "" o que não
   conhecia. Numa linha nova isso é inofensivo... até o dia em que alguém puser
   um ARRAYFORMULA numa coluna: o "" gravado na célula quebraria o preenchimento
   automático dela. Escrevendo em blocos, VENDEDOR e qualquer coluna futura
   ficam literalmente intocadas. */
function escreverLead(planilha, valores) {
  const mapa = mapaColunas(planilha);
  const linha = planilha.getLastRow() + 1;
  const cabecalho = planilha.getRange(1, 1, 1, Math.max(planilha.getLastColumn(), 1)).getValues()[0];

  blocosContiguos(mapa).forEach(function (bloco) {
    const largura = bloco.length;

    // Formato ANTES do valor: depois já é tarde, o Sheets converteu na escrita.
    bloco.forEach(function (campo, i) {
      const col = bloco.inicio + i;
      planilha.getRange(linha, col + 1).setNumberFormat(formatoDaColuna(campo, cabecalho[col]));
    });

    planilha
      .getRange(linha, bloco.inicio + 1, 1, largura)
      .setValues([bloco.map(function (campo) { return valores[campo.chave]; })]);
  });
}

/* O formato normalmente vem do CAMPOS. FORMATO_POR_TITULO deixa uma coluna
   específica pedir outro — é o "Data" da aba INDICAÇÕES, que mostra só a data
   enquanto as demais abas mostram data e hora. */
function formatoDaColuna(campo, tituloDaColuna) {
  return FORMATO_POR_TITULO[normalizarTitulo(tituloDaColuna)] || campo.formato;
}

/* Agrupa as colunas conhecidas em faixas vizinhas, para escrever de uma vez em
   vez de célula por célula. No layout atual da aba CPPEM (A..G seguidas, com
   VENDEDOR em H) isso dá um bloco só. */
function blocosContiguos(mapa) {
  const usados = CAMPOS
    .filter(function (c) { return mapa[c.chave] !== undefined; })
    .sort(function (a, b) { return mapa[a.chave] - mapa[b.chave]; });

  const blocos = [];

  usados.forEach(function (campo) {
    const col = mapa[campo.chave];
    const ultimo = blocos[blocos.length - 1];

    if (ultimo && mapa[ultimo[ultimo.length - 1].chave] === col - 1) {
      ultimo.push(campo);
    } else {
      const novo = [campo];
      novo.inicio = col;
      blocos.push(novo);
    }
  });

  return blocos;
}

function obterAba(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let planilha = ss.getSheetByName(nome) || abaPorNomeAproximado(ss, nome);

  if (!planilha) {
    planilha = ss.insertSheet(nome);
    criarCabecalho(planilha);
  } else if (planilha.getLastRow() === 0) {
    criarCabecalho(planilha);
  }

  return planilha;
}

/* Só roda em aba nova/vazia. A aba CPPEM já existe e tem cabeçalho próprio —
   este código nunca vai reescrevê-lo. */
function criarCabecalho(planilha) {
  const titulos = CAMPOS.map(function (c) { return c.titulo; }).concat(COLUNAS_MANUAIS);

  const h = planilha.getRange(1, 1, 1, titulos.length);
  h.setValues([titulos]);
  h.setFontWeight("bold");
  h.setBackground("#00E63C");
  h.setFontColor("#0A0A0A");

  CAMPOS.forEach(function (c, i) {
    planilha.setColumnWidth(i + 1, c.largura);
    planilha
      .getRange(2, i + 1, Math.max(planilha.getMaxRows() - 1, 1), 1)
      .setNumberFormat(c.formato);
  });

  // As manuais em cinza, para ficar claro que não vêm do site.
  COLUNAS_MANUAIS.forEach(function (_, i) {
    const col = CAMPOS.length + i + 1;
    planilha.setColumnWidth(col, 160);
    planilha.getRange(1, col).setBackground("#3A3A3A").setFontColor("#FFFFFF");
  });

  planilha.setFrozenRows(1);
}

/* `getSheetByName` é exato: "INDICAÇÕES" e "INDICACOES" são abas diferentes
   para ele. Como o nome dessa aba tem acento e foi digitado à mão, a diferença
   é plausível — e o efeito seria pior que um erro: o script criaria uma aba
   nova e as indicações iriam para um lugar que ninguém olha. Aqui a comparação
   ignora acento, caixa e espaço sobrando, igual à das colunas.

   Só devolve a aba quando ela é ÚNICA. Havendo duas com o mesmo nome
   normalizado, escolher uma seria adivinhar. */
function abaPorNomeAproximado(ss, nome) {
  const alvo = normalizarTitulo(nome);

  const achadas = ss.getSheets().filter(function (aba) {
    return normalizarTitulo(aba.getName()) === alvo;
  });

  return achadas.length === 1 ? achadas[0] : null;
}

/* ---------- DIAGNÓSTICO (rodar à mão; não altera nada) ---------- */

function conferirPlanilha() {
  abasDeDestino().forEach(function (nome) { conferirAba(nome); });

  Logger.log("");
  Logger.log("Roteamento: %s", Object.keys(ABA_POR_ORIGEM).map(function (o) {
    return o + " -> " + ABA_POR_ORIGEM[o];
  }).join(" | ") + " | demais -> " + ABA_DESTINO);
}

function conferirAba(nomeAba) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const planilha = ss.getSheetByName(nomeAba) || abaPorNomeAproximado(ss, nomeAba);

  Logger.log("");

  if (!planilha) {
    Logger.log('Aba "%s": ainda não existe — será criada no padrão no primeiro lead.', nomeAba);
    return;
  }

  const largura = planilha.getLastColumn();
  const cabecalho = planilha.getRange(1, 1, 1, largura).getValues()[0];
  const mapa = mapaColunas(planilha);

  Logger.log('Aba "%s": %s linhas, %s colunas', nomeAba, planilha.getLastRow(), largura);
  Logger.log("Cabeçalho: %s", cabecalho.join(" | "));

  CAMPOS.forEach(function (campo) {
    const col = mapa[campo.chave];
    Logger.log(
      "  %s -> %s",
      campo.chave,
      col === undefined
        ? "SEM COLUNA (não será preenchido)"
        : "coluna " + letraColuna(col + 1) + ' ("' + cabecalho[col] + '")'
    );
  });

  const naoTocadas = [];
  cabecalho.forEach(function (t, i) {
    const usada = Object.keys(mapa).some(function (k) { return mapa[k] === i; });
    if (!usada && String(t).trim()) naoTocadas.push(t);
  });

  Logger.log("Colunas que o script NÃO toca: %s", naoTocadas.join(", ") || "(nenhuma)");
}

function letraColuna(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - r) / 26);
  }
  return s;
}

/* ---------- PREPARO (rodar à mão, uma vez) ---------- */

/* Formata as colunas conhecidas e congela o cabeçalho. Não escreve nem apaga
   valor nenhum — só formato. Isso é o que impede novos #ERROR! no telefone,
   inclusive em digitação manual. */
function prepararAba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(FUSO);

  abasDeDestino().forEach(function (nome) {
    const planilha = ss.getSheetByName(nome) || abaPorNomeAproximado(ss, nome);

    if (!planilha) {
      Logger.log('Aba "%s": ainda não existe, nada a formatar.', nome);
      return;
    }

    const mapa = mapaColunas(planilha);
    const linhas = Math.max(planilha.getMaxRows() - 1, 1);
    const cabecalho = planilha.getRange(1, 1, 1, Math.max(planilha.getLastColumn(), 1)).getValues()[0];

    CAMPOS.forEach(function (campo) {
      const col = mapa[campo.chave];
      if (col === undefined) return;
      planilha.getRange(2, col + 1, linhas, 1).setNumberFormat(formatoDaColuna(campo, cabecalho[col]));
    });

    planilha.setFrozenRows(1);
    Logger.log("Formatos aplicados na aba %s.", nome);
  });
}

/* Opcional: cria a coluna Origem como B, empurrando o resto para a direita
   (VENDEDOR incluída — os dados andam junto com a coluna, nada desalinha).
   Depois disso, todo lead novo já entra com a origem preenchida, e o
   `migrarAbasParaCPPEM` também preenche a das linhas migradas. */
function adicionarColunaOrigem() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_DESTINO);
  if (!planilha) throw new Error('Aba "' + ABA_DESTINO + '" não existe.');

  if (mapaColunas(planilha).origem !== undefined) {
    Logger.log("A coluna Origem já existe. Nada a fazer.");
    return;
  }

  planilha.insertColumnAfter(1);

  const c = planilha.getRange(1, 2);
  c.setValue("Origem");
  c.setFontWeight("bold");
  c.setBackground("#00E63C");
  c.setFontColor("#0A0A0A");

  planilha.setColumnWidth(2, 120);
  planilha.getRange(2, 2, Math.max(planilha.getMaxRows() - 1, 1), 1).setNumberFormat("@");

  Logger.log("Coluna Origem criada. Rode preencherOrigemPelaUrl para completar o histórico.");
}

/* Cria, na aba do Colégio que JÁ existe, as colunas conhecidas que ainda
   faltam — as seis do formulário de 4 passos. Cada uma entra logo DEPOIS da
   última coluna conhecida, o que empurra VENDEDOR para a direita levando os
   dados dela junto: nada desalinha.

   Idempotente: pode rodar quantas vezes quiser, o que já existe é pulado. */
function adicionarColunasDoColegio() {
  const nomeAba = ABA_POR_ORIGEM.COLEGIO;
  const planilha = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomeAba);
  if (!planilha) throw new Error('Aba "' + nomeAba + '" não existe.');

  const criadas = [];

  CAMPOS.forEach(function (campo) {
    /* Os campos da indicação vivem no mesmo CAMPOS, mas são de outra aba —
       criá-los aqui encheria a COLEGIO_Novo de colunas BU e de indicado. */
    if (campo.grupo === "indicacao") return;

    // Relê a cada passo: cada inserção desloca as colunas seguintes.
    const mapa = mapaColunas(planilha);
    if (mapa[campo.chave] !== undefined) return;

    const depoisDe = ultimaColunaConhecida(mapa);
    if (depoisDe === 0) {
      throw new Error(
        'Aba "' + nomeAba + '" não tem nenhuma coluna conhecida. Confira o ' +
        "cabeçalho com conferirPlanilha antes de criar coluna nova."
      );
    }

    planilha.insertColumnAfter(depoisDe);
    const col = depoisDe + 1;

    const cabecalho = planilha.getRange(1, col);
    cabecalho.setValue(campo.titulo);
    cabecalho.setFontWeight("bold");
    cabecalho.setBackground("#00E63C");
    cabecalho.setFontColor("#0A0A0A");

    planilha.setColumnWidth(col, campo.largura);
    planilha
      .getRange(2, col, Math.max(planilha.getMaxRows() - 1, 1), 1)
      .setNumberFormat(campo.formato);

    criadas.push(campo.titulo);
  });

  planilha.setFrozenRows(1);

  if (criadas.length) {
    Logger.log('Aba "%s": colunas criadas -> %s', nomeAba, criadas.join(", "));
  } else {
    Logger.log('Aba "%s": nada a fazer, todas as colunas já existem.', nomeAba);
  }
}

/* Posição (1-based) da última coluna que o script conhece. 0 = nenhuma. */
function ultimaColunaConhecida(mapa) {
  let maior = -1;

  Object.keys(mapa).forEach(function (chave) {
    if (mapa[chave] > maior) maior = mapa[chave];
  });

  return maior + 1;
}

/* Preenche a coluna Origem das linhas antigas deduzindo pela URL. Só escreve
   onde está vazio — não sobrescreve nada que já tenha valor. */
function preencherOrigemPelaUrl() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_DESTINO);
  const mapa = mapaColunas(planilha);

  if (mapa.origem === undefined) throw new Error("A aba não tem coluna Origem. Rode adicionarColunaOrigem antes.");
  if (mapa.url === undefined) throw new Error("A aba não tem coluna de URL.");

  const total = planilha.getLastRow() - 1;
  if (total < 1) return;

  const origens = planilha.getRange(2, mapa.origem + 1, total, 1).getValues();
  const urls = planilha.getRange(2, mapa.url + 1, total, 1).getValues();

  let preenchidas = 0;

  for (let i = 0; i < total; i++) {
    if (String(origens[i][0]).trim() !== "") continue;

    const chave = deduzirPorUrl(String(urls[i][0]));
    const origem = ORIGENS[chave] || chave;

    if (origem) {
      origens[i][0] = origem;
      preenchidas++;
    }
  }

  planilha.getRange(2, mapa.origem + 1, total, 1).setValues(origens);
  Logger.log("Origem preenchida em %s linhas.", preenchidas);
}

/* ---------- MIGRAÇÃO DAS OUTRAS ABAS (rodar à mão) ---------- */

/* Traz o histórico das outras abas para a aba CPPEM, casando as colunas pelo
   NOME do cabeçalho (as abas antigas têm layouts diferentes entre si).

   Regras:
   - a origem de cada linha sai da própria coluna Origem, se a aba tiver uma
     (é o caso da aba de teste); senão, do nome da aba;
   - a URL tem a última palavra, o que reclassifica o que estava errado;
   - linha de origem não permitida (Operação Alvorada, lixo de teste) é
     PULADA, não migrada — e contada no log;
   - a aba de origem NÃO é apagada. Depois de conferir, ela é renomeada para
     "MIGRADA_<nome>", o que também impede migrar duas vezes por engano. */
function migrarAbasParaCPPEM() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  /* Agrupado por aba de destino: os leads da UniCV vão para a UNICIVE_Novo, o
     resto para a CPPEM — a mesma regra que vale para os leads novos. */
  const porAba = {};
  let puladas = 0;

  /* Comparação tolerante: nome de aba costuma vir com espaço sobrando ou caixa
     diferente do que se digitou na lista. */
  const naLista = function (nome) {
    if (!ABAS_PARA_MIGRAR.length) return true;
    const alvo = String(nome).trim().toLowerCase();
    return ABAS_PARA_MIGRAR.some(function (n) {
      return String(n).trim().toLowerCase() === alvo;
    });
  };

  Logger.log("Abas encontradas: %s",
             ss.getSheets().map(function (a) { return '"' + a.getName() + '"'; }).join(", "));
  Logger.log("ABAS_PARA_MIGRAR: %s",
             ABAS_PARA_MIGRAR.length ? ABAS_PARA_MIGRAR.join(", ") : "(vazia = todas)");

  ss.getSheets().forEach(function (aba) {
    const nome = aba.getName();

    /* Cada aba diz por que ficou de fora. Sem isso, "não aconteceu nada" não
       tem como ser diagnosticado sem adivinhação. */
    /* Aba de destino nunca é fonte — senão migraria para dentro de si mesma.

       A comparação ignora acento porque a INDICAÇÕES entrou na lista: pelo
       nome exato, uma aba escrita "INDICACOES" escaparia da proteção, seria
       migrada para a CPPEM e ainda sairia renomeada para MIGRADA_. */
    if (abaProtegida(nome)) {
      Logger.log('  "%s": pulada (é aba de destino ou a de ignorados).', nome);
      return;
    }
    if (/^MIGRADA_/i.test(nome)) {
      Logger.log('  "%s": pulada (já migrada antes).', nome);
      return;
    }
    if (!naLista(nome)) {
      Logger.log('  "%s": pulada (fora de ABAS_PARA_MIGRAR).', nome);
      return;
    }
    if (aba.getLastRow() < 2) {
      Logger.log('  "%s": pulada (sem linhas de dados).', nome);
      return;
    }

    const mapaOrigem = mapaColunas(aba);
    if (mapaOrigem.nome === undefined && mapaOrigem.email === undefined) {
      Logger.log('  "%s": pulada (cabeçalho sem Nome nem Email — não parece aba de leads).', nome);
      return;
    }

    const tabela = aba.getRange(1, 1, aba.getLastRow(), aba.getLastColumn()).getValues();
    const chaveDaAba = normalizarChave(nome);
    let migradasAqui = 0;

    for (let i = 1; i < tabela.length; i++) {
      const l = tabela[i];
      if (!l.join("").trim()) continue;

      const valor = function (chave) {
        const col = mapaOrigem[chave];
        return col === undefined ? "" : String(l[col] || "").trim();
      };

      const url = valor("url");
      const campanha = valor("utm_campaign");

      /* Mesma cadeia de sinais do lead novo. O ?aba= não existe aqui, então o
         lugar dele é ocupado pela coluna Origem da linha — e, faltando ela,
         pelo nome da aba. */
      const chaveFinal = resolverOrigem(
        normalizarChave(valor("origem")) || chaveDaAba, url, campanha
      );
      const origem = ORIGENS[chaveFinal] || "";

      if (!origem) {
        puladas++;
        continue;
      }

      const destino = abaDaOrigem(origem);
      if (!porAba[destino]) porAba[destino] = [];

      porAba[destino].push({
        data: converterData(mapaOrigem.data === undefined ? "" : l[mapaOrigem.data]),
        origem: origem,
        nome: valor("nome"),
        email: valor("email"),
        telefone: telefoneTexto(valor("telefone")),
        url: url,
        utm_source: valor("utm_source"),
        utm_campaign: campanha,

        /* Todo campo do CAMPOS precisa existir aqui: a aba de destino pode ter
           a coluna, e `blocosContiguos` gravaria `undefined` na chave que
           faltasse. Aba antiga sem essas colunas devolve "" pelo `valor`. */
        faixa_salarial:    valor("faixa_salarial"),
        qtd_filhos:        valor("qtd_filhos"),
        serie:             valor("serie"),
        dificuldades:      valor("dificuldades"),
        expectativas:      valor("expectativas"),
        dificuldade_filho: valor("dificuldade_filho"),

        // Idem para os da indicação — nenhuma aba antiga tem estas colunas.
        bu:                valor("bu"),
        chave_pix:         valor("chave_pix"),
        nome_indicado:     valor("nome_indicado"),
        telefone_indicado: valor("telefone_indicado")
      });

      migradasAqui++;
    }

    if (migradasAqui > 0) {
      aba.setName("MIGRADA_" + nome);
      Logger.log('  "%s": %s linhas migradas (aba renomeada para MIGRADA_%s).',
                 nome, migradasAqui, nome);
    } else {
      Logger.log('  "%s": nenhuma linha aproveitada — todas de origem não permitida.', nome);
    }
  });

  const destinos = Object.keys(porAba);

  if (!destinos.length) {
    Logger.log("RESULTADO: nada migrado. %s linhas puladas por origem não permitida.", puladas);
    return;
  }

  destinos.forEach(function (nomeDestino) {
    const destino = obterAba(nomeDestino);
    const mapaDestino = mapaColunas(destino);
    const linhas = porAba[nomeDestino];
    const inicio = destino.getLastRow() + 1;

    // Mesma regra do escreverLead: só as colunas conhecidas são tocadas.
    blocosContiguos(mapaDestino).forEach(function (bloco) {
      bloco.forEach(function (campo, i) {
        destino
          .getRange(inicio, bloco.inicio + i + 1, linhas.length, 1)
          .setNumberFormat(campo.formato);
      });

      destino
        .getRange(inicio, bloco.inicio + 1, linhas.length, bloco.length)
        .setValues(linhas.map(function (lead) {
          return bloco.map(function (campo) { return lead[campo.chave]; });
        }));
    });

    Logger.log("RESULTADO: %s linhas migradas para a aba %s.", linhas.length, nomeDestino);
  });

  Logger.log("RESULTADO: %s puladas (origem não permitida).", puladas);
}

/* As abas antigas gravavam a data como TEXTO "dd/MM/yyyy HH:mm:ss". */
function converterData(v) {
  if (v instanceof Date) return v;

  const m = String(v || "").match(/^(\d{2})\/(\d{2})\/(\d{4})[ ,]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return String(v || "");

  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
}

/* ---------- LIMPEZA (rodar à mão) ---------- */

/* Tira da aba principal o que não deveria estar lá — leads da Operação
   Alvorada que entraram antes do bloqueio, linhas de teste, origem
   desconhecida.

   Nada é apagado: as linhas são COPIADAS para a aba REMOVIDOS antes de saírem
   daqui. Se algo for removido por engano, está lá para voltar. */
function arquivarNaoPermitidos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const planilha = ss.getSheetByName(ABA_DESTINO);
  if (!planilha) throw new Error('Aba "' + ABA_DESTINO + '" não existe.');

  const mapa = mapaColunas(planilha);
  const largura = Math.max(planilha.getLastColumn(), 1);
  const total = planilha.getLastRow() - 1;
  if (total < 1) return;

  const tabela = planilha.getRange(2, 1, total, largura).getValues();
  const remover = [];

  for (let i = 0; i < tabela.length; i++) {
    const l = tabela[i];
    if (!l.join("").trim()) continue;

    const valor = function (chave) {
      const col = mapa[chave];
      return col === undefined ? "" : String(l[col] || "").trim();
    };

    const porUrl = deduzirPorUrl(valor("url"));
    const daLinha = normalizarChave(valor("origem"));

    /* Sem coluna Origem e sem URL reconhecível não dá para afirmar que a linha
       é indevida — na dúvida, fica. Remover lead bom é pior que manter um
       ruim. */
    if (!porUrl && !daLinha) continue;

    if (!(ORIGENS[porUrl] || ORIGENS[daLinha])) {
      remover.push({ linha: i + 2, celulas: l });
    }
  }

  if (!remover.length) {
    Logger.log("Nada a arquivar.");
    return;
  }

  const arquivo = obterAba("REMOVIDOS");
  if (arquivo.getLastRow() === 0) {
    arquivo.getRange(1, 1, 1, largura)
      .setValues([planilha.getRange(1, 1, 1, largura).getValues()[0]])
      .setFontWeight("bold");
  }

  arquivo
    .getRange(arquivo.getLastRow() + 1, 1, remover.length, largura)
    .setValues(remover.map(function (r) { return r.celulas; }));

  // De baixo para cima: apagar de cima muda o número das linhas de baixo.
  remover
    .map(function (r) { return r.linha; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (n) { planilha.deleteRow(n); });

  Logger.log("%s linhas movidas para REMOVIDOS.", remover.length);
}

/* ---------- utilitário ---------- */

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
