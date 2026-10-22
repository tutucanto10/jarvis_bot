# Segundo cérebro — bot pessoal no Telegram

Bot de uso pessoal: captura gastos, abastecimentos, ideias e tarefas em texto livre e manda um briefing matinal.
Next.js (App Router, só API routes) + grammY em modo webhook. Deploy recomendado: **Render (free) + Neon + cron-job.org**.

> Status: **Fase 5** — briefing matinal.

## Requisitos

- Node.js 22+
- pnpm 10+
- Um bot criado no [@BotFather](https://t.me/BotFather)

## Setup local

```bash
pnpm install
cp .env.example .env
```

Preencha no `.env`:

| Variável | Como obter |
|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot` |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 32` (só `A-Z a-z 0-9 _ -`, 16+ caracteres) |
| `ALLOWED_CHAT_ID` | seu chat id (veja abaixo) |
| `DATABASE_URL` | Neon → *Connection string* (use a do **pooler**, com `-pooler` no host e `sslmode=require`) |
| `GEMINI_API_KEY` | IA padrão, grátis: [aistudio.google.com](https://aistudio.google.com) → **Get API key** |
| `GEMINI_MODEL` | modelo do Gemini (padrão `gemini-2.5-flash`) |
| `ANTHROPIC_API_KEY` | opcional: usa Claude (`claude-haiku-5-5`) no lugar do Gemini |
| `AI_PROVIDER` | opcional: força `gemini` ou `anthropic`; sem ela, usa Gemini se houver `GEMINI_API_KEY` |
| `TZ_USER` | fuso para datas (padrão `America/Sao_Paulo`) |
| `CRON_SECRET` | `openssl rand -hex 32`; protege as rotas do briefing |
| `WEATHER_LAT` / `WEATHER_LON` | coordenadas do clima (padrão: Ilha do Governador) |
| `WEATHER_LABEL` | nome exibido no clima (padrão `Ilha do Governador`) |
| `FAVORITE_TEAMS` | times em destaque, separados por vírgula (padrão `Flamengo`) |
| `APP_URL` | URL pública do app (opcional; no Render o script usa `RENDER_EXTERNAL_URL` automaticamente) |

**Descobrindo seu chat id:** mande qualquer mensagem pro bot e abra
`https://api.telegram.org/bot<TOKEN>/getUpdates` (com o webhook desligado). O valor está em `message.chat.id`.

## Banco de dados (Neon + Drizzle)

1. Crie um projeto em [neon.tech](https://neon.tech) e copie a connection string pro `DATABASE_URL`.
2. Aplique as migrations:

```bash
pnpm db:migrate
```

Comandos:

```bash
pnpm db:generate --name <nome>   # gera migration a partir de src/db/schema.ts
pnpm db:migrate                  # aplica as pendentes no DATABASE_URL
pnpm db:studio                   # navegador de dados do Drizzle
```

Tabelas:

- `entries`: tudo que é capturado (`gasto | abastecimento | ideia | tarefa | nota`).
- `fuel_logs`: detalhes de abastecimento, 1:1 com `entries` (`ON DELETE CASCADE`).
- `briefings`: histórico dos briefings enviados.

Convenções:

- Dinheiro sempre em **centavos** (`integer`).
- Instantes em `timestamptz` (UTC), exibidos em `America/Sao_Paulo`.
- `due_date` é `date`, porque "sexta" é um dia, não um instante.
- `CHECK`s no banco: valores não negativos, gasto exige valor, litros e total do abastecimento maiores que zero.
- Entrada e abastecimento são gravados num único `INSERT ... WITH`, de forma atômica (o driver HTTP do Neon não tem transações).

## Captura com IA

Toda mensagem de texto que não é comando vai para o classificador. A IA é o **Gemini** (padrão, plano grátis)
ou o **Claude**, escolhida pelas variáveis de ambiente. Os dois devolvem JSON com schema, e o código valida
tudo com Zod do mesmo jeito; a camada fica em `src/ai/llm.ts`.

> **Privacidade:** no plano grátis do Gemini, o Google pode usar o conteúdo enviado para melhorar os produtos dele.
> Se não quiser isso para seus gastos e anotações, use o plano pago do Gemini ou o Claude.

Fluxo:

1. **A IA classifica.** Ela devolve tipo, valor **como escrito** ("23,50", "150 conto"), categoria, tags, data, dados de abastecimento, resumo e confiança.
   O prompt fica em `src/ai/prompts/classify.ts`.
2. **O código valida e normaliza.**
   - O valor vira centavos com um parser determinístico (`parseBRL`); a IA nunca faz conta.
   - A resposta é revalidada com Zod.
   - A tag `astro` entra sempre que a mensagem mencionar a ASTRO.
   - Abastecimento sempre cai na categoria `combustível`.
3. **Na dúvida, pergunta.** Se a validação falhar ou a confiança for < 0.7, o bot pergunta com botões (Gasto / Ideia / Tarefa / Nota).
   Ao tocar num botão, a IA reclassifica com o tipo fixado. Se a IA estiver fora do ar, o registro é montado localmente;
   para gasto, o valor é extraído do texto.
4. **Confirma.** Exemplo: `✅ Gasto: R$ 40,00 · mercado`, com o botão **Desfazer**. `/desfazer` apaga o último registro.

Se a IA ou o banco falharem, o bot responde "não consegui salvar agora, tenta de novo"; nunca fica em silêncio.

Para testar o classificador sem Telegram e sem salvar:

```bash
pnpm ai:try "gastei 40 no mercado" "abasteci 150 conto, 26 litros" "lembrar de pagar o boleto sexta"
```

## Consultas

| Comando | O que mostra |
|---|---|
| `/resumo` | semana atual (desde segunda): total gasto, top 3 categorias, nº de ideias e tarefas |
| `/resumo mes` | o mesmo para o mês atual |
| `/gastos` | mês atual por categoria, com % e total |
| `/ideias` · `/ideias astro` | últimas 15 ideias, opcionalmente filtradas por tag |
| `/abastecimentos` | últimos 10, km/l entre abastecimentos com hodômetro, média e gasto do mês com combustível |

Os gastos incluem os abastecimentos (categoria `combustível`). Os períodos são calculados em `TZ_USER`.

**km/l:** considera tanque cheio. Os litros de um abastecimento cobrem os km rodados desde o anterior com hodômetro.
Abastecimentos sem hodômetro somam seus litros ao próximo.

**Perguntas em linguagem natural:** mensagens que terminam com `?` ou começam com
"quanto", "quais", "qual", "cadê", "mostra", "lista", "o que eu"… vão para o fluxo de consulta, não de captura.
A IA só preenche um **filtro estruturado** (tipos, categorias, tags, termo de busca, período), validado com Zod.
O código converte o período em datas e monta a query com Drizzle, parametrizada.
A IA nunca gera SQL, e a frase da resposta é montada pelo código a partir do filtro validado.

## Briefing matinal

Todo dia às 07:00 (BRT) o bot manda:

1. **Texto (HTML):** clima (Open-Meteo), 3 manchetes de Brasil e mundo (g1 + BBC News Brasil) e até 3 de esportes (ge).
   As manchetes são escolhidas e reescritas pela IA, sem sensacionalismo e sem repetir assunto.
   Se o Flamengo jogou ontem, entra uma seção com o placar dele.
   Se a mensagem passar de ~3500 caracteres, vira duas, sem cortar conteúdo.
2. **Imagem dos resultados de ontem (PNG 1080px, fundo escuro):** primeiro o bloco dos `FAVORITE_TEAMS`, depois um bloco por liga, nesta ordem:
   Brasileirão, Copa do Brasil, Libertadores, Champions, Premier League, NBA, NFL.
   O vencedor aparece em negrito, os logos vêm embutidos (sigla quando o logo falha), e ligas sem jogo não aparecem.
   Se passar de ~2500px de altura, vira um álbum.

"Ontem" = jogos que **começaram** entre 00:00 e 23:59 de ontem em `TZ_USER`; um jogo que acaba depois da meia-noite conta.
Só entram jogos finalizados. Cada fonte falha de forma independente:

| Falha | O que acontece |
|---|---|
| Clima | linha "clima indisponível" |
| Feeds RSS | "⚠️ notícias indisponíveis" |
| IA (seleção de notícias) | primeiras manchetes como vieram |
| Imagem (render ou envio) | placares em texto + "⚠️ imagem indisponível" |
| ESPN | "⚠️ placares indisponíveis" |

Cada envio fica registrado na tabela `briefings`.

**Disparo:**
- **Agendado:** um job no [cron-job.org](https://cron-job.org) chama `GET /api/cron/briefing` às 07:00 `America/Sao_Paulo`
  com o header `Authorization: Bearer <CRON_SECRET>` (veja *Deploy*).
- **Manual:** comando `/briefing` no bot.
- **Debug da imagem:** `GET /api/briefing/scores-image?date=YYYY-MM-DD&page=1&secret=$CRON_SECRET`
  (ou com o header `Authorization: Bearer`).

Alternativas de agendamento (use **só uma**, ou chegam dois briefings):
- **GitHub Actions:** `.github/workflows/briefing.yml`. Cadastre os secrets `APP_URL` e `CRON_SECRET` e a variável
  `BRIEFING_VIA_ACTIONS=true` no repositório; sem a variável, o agendamento não roda.
- **Vercel Cron:** se hospedar na Vercel, o `vercel.json` já agenda `0 10 * * *`. No plano Hobby ele pode disparar
  a qualquer momento entre 07:00 e 07:59.

**Checando as fontes reais** (sem IA e sem Telegram; renderiza `briefing-check.png`):

```bash
pnpm briefing:check              # ontem
pnpm briefing:check 2026-10-19   # um dia específico
```

As URLs ficam em `src/briefing/sources.ts`. A API da ESPN não é oficial: todo o acesso a ela fica isolado em
`src/briefing/scores.ts`, com cada evento validado por Zod.

## Desenvolvimento

```bash
pnpm dev:polling   # roda o bot local em long polling (remove o webhook!)
pnpm test          # vitest (testes de banco rodam num Postgres em memória via PGlite)
pnpm lint
pnpm typecheck
```

> `dev:polling` apaga o webhook, porque o Telegram não entrega updates por polling com webhook ativo.
> Quando terminar, rode `pnpm webhook:set` de novo pra produção voltar a funcionar.

## Deploy (Render + Neon + cron-job.org, tudo grátis)

**1. Banco (Neon).** Crie um projeto em [neon.tech](https://neon.tech) na região **AWS US East (N. Virginia)**
e copie a connection string com *Connection pooling* ligado (`postgresql://...-pooler...?sslmode=require`).
Não precisa criar tabelas: as migrations rodam sozinhas a cada deploy.

**2. App (Render).** Em [render.com](https://render.com): **New → Blueprint** → escolha este repositório.
O `render.yaml` cria o serviço `jarvis-bot` (plano Free, região Virginia) e pede as variáveis secretas:

| Variável | Valor |
|---|---|
| `TELEGRAM_BOT_TOKEN` | token do @BotFather |
| `ALLOWED_CHAT_ID` | seu chat id (@userinfobot) |
| `DATABASE_URL` | string do Neon |
| `GEMINI_API_KEY` | chave grátis do [Google AI Studio](https://aistudio.google.com) |

`TELEGRAM_WEBHOOK_SECRET` e `CRON_SECRET` são gerados pelo Render; clima, fuso e time favorito já vêm preenchidos.

A cada deploy, o Render:
1. instala as dependências, **aplica as migrations** e faz o build (`npm run build:render`);
2. **registra o webhook** do Telegram em `RENDER_EXTERNAL_URL/api/telegram`, com a lista de comandos, e sobe o servidor
   (`npm run start:render`). Se o registro falhar, o servidor sobe mesmo assim e o erro aparece nos logs.

**3. Agendamentos (cron-job.org).** Crie dois jobs:

| Job | URL | Quando | Header |
|---|---|---|---|
| Manter acordado | `https://<app>.onrender.com/api/health` | a cada 10 minutos | — |
| Briefing | `https://<app>.onrender.com/api/cron/briefing` | todo dia 07:00, fuso `America/Sao_Paulo` | `Authorization: Bearer <CRON_SECRET>` |

O `CRON_SECRET` fica em *Render → jarvis-bot → Environment*.

> **Por que manter acordado:** no plano Free, o Render desliga o serviço após 15 min sem acesso, e ele leva
> ~1 min para voltar. Sem o ping, a primeira mensagem depois de um tempo parado demora, e o Telegram pode
> reenviá-la e duplicar o registro. Um serviço ligado o mês inteiro usa ~744 h, dentro das 750 h grátis do Render,
> desde que seja o único serviço Free da conta.

**4. Teste.** Mande "gastei 40 no mercado" para o bot. Se não responder, veja os logs no Render ou abra
`https://api.telegram.org/bot<TOKEN>/getWebhookInfo` e confira o `last_error_message`.

Para hospedar em outro lugar (Vercel, VPS…): rode `pnpm db:migrate`, faça o deploy e depois
`pnpm webhook:set https://<sua-url>`.

## Segurança

- `POST /api/telegram` exige o header `X-Telegram-Bot-Api-Secret-Token`; sem ele ou errado → `401`.
  A checagem acontece antes de qualquer chamada à API do Telegram.
- Updates de qualquer chat diferente de `ALLOWED_CHAT_ID` são descartados em silêncio.
- Os logs são JSON estruturado, sem texto de mensagens; tokens e chaves são mascarados.
- `/api/cron/briefing` exige `Authorization: Bearer $CRON_SECRET`. A rota de imagem aceita também `?secret=`, para abrir no navegador.
- O webhook responde 200 mesmo se o processamento passar de 50 s, para o Telegram não reenviar o update e duplicar o registro.

## Estrutura

```
src/
  app/api/telegram/route.ts   webhook
  app/api/health/             ping de uptime
  app/api/cron/briefing/      cron do briefing
  app/api/briefing/scores-image/  PNG de resultados (debug)
  briefing/                   fontes (clima, RSS, ESPN), ordenação, mensagem, imagem, orquestração
  ai/                         camada de IA (Gemini/Claude), classificador, parser de perguntas, seleção de notícias, prompts/
  telegram/                   bot, handlers, captura, consultas, formatação, filtro de chat, textos
  db/                         schema Drizzle, cliente Neon, gravação e consultas
  lib/                        env (Zod), logger, secrets, dinheiro, datas, períodos, km/l, HTML
drizzle/                      migrations SQL geradas
assets/fonts/                 Work Sans (OFL) usada na imagem
scripts/
  migrate.ts                  pnpm db:migrate
  try-classify.ts             pnpm ai:try
  briefing-check.ts           pnpm briefing:check
  set-webhook.ts              pnpm webhook:set
  dev-polling.ts              pnpm dev:polling
```
