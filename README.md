# Missão Indicação — CPPEM

Página do programa de indicação. Uma pessoa indica outra, e as duas aparecem
na **mesma linha** da aba `INDICAÇÕES` da planilha de leads.

Esta é a versão **CPPEM**. UNICIVE e COLÉGIO são cópias desta pasta com o
bloco `BU` e a identidade visual trocados — ver *Replicar para outra BU*.

```
index.html              a página inteira (HTML + CSS)
script.js               validação, envio e o fluxo de "indicar outra pessoa"
google-apps-script.js   backend da planilha — colar no Apps Script, uma vez só
public/                 logo e emblema
vercel.json             cache dos estáticos
```

---

## 1. Publicar o backend (uma vez, para as três BUs)

O Apps Script é **um só** e já recebe as LPs de captura e de venda direta. O
arquivo daqui é a versão dele com o programa de indicação incluído.

1. Planilha → **Extensões → Apps Script** → cole o `google-apps-script.js`
   inteiro por cima do `Codigo.gs` atual e salve.
2. **Implantar → Gerenciar implantações** → editar a implantação atual →
   Versão: **Nova versão** → Implantar. A URL `/exec` **não muda**, então as
   LPs que já existem seguem funcionando sem tocar em nada.
3. Rode `conferirPlanilha` (não altera nada) e confira no log que a aba
   `INDICAÇÕES` casou as colunas assim:

   | campo               | coluna esperada       |
   |---------------------|-----------------------|
   | `data`              | A — Data              |
   | `nome`              | B — Nome              |
   | `telefone`          | C — Telefone          |
   | `chave_pix`         | D — Chave pix indicador |
   | `nome_indicado`     | E — Nome Indicado     |
   | `telefone_indicado` | F — Telefone Indicado |
   | `bu`                | G — BU                |
   | `url`               | H — Página URL        |

4. Opcional: `prepararAba` formata as colunas de texto. É o que evita o
   `#ERROR!` nas colunas de telefone e de chave PIX (um valor começando com
   `+` é lido como fórmula pelo Sheets).

### O que mudou no backend

A base é a versão que está no ar hoje — com os campos do Colégio, o
`LIVE_PMPE` e o `adicionarColunasDoColegio`. Nada do que já existia mudou de
comportamento: rodei os 16 fronts atuais contra a versão antiga e a nova lado
a lado, e todos caem na mesma aba, com a mesma origem e os mesmos valores.

Adições:

- `ABA_INDICACOES` + `BU_POR_ORIGEM` — a aba de destino e os três valores
  fixos da coluna BU (`CPPEM`, `UNICIVE`, `COLEGIO`).
- Quatro campos novos em `CAMPOS` (`bu`, `chave_pix`, `nome_indicado`,
  `telefone_indicado`), marcados com `grupo: "indicacao"`. Como a escrita é por
  **nome de cabeçalho**, nas outras abas esses títulos não existem e os campos
  simplesmente não são escritos.
- `FORMATO_POR_TITULO` — a coluna `Data` da aba INDICAÇÕES grava `dd/MM/yyyy`,
  igual às linhas que já estão lá, em vez do `dd/MM/yyyy HH:mm:ss` das demais
  abas. O valor gravado continua sendo o timestamp completo; muda só a exibição.
- `abaPorNomeAproximado` — `getSheetByName` é exato, e `INDICAÇÕES` tem acento.
  Se o nome da aba aparecer sem acento algum dia, o script encontra a aba certa
  em vez de criar uma duplicada que ninguém olha.
- As três origens entraram em `ORIGENS_CONFIAVEIS`: quem decide a BU é o
  `?aba=` da página, não a URL. As páginas são irmãs e podem ser publicadas em
  qualquer subdomínio de `cppem.com.br` — inclusive um que já casa com outra
  regra de `DOMINIOS`.

### Duas travas para não estragar o que funciona

Os campos da indicação moram no mesmo `CAMPOS` de todo mundo, e isso abria dois
buracos. Ambos estão fechados:

- **`adicionarColunasDoColegio`** percorre o `CAMPOS` inteiro criando o que
  falta. Sem a marca `grupo`, rodá-lo encheria a `COLEGIO_Novo` de colunas BU,
  Chave pix e Nome Indicado. Agora ele pula o grupo `indicacao`.
- **`migrarAbasParaCPPEM`** nunca usa uma aba de destino como fonte, e a
  INDICAÇÕES passou a ser uma delas. A comparação era pelo nome exato — uma aba
  escrita `INDICACOES` escaparia da proteção, seria migrada para a CPPEM e
  ainda sairia renomeada para `MIGRADA_`. A checagem virou `abaProtegida`, que
  ignora acento e caixa.

### Um bug que apareceu no caminho

`resolverOrigem` procurava a campanha **dentro da própria URL** mesmo quando a
URL já tinha casado com um domínio conhecido. A regra `/unicive/i` casa com o
endereço `indique.unicive.cppem.com.br` inteiro, então uma indicação da UniCV
que chegasse sem o `?aba=` ia parar na aba `UNICIVE_Novo`, contada como lead de
captura.

