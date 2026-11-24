# Respostas e pedidos de retorno no painel

24/11/2026 · Agente (Claude Code)

> Ticket [15](../tickets/15-respostas-e-pedidos-de-retorno.md), issue [#15](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/15). A Ouvidoria e os gestores consultam as avaliações uma a uma, com filtros e ordenação, e abrem o detalhe com as perguntas como o paciente viu. A Ouvidoria e o Super Admin veem os pedidos de retorno e revelam o número completo para ligar, e cada revelação fica na auditoria.

## O que foi feito

- **Módulo `respostas`** (`src/modules/respostas/`), com `authenticate` → `authorize('respostas:ver')`:
  - `GET /respostas`: os filtros do painel, todos opcionais (sem `base`, a do atendimento), mais `classificacao`, `comComentario` e `comRetorno`; `pagina` e `porPagina` (padrão 20, até 100); `ordenarPor` (`dataAtendimento`, `enviadoEm` ou `nps`, padrão `enviadoEm`) e `ordem` (`asc` ou `desc`, padrão `desc`). Cada linha vem como `{ id, setorId, setor, canal, dataAtendimento, turno, nps, classificacao, enviadoEm, temComentario, pediuRetorno }`, com o `meta`. O `setorScope('setorId', 'query')` barra o setor de fora, e a consulta aplica o escopo.
  - `GET /respostas/:id`: o resumo da lista mais os `itens` (`perguntaId`, `perguntaTexto`, `categoria`, `tipo`, `valorNumero`, `valorTexto` e `classificacao`, esta só nas notas de 1 a 5), o `comentario` (`{ tipo, texto }` ou `null`) e o `contato` (`{ id, telefoneMascarado, status }` ou `null`). Fora do escopo, 403; inexistente, 404.
- **Módulo `contatos`** (`src/modules/contatos/`), com `authenticate` → `authorize('contatos:ver')`:
  - `GET /contatos`: os pedidos de retorno do consentimento mais recente para o mais antigo, no formato `{ id, respostaId, setor, dataAtendimento, nps, classificacao, comentario, telefoneMascarado, consentimentoEm, status }`, paginados (20 por página), com o período (`inicio`, `fim` e `base`) e o setor.
  - `POST /contatos/:id/revelar-telefone`: decifra o número, grava a linha `revelacao_de_telefone` na auditoria (o usuário, o IP, a hora e, em `dados`, o `respostaId` e o `setorId`) e devolve `{ telefone }`, só os dígitos, com `Cache-Control: no-store`. Inexistente, 404; de um setor fora do escopo, 403.
- **Telefone mascarado:** `mascararTelefone(final)`, em `src/shared/rules/telefone.ts`, monta o `•••• 0042` com os 4 últimos dígitos gravados em claro. A lista e o detalhe nem leem o `telefone_cifrado`; a lista de respostas só diz se houve pedido (`pediuRetorno`).
- **Regras e peças compartilhadas:**
  - `classificarNotaDaEscala(nota, limites)`, em `src/shared/rules/classificar-nota.ts`: a mesma conta que o `classificarNota` faz com cada nota, para o item do detalhe.
  - `STATUS_DE_RETORNO`, em `src/shared/constants/status-de-retorno.ts`, com o teste que o compara com o tipo do banco.
  - `CAMPOS_DOS_FILTROS_DO_PAINEL`, em `src/shared/http/filtros-do-painel.ts`: os campos com tudo opcional, para as listas estenderem.
  - `simOuNaoNaQuery`, em `src/shared/http/parametros.ts`: aceita só `true` e `false` e documenta como `boolean`.
  - `lerConfiguracoes()` saiu do `pesquisa.repository.ts` para `src/database/configuracoes.ts`, para o detalhe das respostas usar sem importar o repository da pesquisa. O `pesquisaRepository.lerConfiguracoes` continua, apontando para ela.
  - O `classificacaoSchema` ganhou a mensagem "Escolha normal, baixa ou baixíssima", para o filtro novo; o documento não muda por isso.
- **Contrato:** as quatro rotas no Swagger e no `openapi.json`, com os schemas `RespostaResumo`, `ItemResposta`, `RespostaDetalhe`, `PedidoRetorno` e `StatusRetorno`, nos nomes dos tipos do front. O diff do `openapi.json` só acrescenta.
- **Testes:** são 479 (eram 443), em 45 arquivos.
  - `tests/integration/respostas.test.ts` (18): o 401, o 403 da senha provisória e o do Visualizador (sem `respostas:ver`, mesmo no seu setor), os três perfis que leem, o Gestor só com os seus setores e o 403 no setor de fora; no detalhe, o 403 de fora, o 404 e o 400 do ID. A lista: o formato, sem o telefone; os 20 por página, outras páginas e a página depois do fim; cada ordenação nos dois sentidos com o desempate pelo ID; o período (pelo atendimento e pelo envio em Brasília), o setor, o turno, o canal e a classificação; com e sem comentário e pedido de retorno; e o 400 de cada filtro. O detalhe: o formato completo, com uma pergunta de cada tipo, o texto e a categoria do momento da resposta (a pergunta muda depois) e a ordem em que foram gravadas; os `null` sem comentário e sem pedido; a classificação de cada nota seguindo os limites das configurações; e a máscara com o `telefone_cifrado` estragado no banco.
  - `tests/integration/contatos.test.ts` (14): o 401, a senha provisória, o Gestor e o Visualizador sem acesso (sem nada na auditoria), o Super Admin e a Ouvidoria com acesso, e um Gestor que ganhe `contatos:ver` continuando preso aos seus setores. A lista: o formato, sem o número nem o cifrado; a ordem pelo consentimento, e não pelo envio; o período, a base, o setor e a paginação; o 400. A revelação: o número completo, o `no-store` e a linha da auditoria (quem, o IP, a hora e os `dados`, sem o número); uma linha a cada revelação; o 404 e o 400, sem linha.
  - Unitários: `classificarNotaDaEscala`, `mascararTelefone` e os status de retorno.
  - A factory `criarResposta` ganhou o pedido de retorno, opcional, gravado como o complemento grava.
- `AGENTS.md`: a seção "Respostas e pedidos de retorno"; as peças novas em "Modelo de dados", "Organização por módulo" e "Login, permissões e escopo de setor" (a auditoria da revelação); a factory; a LGPD; e os módulos em "Onde estão as coisas". Ticket 15 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| A linha da auditoria é gravada antes de o número sair; se ela falhar, o número não sai | O plano manda revelar o telefone "sempre com registro na auditoria" ("LGPD"). Gravar depois deixaria uma revelação sem registro se o banco falhasse no meio |
| Cada revelação grava a sua linha, mesmo do mesmo pedido pela mesma pessoa | A auditoria responde quem viu o número e quando; juntar as repetições esconderia uma consulta |
| `dados` leva o `respostaId` e o `setorId`, nunca o número | A consulta da auditoria (fase 2) filtra por setor sem juntar tabelas, e o `AGENTS.md` proíbe dados pessoais em `dados` |
| A revelação responde com `Cache-Control: no-store` | O número completo não fica no cache do navegador nem de um intermediário, como a senha provisória |
| O telefone revelado sai só com os dígitos (`51999990042`) | É o que o banco cifra, e é o que a tela de contatos do front espera: ela monta o link `tel:+55<dígitos>` e formata o número com o `mascararTelefone` de `src/lib/format.ts` |
| O escopo de setor vale também nos contatos | Hoje só o Super Admin e a Ouvidoria têm `contatos:ver`, e os dois enxergam tudo. Mas o plano deixa em aberto quem pode ver os telefones ("Quem pode ver os telefones de retorno"); se o hospital der a permissão ao Gestor, ele já fica preso aos seus setores. O `AGENTS.md` manda checar escopo sempre na API |
| A classificação de cada nota usa os limites de agora | O banco guarda a classificação da avaliação, feita com os limites do envio, mas não os limites. No MVP eles não mudam (o `PATCH /configuracoes` é da fase 2), então dá o mesmo resultado; ver as pendências |
| Os itens vêm na ordem em que foram gravados, e não na ordem atual das perguntas | O ticket pede as perguntas "como o paciente viu". A pesquisa grava os itens na ordem em que o front os mostrou; a ordem das perguntas pode mudar depois |
| A ordenação usa um mapa fixo de colunas e sentidos | O texto do pedido nunca entra no SQL, e o Zod já recusa o que não está no mapa |
| No empate da ordem, o ID no mesmo sentido | É o que o mock do front faz, e a ordem fica estável entre as páginas |
| O `status` tem os quatro valores do banco no contrato | No MVP vem sempre `NOVO`, mas o fluxo da fase 2 usa os outros. Publicando agora, o tipo não muda quando o fluxo chegar, e o `AGENTS.md` proíbe mudar o tipo de um campo |
| Os contatos aceitam a `base` | O filtro de período é o mesmo do painel, com a mesma escolha entre o dia do atendimento e o do envio; sem ela, vale o atendimento, como nas outras listas |
| `comComentario` e `comRetorno` aceitam só `true` e `false` | O `z.coerce.boolean()` transformaria `"false"` em `true`. No documento, o parâmetro é `boolean`, que os clientes do OpenAPI mandam assim |
| O `lerConfiguracoes()` foi para `src/database/` | Dois módulos usam a leitura. Um módulo não importa o repository de outro |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("Endpoints da API", "Perfis e permissões", "Modelo de dados" e "LGPD"), o ticket 15, o `AGENTS.md`, o registro do ticket 14 e, no front, `src/lib/api/tipos.ts`, `src/mocks/consultas.ts` e `src/mocks/regras.ts`.
- Docker Desktop: o `postgres-teste` na 5433 para a suíte.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o pnpm 12.21.0 e o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 479 testes (45 arquivos), `pnpm build` e o Prettier. O `pnpm openapi:exportar` gerou o `openapi.json` desta entrega, e os parâmetros e schemas novos foram lidos à mão (o `comComentario` sai como `boolean`, a `classificacao` e o `canal` como os componentes de sempre).
- **Os testes pegam o erro:** um roteiro quebrou 32 regras, uma de cada vez, rodou os testes das respostas, dos contatos e das regras novas e conferiu que algum falhou. Pegou todas.
  - **Acesso:** o `authorize` tirado de cada uma das quatro rotas, o `setorScope` das duas listas, o escopo ignorado nas duas consultas e a conferência do setor tirada do detalhe e da revelação.
  - **Lista de respostas:** a ordem invertida, o desempate sempre crescente, o NPS e o atendimento ordenando pelo envio, o `comComentario` invertido, o `comRetorno` e a classificação ignorados, e o total só da página.
  - **Detalhe:** os itens na ordem inversa, a categoria atual da pergunta no lugar da do item, a nota classificada com os limites padrão em vez dos das configurações, os limites da escala trocados e a máscara sem o espaço.
  - **Contatos:** os filtros ignorados, do mais antigo para o mais recente, a ordem pelo envio em vez do consentimento, o total só da página e o comentário sumido.
  - **Revelação:** sem a linha da auditoria, com cache, sem o setor em `dados` e sem o IP.
- O banco de desenvolvimento não foi usado, e o Swagger não foi aberto no navegador.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **Além do ticket:** a `base` nos contatos, o `Cache-Control: no-store` na revelação, os quatro status no contrato e o limite de 100 itens por página nas duas listas (o mesmo das outras).
- **A máscara nas listas:** a lista de respostas não traz telefone nenhum, nem mascarado, só o `pediuRetorno`, como no formato do ticket. A máscara aparece no detalhe e na lista de contatos.

## Pendências e dúvidas

- **Front (telas de respostas e de pedidos de retorno):** as diferenças para o mock:
  - o `status` é o `StatusRetorno`, com os quatro valores, e não só `'NOVO'`;
  - o telefone revelado vem só com os dígitos, como a tela já usa;
  - os contatos são paginados (20 por página) e aceitam `inicio`, `fim`, `base` e `setorId`; o mock devolve todos de uma vez, sem filtros, e a tela de lá lê só o `data`: ligada à API, ela precisa da paginação para ver mais de 20 pedidos;
  - os filtros `comComentario` e `comRetorno` vão como `true` ou `false` na URL.
- **Ticket 17 (Excel):** a aba de respostas mostra os telefones só para quem tem `contatos:ver`. Como lá o número sai inteiro, a exportação com telefones também deve ir para a auditoria, como a revelação.
- **Fase 2 (configurações):** quando os limites de nota passarem a mudar, a classificação de cada item no detalhe vai usar os limites novos, e a da avaliação, os do envio. Se isso incomodar, os limites do envio podem ser gravados com a resposta.
- **Dúvida do plano, ainda aberta:** quem pode ver os telefones de retorno. Hoje, o Super Admin e a Ouvidoria.
