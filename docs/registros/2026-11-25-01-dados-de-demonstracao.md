# Dados de demonstração para a apresentação

25/11/2026 · Agente (Claude Code)

> Ticket [12](../tickets/12-dados-de-demonstracao.md), issue [#12](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/12). Com um comando, o banco de desenvolvimento ou de homologação fica com os dados que o front mostrava com o mock: setores com perguntas, uma conta de cada perfil, telas de TV e quatro meses de avaliações, para o dashboard, as respostas, os pedidos de retorno e a TV terem o que mostrar.

## O que foi feito

- **O comando `pnpm db:demo`** (`tsx prisma/demonstracao.ts`), separado do seed base, que precisa rodar antes. Só grava com a confirmação: o nome do banco em `DEMO_CONFIRM`, na linha do comando. Sem ela, ou com o nome de outro banco, diz qual banco mudaria (o nome e o servidor, sem o usuário e a senha) e como confirmar, e sai com erro. A confirmação é lida antes do `.env`: uma linha `DEMO_CONFIRM` esquecida lá não vale.
- **Os dados** (`prisma/seeds/demonstracao/dados.ts`), os mesmos do mock do front, todos inventados:
  - os 6 setores, com a Maternidade desativada;
  - as 35 perguntas, na ordem da jornada, com os quatro tipos; a Internação tem 9 ativas (o aviso de pesquisa longa aparece acima de 8) e uma desativada;
  - as 5 contas do mock, com os e-mails no domínio reservado `.example`: o Super Admin, a Gestora do Pronto Atendimento e da Internação, a Ouvidoria, o Visualizador do Raio-X e a Gestora do Laboratório no primeiro acesso;
  - a tela "Recepção principal", ativa, com o token `demo-recepcao-fhdod`, e a "Corredor da Internação", desativada.
- **As avaliações** (`prisma/seeds/demonstracao/historico.ts`): o gerador do mock, com a semente fixa por dia, dos 120 dias antes de hoje até agora (perto de mil avaliações). Saem pelo celular e pelo totem, em todos os turnos, com perto de 80% normais, e com comentários dos quatro tipos, a maioria elogios, e pedidos de retorno nas notas baixas, com telefones `(51) 90000-XXXX`. Nenhum envio fica depois do instante em que o comando roda.
- **A gravação** (`prisma/seeds/demonstracao/semear.ts`, `semearDemonstracao(prisma, opcoes)`), numa transação, do jeito que a API grava: as senhas com o `gerarHashDaSenha` (argon2id), o token da TV com o `hashDoToken`, os telefones só com os dígitos, cifrados com o `cifrar` e com os 4 últimos em claro, os itens com o texto, o tipo e a categoria da pergunta, e a classificação com o `classificarNota` e os limites lidos das configurações do banco.
- **Rodar de novo** substitui o que é da demonstração, sem duplicar: os setores são achados pelo slug, as contas pelo e-mail e as telas pelo hash do token, e voltam ao que está em `dados.ts`, com os mesmos IDs. As perguntas e as avaliações dos seis setores, também as respondidas depois, são apagadas e geradas outra vez, até hoje. As contas voltam com as senhas de demonstração (e a do primeiro acesso, com a troca pedida), e as sessões abertas delas são encerradas. O que não é da demonstração fica como está.
- **As senhas:** cada conta tem a sua variável (`DEMO_PASSWORD_SUPER_ADMIN`, `_GESTOR`, `_OUVIDORIA`, `_VISUALIZADOR` e `_PRIMEIRO_ACESSO`), conferida pela regra de senha. Sem a variável, vale a senha do repositório; com `NODE_ENV=production`, como na homologação, as cinco são obrigatórias, e a falta de qualquer uma para o comando antes de gravar.
- **No fim**, o comando mostra o que gravou (setores, perguntas, contas, telas, avaliações, período, comentários e pedidos de retorno), os e-mails das contas com o papel de cada uma e a senha (a do repositório, escrita, ou o nome da variável, nunca a senha dela) e o link da TV, montado com a primeira origem do `CORS_ORIGIN`.
- **`lerConfiguracoes(banco = prisma)`:** a leitura das configurações aceita o cliente de uma transação, para a demonstração classificar com os limites do mesmo banco que grava. Quem a chamava sem argumento continua igual.
- **Documentação:** a seção "Dados de demonstração" no README, com as contas e o link da TV; as variáveis no `.env.example`; e, no `AGENTS.md`, o comando na tabela, a seção do modelo de dados e os arquivos em "Onde estão as coisas".
- **Testes:** são 610 (eram 587), em 52 arquivos. O `tests/integration/demonstracao.test.ts` (23) confere:
  - o que é gravado: os setores, as perguntas e a ordem, as contas com a senha só em hash e o login de cada uma pela API, a TV pelo token conhecido e a desativada com 401, o período até hoje sem envio no futuro, os canais, os turnos, as classificações, os tipos de comentário, os telefones (cifrados, revelados pela rota da Ouvidoria), os itens copiados das perguntas, a classificação pela regra da API e o painel com o escopo de cada conta;
  - rodar de novo: tudo de volta ao que era, com os mesmos IDs e as mesmas avaliações; o período andando para o novo dia de hoje; as sessões encerradas; nada mudado fora da demonstração; e uma avaliação enviada pela pesquisa pública entrando no resumo do dia;
  - as senhas das variáveis, a exigência delas em produção, a senha fora da regra (sem aparecer na mensagem), o banco sem o seed base e a classificação com outros limites no banco;
  - o comando, num processo à parte e numa pasta sem `.env`: sem a confirmação, com a de outro banco e com a do `.env`, nada é gravado; com ela, a saída mostra as contas e o link; em produção, só grava com as cinco senhas, e nenhuma aparece na saída.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| A confirmação é o nome do banco, e não um "sim" | O ticket pede uma confirmação explícita para o comando nunca rodar em produção por engano. Com o nome, quem roda escreve qual banco quer mudar, e uma confirmação que ficou de outro banco não serve. Na verificação, isso aconteceu de verdade: num terminal sem a `DATABASE_URL` do banco descartável, o comando leu o `.env` local e recusou a confirmação, que era do outro banco |
| A confirmação lida antes do `.env`, e só da linha do comando | A homologação e a produção rodam com `NODE_ENV=production`, e nada no ambiente as diferencia. Uma confirmação guardada no `.env` valeria para sempre, e um `.env` copiado de um servidor para o outro a levaria junto |
| Com `NODE_ENV=production`, as cinco senhas das variáveis são obrigatórias | O ticket pede que a homologação, que fica na internet, não use as senhas do repositório. Como ela roda em production, o comando recusa as do repositório ali, em vez de depender de alguém lembrar das variáveis |
| Uma variável por conta, e não uma senha só | Com a mesma senha para todas, quem recebe a conta do Visualizador para testar entraria também como Super Admin, que é só trocar o e-mail |
| As contas, os setores e as telas atualizados no lugar, com os mesmos IDs | As contas não podem ser apagadas: a auditoria e as telas apontam para elas (`RESTRICT`). Com os mesmos IDs, os links dos gestores aos setores e os endereços da pesquisa continuam valendo, e rodar de novo não duplica nada |
| As perguntas e as avaliações dos seis setores apagadas e geradas outra vez | O ticket pede que rodar de novo substitua tudo e gere até a data atual. As perguntas do mock só voltam ao que eram apagando as que mudaram, e uma pergunta com respostas não pode ser apagada (`RESTRICT`), por isso as avaliações saem primeiro. É a única parte do sistema que apaga perguntas, e só porque são dados de demonstração |
| As senhas voltam às de demonstração, e as sessões das contas caem | Numa apresentação, alguém troca a senha da conta do primeiro acesso; rodar de novo deixa tudo pronto para a próxima. As sessões são encerradas como na troca de senha (`authService.encerrarSessoes`), para nenhuma continuar aberta com a senha que saiu |
| O gerador do mock copiado, com os sorteios na mesma ordem | O ticket pede os mesmos dados do mock. Com a mesma ordem dos sorteios, o mesmo dia dá as mesmas avaliações do mock, uma a uma (ver "Como foi verificado"). Os perfis dos setores ficam pelo slug, os pontos fortes e fracos pelo nome da categoria, e os turnos pela posição: os IDs do banco não precisam ser os do mock |
| O horário de cada turno lido do banco | O mock usava as horas fixas dos turnos provisórios. Lendo o `horaInicio` e o `horaFim`, os envios acompanham os horários oficiais quando o hospital os definir; o turno que passa da meia-noite vai até as 24h, como no mock |
| Hoje entra, até o instante em que o comando roda | O mock parava ontem. O ticket pede as avaliações "até o dia em que o comando roda", e com hoje o dashboard do dia já tem números quando a apresentação começa. O que seria enviado depois de agora fica de fora, e os sorteios de hoje são os mesmos de qualquer hora do dia |
| O comando precisa do seed base, e não cria categorias nem turnos | O ticket pede um comando separado do seed base. As perguntas usam as sete categorias pelo nome: se faltar alguma (o seed base não rodou, ou o nome mudou no painel), o comando para e diz qual |
| A classificação com os limites do banco, lidos na mesma transação | O ticket pede a mesma regra da API: com o `classificarNota` e o `lerConfiguracoes`, um limite mudado no banco vale também para a demonstração |
| Os e-mails `@fhdod.example` e os telefones `(51) 90000-XXXX` | São os do mock. O `.example` é um domínio reservado, que não recebe e-mail; o prefixo 90000 não existe. O ticket pede dados claramente fictícios |
| O consentimento do pedido de retorno na hora do envio | É o que o mock fazia. Na pesquisa, o consentimento é gravado no complemento, segundos depois do envio |
| O token da TV fixo, também na homologação | A TV só recebe números agregados, e aqui são de avaliações inventadas. Com o token conhecido, o link da apresentação é o mesmo do mock (`/tv#demo-recepcao-fhdod`). Quem quiser outro cria uma tela pelo painel |
| Os `INSERT` em lotes de 1.000 linhas e a transação de até 2 minutos | São perto de 5 mil itens: em lotes, nenhum `INSERT` chega perto do limite de parâmetros do PostgreSQL. O comando leva uns 3 segundos, mas o padrão da transação do Prisma é 5 segundos, apertado num servidor mais lento |
| O `lerConfiguracoes` com o cliente opcional | É a única leitura das configurações da API; com o cliente da transação, a demonstração não precisa repetir a regra do valor padrão |

## Ferramentas e skills usadas

- Claude Code, lendo o ticket, o `AGENTS.md`, o seed base, as rotas da pesquisa, do complemento, da TV e do login, e o mock do front (`src/mocks/seed/dados.ts` e `historico.ts` no `fhdod-satisfacao-web`, e as contas que saíram dele no commit `6931b5c`).
- Docker Desktop: o `postgres-teste` na 5433, para a suíte e para um banco descartável (`satisfacao_demo`) da verificação de ponta a ponta.
- O `tsx` da API, para rodar o gerador do front e o da API lado a lado.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o pnpm 12.21.0 e o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, o Prettier, os 610 testes (52 arquivos) e `pnpm build`. O `pnpm openapi:exportar` não mudou o `openapi.json`: nenhuma rota mudou.
- **O mesmo que o mock:** um roteiro rodou o `gerarHistorico` do front (no fuso de Brasília) e o da API com os mesmos setores e perguntas, em três instantes (24/11 ao meio-dia, 25/11 de manhã e 02/03 meia hora depois da meia-noite). As avaliações até ontem saíram iguais, uma a uma: o dia, o setor, o canal, o turno, o NPS, a classificação, o envio, os itens, o comentário e o telefone (947, 960 e 900).
- **O comando, num banco descartável:** `pnpm db:deploy`, `pnpm db:seed` e `pnpm db:demo`. Sem a confirmação, ele recusou e explicou; com ela, gravou 961 avaliações em uns 3 segundos (779 normais, 162 baixas e 20 baixíssimas; 441 pelo totem; os três turnos; 135 elogios, 62 sugestões, 43 reclamações e 19 outros; 28 pedidos de retorno, todos de notas baixas). Rodado de novo, ficou com os mesmos números e os mesmos IDs. Com `NODE_ENV=production` e só uma das senhas, recusou e disse quais faltavam.
- **De ponta a ponta, com o build:** `node dist/server.js` em production, na 3334, sobre esse banco. As cinco contas entraram; cada uma viu os setores do seu escopo no NPS por setor (a Gestora, os dois dela; o Visualizador, só o Raio-X); a conta do primeiro acesso recebeu o 403 da troca de senha; a TV abriu pelo `demo-recepcao-fhdod`, com os números do mês e três destaques, e a tela desativada deu 401; a Ouvidoria listou os 28 pedidos de retorno, com o telefone mascarado, e revelou um `51900002400`; e a pesquisa da Internação abriu com as 9 perguntas ativas. O banco foi apagado no fim.
- **Os testes pegam o erro:** um roteiro quebrou 14 regras, uma de cada vez, e rodou os testes da demonstração. Na primeira rodada, pegou 13. A que escapou, **a confirmação lida depois do `.env`**, mostrou um buraco no teste: ele passava ao comando a `DEMO_CONFIRM` vazia, e o `.env` não troca uma variável que já existe, nem vazia, então a linha do `.env` nunca era lida. O teste passou a tirar a variável do ambiente, e a mutação foi pega. As outras 13: sem conferir a confirmação; produção sem exigir as variáveis; a falta de variável ignorada; os limites padrão no lugar dos do banco; as avaliações antigas não apagadas; a troca de senha que não volta; as sessões que não caem; o token da TV sem hash; o último acesso da tela que não volta; o telefone sem cifra; só avaliações pelo celular; a classificação sem as notas; e envios depois de agora.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **Os setores de exemplo:** a estrutura de pastas do plano põe "setores de exemplo" no `seed.ts`. Eles ficaram nos dados de demonstração, com o resto do mock, e o seed base, que roda em produção, continua sem setores.
- **Hoje no histórico:** o mock parava ontem; a demonstração vai até o instante em que o comando roda.
- **Os dias que passaram mudam um pouco num outro dia:** a tendência de cada setor (o Pronto Atendimento melhorando, o Ambulatório piorando) vai do começo ao fim do período, como no mock. Rodado no mesmo dia, o comando grava sempre as mesmas avaliações; num outro dia, o período anda, e as avaliações dos dias em comum também mudam um pouco. O ticket pede a semente fixa e o período até a data atual, e as duas coisas valem.

## Pendências e dúvidas

- **Nunca em produção:** os setores de demonstração são achados pelo slug. Num banco do hospital com um setor `pronto-atendimento` ou `internacao`, o comando apagaria as perguntas e as avaliações dele. A confirmação com o nome do banco é a trava, e o README avisa.
- **Ticket 19 (imagem Docker):** o `tsx`, que roda o `pnpm db:seed` e o `pnpm db:demo`, é dependência de desenvolvimento. A imagem de produção precisa trazê-lo (ou um build dos dois comandos), ou a homologação roda os comandos de fora do container, apontando para o banco.
- **Ticket 20 (homologação):** carregar os dados com as cinco `DEMO_PASSWORD_*` definidas e `DEMO_CONFIRM=<nome do banco>` na linha do comando.
- **Front:** o README do front ainda diz que a API não tem dados de demonstração (ticket 12 daqui) e manda cadastrar tudo pelo painel. Pode apontar para o `pnpm db:demo`, com as contas desta entrega.
- **Turnos oficiais:** o gerador dá a cada turno o peso da mesma posição no mock (manhã, tarde e noite). Se o hospital definir mais de três turnos, os que passarem do terceiro ficam sem avaliações de demonstração.