Agora o palpite pela URL só roda quando a URL não casou com domínio nenhum —
que é o caso para o qual ele foi feito (landing genérica). A campanha declarada
na UTM continua acima da URL, como sempre esteve, e para os endereços que já
existiam o resultado é idêntico: em `contato.unicive.cppem.com.br` o domínio e
a campanha diziam a mesma coisa.

---

## 2. Publicar a página

Site estático. Na Vercel, importar o repositório e publicar sem build.

Domínios no ar, todos reconhecidos pelo backend caso o `?aba=` se perca:

| BU | domínio | projeto Vercel |
|---|---|---|
| CPPEM | `indica.cppem.com.br` | `indicacao-cppem` |
| COLÉGIO | `indica.colegio.cppem.com.br` | `indicacao-colegio` |
| UNICIVE | `indica.unicive.cppem.com.br` | `indicacao-unicive` |

Os endereços `indicacao-*.vercel.app` continuam valendo e também estão na
lista `DOMINIOS`, porque podem ter sido compartilhados antes do domínio
próprio entrar.

Os três projetos estão conectados aos repositórios: um `git push` publica
sozinho.

Publicar em outro domínio funciona, porque o `?aba=` decide sozinho. Mas se
mudar, **acerte a lista `DOMINIOS` no Apps Script**: ela é a rede que segura o
link compartilhado sem o parâmetro.

---

## 3. Replicar para outra BU

**Só um arquivo é obrigatório:** `script.js`, bloco `BU` no topo.

```js
const BU = {
  chave: "INDICACAO_CPPEM",     // decide a coluna BU no backend
  nome: "CPPEM",                // vai junto nos eventos de dataLayer
  whatsapp: "5581973105354",
  whatsappMsg: "...",
  selo: { ate: 10, prefixo: "", sufixo: "%" }
};
```

As três, lado a lado:

| | CPPEM | COLÉGIO | UNICIVE |
|---|---|---|---|
| `chave` | `INDICACAO_CPPEM` | `INDICACAO_COLEGIO` | `INDICACAO_UNICIVE` |
| coluna BU | `CPPEM` | `COLEGIO` | `UNICIVE` |
| WhatsApp | `5581973105354` | `5581997076388` | `5581992640766` |
| `selo` | 10% | R$ 100 | 60% |

### A chave PIX não existe nesta página

A recompensa do CPPEM é **Créditos CPPEM, material digital e desconto**, tudo
aplicado pela própria equipe. Não existe pagamento em dinheiro, então a chave
nunca teve uso aqui.

Ela foi **removida de vez**, não escondida: saiu do HTML, do CSS e do JS, junto
com a validação de CPF, CNPJ e chave aleatória que só existia para ela. Campo
escondido continua no código-fonte e volta a aparecer se o `script.js` falhar
ao carregar.

A **UniCive é a única das três que pede a chave**, porque lá o prêmio cai mesmo
no Pix do indicador. Para trazer o campo de volta, o caminho é copiar da
`indicaçõesUNICIVE`: o bloco `#campo-pix` no `index.html` e a seção `Chave Pix`
do `script.js`.

O formulário não manda mais `chave_pix`. O backend usa `pegar()`, que devolve
`""` quando a chave não vem, então a coluna `Chave pix indicador` continua
gravando célula vazia, e não `undefined`.

> Escrever qualquer outra coisa em `chave` manda a indicação para a aba
> `IGNORADOS`. Essa aba é rede de segurança, não destino: linha ali é sinal de
> configuração quebrada.

Depois, no `index.html`:

1. **Tokens de cor** — o bloco `:root` no topo do `<style>`. É o único lugar
   onde as cores são definidas.

   | BU      | base                 | destaque            | fontes                              |
   |---------|----------------------|---------------------|-------------------------------------|
   | CPPEM   | `#0a0a0b` (preto)    | `#af9256` (ouro)    | Oxanium / Rajdhani / Inter          |
   | UNICIVE | `#eef1e6` (claro)    | `#4f7129` + `#e3a11b` | Bebas Neue / Montserrat           |
   | COLÉGIO | `#0D1B3E` (navy)     | `#C9A227` (ouro)    | Cinzel / Libre Baskerville / DM Sans |

   A UNICIVE é a única de fundo **claro** — nela os tokens de texto
   (`--text`, `--text-soft`, `--text-muted`) e os gradientes escuros dos
   cartões precisam ser invertidos, não só recoloridos.

2. **Logo e favicon** — trocar os arquivos em `public/`.
3. **Títulos e prêmios** — as seções `#niveis`, produtos elegíveis e regras.
   Os valores atuais (Bronze/Prata/Ouro, R$ 50, R$ 100, 15% OFF, 10% OFF para
   o indicado) são os do CPPEM.

   O valor do selo animado (`10%`) mora no `script.js`, na constante `ATE`
   dentro de `animarSelo` — não no HTML. O HTML traz `1%` só como estado
   inicial e para quem tem animação desligada.
4. **`<title>` e as metatags** no `<head>`.

---

## 4. A página

