# Modelo de dados do MVP

21/11/2026 · Agente (Claude Code)

> Ticket [04](../tickets/04-modelo-de-dados.md), issue [#4](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/4). O banco ganha as 14 tabelas do MVP de uma vez, para os próximos tickets usarem o modelo pronto, e um seed base que pode rodar em produção.

## O que foi feito

- **Schema** (`prisma/schema.prisma`): as 14 tabelas da seção "Modelo de dados" do plano e os 6 tipos enumerados (`perfil`, `tipo_pergunta`, `canal`, `classificacao`, `tipo_comentario` e `status_retorno`). No banco, tabelas, colunas e tipos ficam em snake_case, com `@@map` e `@map`; no código, os nomes do Prisma (`Resposta`, `dataAtendimento`).
- **Tipos do plano:** todo instante em `timestamptz(3)`, `data_atendimento` em `date`, NPS e nota em `smallint`, chave de idempotência em `uuid`, opções das perguntas em `text[]`, configurações e dados da auditoria em `jsonb`.
- **Migration** `20261121221631_modelo_de_dados_do_mvp`: a parte gerada pelo Prisma e, no fim, o SQL escrito à mão com os CHECKs de `nps` (0 a 10), `valor_numero` (1 a 5) e dos horários dos turnos (`HH:mm`), além do índice único sobre `lower(nome)` das categorias.
- **Índices:** os quatro do plano (`respostas(setor_id, enviado_em)`, `respostas(data_atendimento)`, `resposta_itens(categoria_id)` e `contatos_retorno(status)`) e um em cada chave estrangeira usada para buscar registros filhos: `usuario_setores(setor_id)`, `refresh_tokens(usuario_id)`, `perguntas(setor_id)` e `resposta_itens(pergunta_id)`. As chaves que começam uma chave primária ou um índice único (`usuario_setores.usuario_id`, `resposta_itens.resposta_id`, `comentarios.resposta_id`, `contatos_retorno.resposta_id` e `refresh_tokens.substituido_por_id`) já têm índice.
- **Seed base** (`pnpm db:seed`): `prisma/seed.ts` roda o `semearBase`, de `prisma/seeds/base.ts`, que cria as 7 categorias do plano, os turnos provisórios (Manhã das 07:00 às 13:00, Tarde das 13:00 às 19:00 e Noite das 19:00 às 07:00) e as 8 configurações com os valores padrão, que ficam em `src/shared/constants/configuracoes.ts`. No fim, ele diz quantos registros criou.
- **Comandos:** `db:seed` novo, configurado em `migrations.seed` no `prisma7.config.ts`, e `db:reset` passando a rodar o seed depois de recriar o banco. `db:migrate`, `db:deploy` e `db:studio` já existiam e foram conferidos.
- **Banco de teste recriado antes da suíte:** o `tests/setup.ts` confere a conexão, apaga o schema `public` e aplica as migrations com o `prisma migrate deploy`, só num banco com "test" no nome. Helpers novos: `limparBanco()` (`tests/helpers/banco.ts`), que esvazia todas as tabelas e zera os IDs, e `rodarPrisma()` (`tests/helpers/prisma-cli.ts`), que chama o CLI do Prisma pelo Node.
- **Testes:** são 105 (eram 72).
  - `tests/integration/modelo-de-dados.test.ts`: o banco recusa NPS -1 e 11, resposta sem NPS, nota 0 e 6, a mesma pergunta duas vezes numa resposta, categoria com o nome de outra (em qualquer combinação de maiúsculas, com o código `P2002`) e horários fora de `HH:mm`; aceita os limites, o item sem nota e o turno que passa da meia-noite. Também confere as 14 tabelas, os tipos enumerados, os nomes em snake_case, os tipos das colunas, os índices do plano, o índice de cada chave estrangeira e se as migrations estão em dia com o `schema.prisma`.
  - `tests/integration/seed.test.ts`: o que o seed cria, que rodar de novo não cria nem muda nada, que ele não desfaz o que foi mudado depois da instalação, que completa só as configurações que faltam e que o comando `prisma db seed` funciona.
- `AGENTS.md` com a seção "Modelo de dados", os comandos do banco e o banco de teste; README com as migrations e o seed no passo a passo. Ticket 04 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| Horários dos turnos em `varchar(5)` com CHECK de `HH:mm`, e não em `time` | O Prisma lê `time` como `DateTime` do dia 1º/1/1970, e cada leitura e escrita teria de converter para o `HH:mm` que o contrato usa (`Turno.horaInicio` no front). Em texto, o horário sai pronto do banco, e o CHECK continua recusando `24:00` ou `7:00`. Se um relatório precisar comparar horários, `hora_inicio::time` converte no SQL. Não há CHECK de início antes do fim, porque o turno da noite passa da meia-noite |
| CHECKs e índice sobre expressão no fim da própria migration | O plano manda escrevê-los "em SQL na migration", porque o Prisma não os declara. Conferido no Prisma 7.10: o `migrate diff` não os enxerga, e uma migration gerada depois sai vazia, sem tentar apagá-los |
| Só o índice sobre `lower(nome)` nas categorias, sem `@unique` no schema | O índice sobre a expressão já impede o nome repetido; o `@unique` criaria um segundo índice, redundante. O erro chega como `P2002`, igual ao do `@unique`, e o ticket 07 o traduz em 409 |
| `@@unique([respostaId, perguntaId])` em `resposta_itens` | O plano diz "um item por pergunta em cada resposta". O índice único começa pela resposta e faz o papel do `@@index` em `resposta_id` que o plano pede |
| Índice em `resposta_itens.pergunta_id`, que o plano não lista | O ticket 08 bloqueia a troca de tipo de uma pergunta com respostas (`temRespostas`). Sem índice, cada consulta varreria todos os itens, que é a tabela que mais cresce |
| Chaves estrangeiras sem índice listadas, com o motivo, no teste | Ticket: "um índice em cada chave estrangeira usada para buscar registros filhos". As 7 que nenhuma busca usa ficam em `CHAVES_SEM_INDICE`, e uma chave nova sem índice faz o teste falhar: ou ganha `@@index`, ou entra na lista com o motivo |
| Referências em RESTRICT; CASCADE só nas partes da resposta, nas sessões e nos setores do usuário | O plano usa exclusão lógica "para o histórico nunca perder referências". O padrão do Prisma para relação opcional é SET NULL, que apagaria, por exemplo, o autor de uma linha da auditoria. Itens, comentário e pedido de retorno não existem sem a resposta, e o CASCADE simplifica recriar os dados de demonstração (ticket 12) |
| `substituido_por_id` único, com SET NULL | Cada refresh token é trocado por um só, e o Prisma exige a coluna única numa relação 1:1. Com SET NULL, uma futura limpeza dos tokens vencidos pode apagá-los em qualquer ordem |
| `criado_em` e `atualizado_em` nos cadastros (usuários, setores, categorias, turnos, perguntas e telas de TV) | O plano lista os campos principais. A data de criação e a da última mudança não se recuperam depois e ajudam a conferir o histórico junto com a auditoria. As duas têm `DEFAULT CURRENT_TIMESTAMP` no banco, para inserções por SQL |
| `status_retorno` com os 4 valores e `canal` com `WHATSAPP` | São os valores do plano. No MVP, todo pedido nasce `NOVO` (padrão da coluna) e a pesquisa aceita só `WEB` e `TOTEM`; a fase 2 e a 3 não precisam mexer nos tipos |
| `trocar_senha` com padrão `true` | Plano: a conta nasce com senha provisória, e "a troca é obrigatória no primeiro acesso" |
| `auditoria.usuario_id` opcional e `auditoria.ip` em `inet` | Com a coluna obrigatória, uma ação sem usuário logado (feita por um comando do sistema, por exemplo) teria de inventar um usuário para entrar na auditoria. `inet` é o tipo do PostgreSQL para endereço IP e recusa o que não for um |
| `telefone_cifrado` em texto e `telefone_final` em `char(4)` | O formato da cifra (IV, tag e texto cifrado) é decidido no ticket 11, e o texto aceita qualquer codificação. O `char(4)` recusa gravar mais de 4 dígitos em claro por engano |
| Hashes de token em `varchar(64)`, únicos onde a API busca por eles | É o tipo do exemplo do plano (SHA-256 em hexadecimal). O refresh e a autenticação da TV procuram a linha pelo hash, e o único é o índice dessa busca. O token de complemento é conferido na resposta já encontrada pelo ID, então não precisa de índice |
| `opcoes` com padrão `[]` | O Prisma não tem lista opcional. A pergunta que não é de múltipla escolha fica com a lista vazia, e a API devolve `null` ao front, como o contrato pede |
| Seed: categorias e turnos só com a tabela vazia; configurações chave a chave | "Seguro para rodar em produção": um seed que procurasse cada categoria pelo nome recriaria a que o Super Admin renomeou, e voltaria com o turno provisório depois que o hospital confirmasse o horário. Chave a chave, a configuração que uma versão nova trouxer entra sozinha, e as alteradas ficam como estão. Tudo numa transação, para não ficar pela metade |
| Valores padrão das configurações em `src/shared/constants/configuracoes.ts` | O ticket 10 lê as mesmas chaves. Com os padrões num lugar só, o seed e a API não divergem |
| Banco de teste recriado por `DROP SCHEMA public CASCADE` e `prisma migrate deploy`, com a guarda do nome | O Prisma 7 recusa o `migrate reset` quando quem o chama é um agente de IA e pede o consentimento de quem está usando; os agentes também rodam a suíte. O banco de teste é descartável (o `postgres-teste` guarda tudo na memória), e a guarda impede apagar um banco sem "test" no nome por engano. A troca foi escolhida por quem pediu a entrega, nesta sessão |
| Teste com `prisma migrate diff --exit-code` | Pega o schema mudado sem migration nova já no `pnpm test` e no CI, antes do PR |
| Teste do `prisma db seed` de ponta a ponta | Prova que o comando do projeto funciona (configuração, `tsx` e o arquivo de entrada), além da função |
| CLI do Prisma chamado pelo Node (`process.execPath` e `prisma/build/index.js`) nos testes | Não depende do pnpm nem do npx no PATH, nem dos atalhos `.cmd` do Windows: roda igual na máquina e no CI |
| `db:reset` roda o seed em seguida | No Prisma 7, o `migrate reset` não roda mais o seed sozinho. Sem ele, o banco recriado ficaria sem categorias, turnos e configurações |
| Seed configurado em `migrations.seed`, no `prisma7.config.ts` | É onde o Prisma 7 procura o comando do seed; o campo `prisma.seed` do `package.json` era do Prisma 6 |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("Modelo de dados", "Decisões do modelo", "Configurações do sistema", "Estrutura de pastas" e "Perfis e permissões"), os tickets 04 a 20 da API, o `AGENTS.md`, os registros 01 a 05 e, no front, `src/lib/api/tipos.ts` e `src/mocks/seed/dados.ts`.
- O comportamento do Prisma 7.10.1 foi conferido no CLI instalado e no banco: o `migrate dev` não gera mais o cliente, nem o `migrate reset` roda o seed; o `migrate diff` não enxerga os CHECKs nem o índice sobre expressão; e os erros que o adaptador `pg` devolve para CHECK, NOT NULL e único (`P2002`, com o nome do índice).
- Docker Desktop: o banco de desenvolvimento na porta 5434, com o override fora do repositório do [registro 04](2026-11-21-04-verificacao-com-docker.md), e o `postgres-teste` na 5433.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 105 testes (13 arquivos) e `pnpm build`. O `pnpm openapi:exportar` não mudou o `openapi.json`: o contrato não mudou.
- No banco de desenvolvimento: o `pnpm db:migrate` aplicou a migration, e o `prisma migrate diff` do banco para o schema saiu vazio. Uma migration de conferência, gerada em seguida, saiu vazia e foi descartada. O `pnpm db:seed` rodou duas vezes: na primeira, criou 7 categorias, 3 turnos e 8 configurações; na segunda, nenhum registro. O `pnpm db:deploy` respondeu "No pending migrations", e o `pnpm db:studio` abriu em `localhost:5555`.
- As proteções falham quando devem: com `TEST_DATABASE_URL` num banco chamado `producao`, a suíte para antes de conectar. Uma cópia do schema com uma coluna a mais faz o `migrate diff --exit-code` sair com 2, o que reprova o teste. Sem o índice `perguntas_setor_id_idx`, apagado numa transação desfeita em seguida, a consulta das chaves estrangeiras acusa `perguntas.setor_id`.
- O `pnpm db:reset` não foi rodado no banco de desenvolvimento: o Prisma recusa o reset para agentes, e a autorização desta sessão foi só para recriar o banco de teste.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **Horários dos turnos em texto `HH:mm`**, com CHECK. O plano não fixa o tipo; o porquê está nas decisões.
- **Colunas a mais:** `criado_em` e `atualizado_em` nos seis cadastros.
- **`resposta_itens`:** índice único em `(resposta_id, pergunta_id)` no lugar do `@@index` em `resposta_id`, e um índice em `pergunta_id`.
- **Seed:** só a parte do ticket 04. O plano põe no `prisma/seed.ts` também o Super Admin e setores de exemplo: o Super Admin entra no ticket 05 (`SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`), e os setores vão para os dados de demonstração do ticket 12, num comando separado do seed base.
- **Arquivos que não estão na "Estrutura de pastas":** `prisma/seeds/base.ts`, `tests/helpers/banco.ts`, `tests/helpers/prisma-cli.ts` e `src/shared/constants/configuracoes.ts`. O plano prevê um `limites.ts` com os "limites padrão de nota baixa e baixíssima"; o `configuracoes.ts` guarda as 8 configurações, não só os limites.
- **Banco de teste** recriado por SQL e `migrate deploy`, não pelo `migrate reset`.

## Pendências e dúvidas

- **Seed na imagem de produção (ticket 19).** O `pnpm db:seed` roda com o `tsx`, que é dependência de desenvolvimento. A imagem enxuta de produção precisa do seed no build (um `dist/seed.js`, por exemplo) ou de outro jeito de rodá-lo.
- **Horários oficiais dos turnos.** Continuam provisórios até o hospital confirmar, como diz o plano. O Super Admin os corrige pelo painel (ticket 07), e o seed não os devolve ao provisório.
- **Retenção dos telefones (fase 2).** `contatos_retorno.telefone_cifrado` é obrigatório. Quando a rotina de retenção apagar os telefones vencidos, a coluna vai precisar aceitar nulo, ou o pedido inteiro sai. É decisão da fase 2, numa migration nova.
- **Porta 5432 ocupada.** Continua a pendência do [registro 04](2026-11-21-04-verificacao-com-docker.md): nesta máquina, o banco de desenvolvimento rodou na 5434 por um override fora do repositório.