O formulário fica **no hero**, na primeira dobra, ao lado da promessa —
indicar é gesto de impulso, e cada rolagem entre a promessa e o campo é gente
perdida. O resto da página (como funciona, níveis, elegíveis, regras) existe
para quem quer entender antes de preencher.

### Animações

Duas, ambas disparadas por `IntersectionObserver` quando a seção entra na
tela, e ambas puro enfeite: sem observer, ou com "reduzir movimento" ligado no
sistema, o conteúdo aparece pronto e no lugar.

- **Níveis** — os três cards caem, batem, quicam e assentam, escalonados. Cada
  um acende na própria cor no instante do impacto e recebe uma faísca logo
  depois. A cor vem do `--cor` / `--cor-luz` no `style` de cada card.
- **Selo do indicado** — o anel carrega enquanto o número sobe de 1% a 10%.

Um detalhe que não é óbvio: quando a queda termina, o script troca
`data-visivel` por `data-pousado` no card. É preciso porque uma animação com
`animation-fill-mode: forwards` congela o `transform`, e sem a troca o `:hover`
dos cards ficaria morto pelo resto da visita. Se o script falhar, o `forwards`
segura o card no lugar certo e só o hover se perde.

Há um `<noscript>` no `<head>` que revela os cards: eles nascem em
`opacity: 0` e quem os mostra é o script.

### O formulário

Quatro campos, todos obrigatórios:

| campo | validação |
|---|---|
| Seu nome completo | nome e sobrenome |
| Seu WhatsApp | DDD válido + 9 dígitos, o 9 na terceira posição |
| Nome do indicado | nome e sobrenome |
| WhatsApp do indicado | mesma regra, e não pode ser igual ao seu |

O envio espera a requisição sair antes de mostrar sucesso (`await`), ao
contrário das LPs de captura, que disparam e redirecionam. Como a pessoa
**fica na página**, mostrar "enviado" sem ter enviado seria mentira visível na
próxima indicação.

### Indicar mais de uma pessoa

Na tela de sucesso, **"Indicar outra pessoa"** limpa apenas os dois campos do
indicado e devolve o formulário com o nome e o WhatsApp do indicador ainda
preenchidos. A partir da segunda, aparece um contador — ele é local (só
desta sessão) e serve de confirmação visual. O placar que vale é o do time, na
planilha.

---

## 5. Rastreamento

GTM server-side (`sgtm.cppem.com.br`), igual às outras páginas. Eventos no
`dataLayer`, todos com `bu`:

| evento | quando |
|--------|--------|
| `indicacao_enviada` | envio aceito, com `indicacao_numero` |
| `indicacao_erro` | a requisição não saiu |
| `indicacao_nova_tentativa` | clique em "Indicar outra pessoa" |

Não há evento de `Lead` aqui: indicação não é lead de venda e contaria como
conversão nas campanhas.

---

## A seção "Quem já passou por aqui"

Fotos de aprovados fardados, com a equipe e com a família, num carrossel.

Vieram do `pages captura leads/captura-cppem/public`, onde estavam em
3024x4032 pesando cerca de **14 MB no total**. Aqui elas foram recortadas em
3:4 (que é como o carrossel exibe) e reduzidas para 560x747, fechando em
**567 KB**. Copiadas para cá em vez de referenciadas do outro deploy: a página
não pode quebrar se aquele projeto mudar de rota.

A seção existe pelo mesmo motivo da galeria do Colégio: os níveis dizem o que
a pessoa ganha, mas não dizem se ela pode indicar sem se queimar. Essas fotos
dizem.

---

## O carrossel

As três páginas usam o mesmo carrossel infinito, com a mesma classe
`.carrossel`. Uma correção feita numa transfere para as outras.

Como funciona: duas cópias da mesma fita, lado a lado, e a animação arrasta o
conjunto para a esquerda. Quando a primeira cópia acaba de sair, a segunda
está exatamente onde a primeira começou, então o salto de volta ao início não
se vê.

O deslocamento é **`-50% - metade do gap`**, não `-50%` puro. Com duas cópias
separadas por um gap, metade da largura total cai no meio desse espaço, e a
emenda daria um solavanco a cada volta. Medido no navegador nas três páginas,
o deslocamento do CSS bate com a largura de uma cópia inteira na casa do
centésimo de pixel.

Outros detalhes que não são óbvios:

- A segunda cópia é `aria-hidden`. Sem isso, um leitor de tela leria a mesma
  lista duas vezes.
- As fotos individuais têm `alt=""` e quem carrega a descrição é o contêiner,
  com `role="img"` e um `aria-label` do conjunto. São várias fotos da mesma
  cena; descrever uma a uma só encheria o leitor de tela de repetição.
- A segunda cópia usa os **mesmos `src`**, então o navegador não baixa nada de
  novo: 567 KB as 14 fotos no total.
- Passar o mouse pausa. `:focus-within` também, para quem navega por teclado.
- Com "reduzir movimento" ligado no sistema, a animação some, a fita vira uma
  faixa rolável com scroll-snap e a cópia duplicada é escondida.

A velocidade fica no `style="--duracao:"` do próprio elemento, para cada página
ajustar sem mexer no CSS: 62s aqui, proporcional à quantidade de fotos.
