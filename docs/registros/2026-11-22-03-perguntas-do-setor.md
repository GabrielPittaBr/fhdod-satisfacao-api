# Perguntas do setor

22/11/2026 · Agente (Claude Code)

> Ticket [08](../tickets/08-perguntas-do-setor.md), issue [#8](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/8). O gestor monta a pesquisa dos seus setores, e o Super Admin a de qualquer setor: cria perguntas, edita o texto, a categoria, o tipo e as opções, muda a ordem e ativa ou desativa. Nada é apagado, e uma pergunta que já tem respostas não muda de tipo.

## O que foi feito

- **Rotas** (`src/modules/perguntas/`, nas camadas de sempre), todas com `perguntas:gerenciar` (Super Admin e Gestor):
  - `GET /setores/:setorId/perguntas`: as perguntas do setor, ativas e inativas, na ordem (no empate, a mais antiga), em `{ data: Pergunta[] }`, sem paginação. O `temRespostas` diz se já existe algum item de resposta da pergunta.
  - `POST /setores/:setorId/perguntas`: cria a pergunta, ativa, no fim da ordem do setor (a maior posição + 1), e responde 201 com a `Pergunta`.
  - `PATCH /perguntas/:id`: recebe a pergunta inteira (texto, categoria, tipo e opções) e responde 200 com a `Pergunta`; a ordem e a situação não mudam.
  - `PUT /setores/:setorId/perguntas/ordem`: recebe `{ ids }` com todas as perguntas do setor na nova ordem e responde 204.
  - `PATCH /perguntas/:id/status`: recebe `{ ativa }`, um booleano de verdade, e responde 204.
- **Escopo:**
  - Nas três rotas com `:setorId`, o `setorScope` barra o setor que não é do Gestor: 403 "Você não tem acesso a este setor.", também para um setor que não existe ou um ID que não é número.
  - Nas duas rotas pelo ID da pergunta, o service busca a pergunta e confere o setor dela com o `podeAcessarSetor`: 404 "Pergunta não encontrada." se ela não existe, 403 com a mesma mensagem do `setorScope` se é de outro setor.
  - Para o Super Admin, setor inexistente dá 404 "Setor não encontrado." na listagem, na criação e na ordem.
- **Validação**, a mesma na criação e na edição:
  - **Texto:** de 5 a 140 caracteres, sem os espaços das pontas, com as mensagens do formulário do front ("Escreva a pergunta" e "Use no máximo 140 caracteres: perguntas curtas são mais respondidas").
  - **Categoria:** precisa existir ("Escolha uma categoria") e estar ativa ("Esta categoria está desativada. Escolha outra."). Na edição, a categoria que a pergunta já tem vale mesmo desativada.
  - **Tipo:** um dos quatro ("Escolha o tipo da pergunta").
  - **Opções:** na múltipla escolha, de 2 a 5, cada uma com até 80 caracteres, sem os espaços das pontas e sem repetir, nem com maiúsculas diferentes. Nos outros tipos, `opcoes` vem `null`, vazia ou de fora, e a API devolve `null`; uma lista com opções dá 400. Todo erro das opções vai no campo `opcoes`, que é onde o formulário do front o mostra.
- **Tipo travado:** mudar o tipo de uma pergunta com respostas dá 409 com "Esta pergunta já tem respostas, então o tipo não pode mudar. Crie outra pergunta e desative esta.". O texto, a categoria e as opções continuam editáveis, porque cada item da resposta guarda o texto, o tipo e a categoria que o paciente viu.
- **Ordem:** a lista precisa ter cada pergunta do setor, ativa ou inativa, uma vez só. Faltando, sobrando, repetindo ou com pergunta de outro setor, dá 400 em `ids` com "A lista precisa ter todas as perguntas do setor". As perguntas ficam nas posições 1, 2, 3..., e só as que mudam de posição são gravadas.
- **Auditoria**, na mesma transação da mudança, com o usuário e o IP:
  - `criacao_de_pergunta`, com o conteúdo da pergunta;
  - `edicao_de_pergunta`, com o `antes` e o `depois`;
  - `reordenacao_de_perguntas`, com a ordem de antes e a de depois (`entidadeId` nulo: a mudança mexe em várias linhas);
  - `alteracao_de_status_de_pergunta`, com a `ativa` nova.

  Todas levam o `setorId` em `dados`. Um pedido que não muda nada (a mesma pergunta, a mesma ordem ou a mesma situação) responde como os outros, mas não grava nem vai para a auditoria.
- **Peças compartilhadas:**
  - `linhaDeAuditoria` (`src/database/auditoria.ts`): a linha da auditoria a partir de quem fez (`Autor`) e do que aconteceu, para o ticket 09 e os seguintes.
  - `TIPOS_DE_PERGUNTA` (`src/shared/constants/tipos-de-pergunta.ts`): os tipos do banco, para os schemas daqui e da pesquisa pública (ticket 10).
  - `idNoCorpo` (`src/shared/http/parametros.ts`): o ID no corpo de um pedido, como o `categoriaId` e os `ids` da ordem.
  - `MENSAGEM_FORA_DO_SETOR` (`src/shared/security/acesso.ts`): o texto do 403 do `setorScope`, agora usado também pelo service.
- **Contrato:** as 5 rotas no Swagger e no `openapi.json`, na tag "Perguntas", com os schemas `Pergunta` e `TipoPergunta` no formato dos tipos do front e os erros de cada rota com as mensagens reais.
- **Testes:** são 258 (eram 233).
  - `tests/integration/perguntas.test.ts` (23 testes):
    - **Permissão e escopo, em cada rota:** o 401, o 403 para Ouvidoria e Visualizador mesmo no próprio setor e o 403 do Gestor fora dos seus setores (inclusive num setor que não existe), sem gravar nada nem na auditoria.
    - **Listagem:** a ordem com empate, as inativas, o formato exato, as opções só na múltipla escolha, o `temRespostas`, a lista vazia, o 404 e o ID inválido.
    - **Criação:** o fim da ordem só do setor, com buracos e com a última inativa; o 201 e a linha da auditoria com o IP; as opções em cada tipo (nove casos inválidos); o texto nas pontas de 5 e 140; a categoria inexistente, em texto, zero e desativada; o tipo desconhecido; o Super Admin num setor inativo e o 404.
    - **Edição:** a troca dos quatro campos com o antes e o depois na auditoria; a volta à escala sem opções; o 409 de cada tipo numa pergunta com respostas, com o texto antigo preservado no item; a categoria desativada mantida e a recusada; a edição sem mudança; a edição parcial recusada; o 404 e o ID inválido.
    - **Ordem:** a nova ordem com as inativas, sem regravar a que ficou no lugar; sete listas erradas; os tipos errados; a mesma ordem sem gravar; o setor vazio e o 404.
    - **Situação:** desativar e ativar com a resposta preservada, a segunda desativação sem linha na auditoria, os valores que não são booleanos e o 404.
  - `src/shared/constants/tipos-de-pergunta.test.ts`: os tipos são os do banco.
  - As factories `criarPergunta` e `criarResposta`, para este ticket e os da pesquisa e do dashboard, e o teste de contrato confere os schemas `Pergunta` e `TipoPergunta`.
- `AGENTS.md`: as perguntas em "Modelo de dados", o `idNoCorpo`, a mensagem do 403 no service, o `linhaDeAuditoria`, as factories novas e o módulo em "Onde estão as coisas". Ticket 08 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| `PATCH /perguntas/:id` recebe a pergunta inteira | As opções dependem do tipo: numa edição parcial, um pedido só com o tipo, ou só com as opções, teria de ser combinado com o que está gravado. O formulário do front manda os quatro campos sempre, e o mesmo schema vale para a criação, como no `PATCH /turnos/:id` (registro 07) |
| A categoria precisa estar ativa, menos a que a pergunta já tem | O registro 07 deixou a regra para este ticket. A categoria desativada saiu da comparação entre setores, e o formulário do front só oferece as ativas (e a atual, na edição). Com a regra na API, uma categoria desativada enquanto o formulário estava aberto vira um erro no campo, e não uma pergunta nova numa categoria aposentada. A pergunta antiga continua com a sua, e o gestor pode corrigir o texto sem trocá-la |
| Opções com até 80 caracteres, sem repetir nem com maiúsculas diferentes | O ticket diz só "de 2 a 5 opções sem repetir". "Sim" e "sim" seriam o mesmo botão para o paciente, e o mock do front já compara sem maiúsculas. Os 80 caracteres evitam botões de parágrafo (o texto da pergunta vai até 140) e põem um teto no que o banco guarda, como nos outros cadastros |
| Todo erro das opções no campo `opcoes`, e não em `opcoes.1` | O `aplicarErroDaApi` do front só põe no formulário os erros com o nome de um campo dele; `opcoes.1` iria para o topo do formulário com a mensagem genérica |
| Opção vazia dá 400, e não é descartada | O formulário do front já tira as linhas vazias. Se uma chega à API, é engano de quem chamou, e gravar menos opções do que as enviadas esconderia o erro |
| Fora da múltipla escolha, `opcoes` aceita `null`, a lista vazia ou nada, mas recusa uma lista com opções | O ticket diz que nos outros tipos `opcoes` é `null`. A lista vazia não traz opção nenhuma; já uma lista com opções num "sim ou não" é engano, e ignorá-la em silêncio também esconderia o erro |
| `temRespostas` pelo `some` do Prisma, e não pelo `_count` | O `_count` conta todos os itens de cada pergunta, e `resposta_itens` é a tabela que mais cresce: uma linha por pergunta respondida. O `some` só pergunta se existe algum, usando o índice de `resposta_itens.pergunta_id` |
| Um pedido que não muda nada não grava nem vai para a auditoria | A auditoria registra mudanças. O front alterna o botão de ativar e salva a ordem a cada arrasto: dois cliques, ou um arrasto que devolve a pergunta ao lugar, encheriam a auditoria de linhas sem mudança. A resposta é a mesma, então o front não precisa saber |
| Na nova ordem, só as perguntas que mudam de posição são gravadas | O `atualizado_em` das outras continua dizendo quando elas mudaram de verdade. Com a mesma sequência, nada é gravado, mesmo que a numeração tenha buracos: a sequência é o que o paciente vê |
| A ordem na auditoria com `entidadeId` nulo e o `setorId` em `dados` | A mudança mexe em várias linhas de `perguntas`, e `entidade` continua sendo a tabela, como no `AGENTS.md`. O `setorId` vai em todas as linhas das perguntas, para a consulta da auditoria (fase 2) poder filtrar por setor |
| A edição guarda o conteúdo inteiro de antes e de depois | São quatro campos curtos. Com os dois lados completos, quem lê a auditoria vê o que a pergunta era e o que passou a ser numa linha só |
| Nomes das ações no padrão `<acao>_de_<entidade>` | O mesmo de `troca_de_senha` e da sugestão do registro 06 (`alteracao_de_status_de_setor`) |
| Pergunta de outro setor dá 403, e pergunta inexistente, 404, também para o Gestor | O `AGENTS.md` pede o 403 fora do setor, com o setor conferido no service. Os IDs são sequenciais, então o 404 não revela nada que valha esconder |
| A troca de tipo é conferida antes de gravar, sem trava no banco | Uma resposta enviada no mesmo instante da troca ainda guarda no item o tipo que o paciente viu, então o histórico não perde o sentido. Uma trava completa precisaria do envio da pesquisa (ticket 10) participando dela |
| 404 do setor inexistente antes de listar, criar e ordenar | Sem ele, o Super Admin receberia a lista vazia de um setor que não existe, e a criação falharia na chave estrangeira, com 500 |
| A categoria inexistente dá 400 em `categoriaId`, e não 404 | O problema está no que foi enviado, e o front mostra o erro no próprio campo. É a mensagem do mock ("Escolha uma categoria") |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("Endpoints da API", "Modelo de dados", "Perfis e permissões", "Painel" e "Riscos"), os tickets 08, 09 e 10, o `AGENTS.md`, os registros 06 e 07 e, no front, `src/lib/api/tipos.ts`, `src/mocks/cadastros.ts`, `src/mocks/pesquisa.ts`, `src/features/perguntas/` e o `aplicarErroDaApi` de `src/lib/salvar.ts`.
- Docker Desktop: o `postgres-teste` na 5433 para a suíte e, na verificação de ponta a ponta, um banco descartável no mesmo container, apagado no fim.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 258 testes (25 arquivos), `pnpm build` e o Prettier. O `pnpm openapi:exportar` gerou o `openapi.json` desta entrega.
- **Os testes pegam o erro:** um roteiro quebrou 50 regras, uma de cada vez, e conferiu que algum teste de `perguntas.test.ts` falhou em cada uma.
  - **Lista e formato:** a ordem pelo ID, o desempate invertido, a lista vazia no lugar do `null` nas opções, o `temRespostas` invertido ou sempre falso.
  - **Criação:** a posição pela maior de todos os setores, a posição sempre 1, sem a auditoria, sem o IP, sem o 404 do setor e sem conferir a categoria.
  - **Regras:** a categoria desativada aceita e a atual recusada; o tipo que muda com respostas; a edição sem escopo; a edição sem mudança que grava; a comparação que olha só o texto; as listas da ordem incompletas ou com outra pergunta aceitas; a mesma ordem e a mesma situação gravadas; a situação sem escopo; o antes errado e o `setorId` ausente na auditoria.
  - **Validação:** o texto sem trim, com mínimo 4 ou máximo 141; as opções sem trim; 1 ou 6 opções; a opção vazia ou de 81 caracteres; a repetição só com as mesmas maiúsculas; opções aceitas fora da múltipla escolha e a lista vazia recusada; o `categoriaId` e a `ativa` convertidos de texto.
  - **Rotas:** cada uma das 5 sem o `authorize` e as 3 com `:setorId` sem o `setorScope`.
  - Na primeira rodada, a `ativa` convertida de texto passou, porque o roteiro mexeu no schema de saída, que só documenta. Refeita no schema da rota, o teste falhou como devia.
  - Antes do roteiro, uma revisão dos testes acrescentou três conferências que deixariam passar uma regra quebrada: o texto de 4 caracteres, o `atualizado_em` da pergunta que não muda de posição e as opções `null` na auditoria dos tipos sem opções.
- **De ponta a ponta,** com o build (`node dist/server.js`) num banco descartável, `prisma migrate deploy` e o seed base. Entraram o Super Admin do seed, depois da troca da senha provisória, e uma gestora do Raio-X criada direto no banco (o cadastro de usuários é do ticket 09). As chamadas foram feitas pelo `fetch` do Node, para os acentos irem em UTF-8:
  - a gestora criou as três perguntas nas posições 1, 2 e 3, sem os espaços das pontas e com os acentos das opções ("Não", "Às vezes") intactos;
  - as opções "Sim" e "SIM" e a categoria desativada deram 400 nos campos certos;
  - no Laboratório, que não é dela, a criação e a listagem deram 403;
  - a ordem incompleta deu 400, e a nova ordem, 204, com o `GET` já na ordem nova;
  - com uma resposta gravada no banco, trocar a escala por texto deu 409, e trocar só o texto deu 200, com `temRespostas: true` e o texto antigo preservado no item;
  - desativar deu 204 duas vezes, com uma linha só na auditoria;
  - o setor inexistente deu 404 ao Super Admin, e a chamada sem login, 401;
  - a auditoria ficou com as seis linhas esperadas (as três criações, a ordem, a edição e a situação), com o `setorId`, o usuário e o antes e o depois da edição.
- O banco de desenvolvimento não foi usado, e o Swagger não foi aberto no navegador: o teste de contrato confere que o documento tem as 5 rotas.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **Regras além do ticket:** a categoria precisa estar ativa (menos a que a pergunta já tem), cada opção tem até 80 caracteres, a repetição não diferencia maiúsculas e uma lista com opções fora da múltipla escolha dá 400.
- **O plano diz "Edita texto, categoria ou opções"** no `PATCH /perguntas/:id`; o ticket pede também o tipo, e a rota recebe os quatro campos juntos.
- **Arquivos que não estão na "Estrutura de pastas":** `src/database/auditoria.ts`, `src/shared/constants/tipos-de-pergunta.ts`, `tests/factories/perguntas.ts` e `respostas.ts`. Como nos tickets 06 e 07, as regras do service dependem do banco e ficaram nos testes de integração, sem um `perguntas.service.test.ts`.

## Pendências e dúvidas

- **Front:** o ticket que liga a tela de perguntas troca o `src/mocks/cadastros.ts` por estas rotas. O `POST` responde 201, e os formatos são os do mock. As diferenças:
  - a API recusa a opção vazia, que o mock descarta (o formulário já tira as linhas vazias);
  - a API recusa a categoria desativada, que o mock aceita (o formulário já não a oferece);
  - a quantidade de opções tem a mensagem "Escreva de 2 a 5 opções", sem o "uma por linha" do formulário, que é da tela;
  - para o Gestor, um setor que não é dele dá 403 mesmo se não existir; o mock dá 404 antes.
- **Ticket 10:** o envio da pesquisa precisa conferir cada item pelo tipo atual da pergunta. Uma pergunta sem respostas pode mudar de tipo enquanto um paciente está com a pesquisa aberta, e só as perguntas ativas entram na pesquisa.
- **Mais de 8 perguntas ativas:** o aviso é do front, como no plano ("sem bloquear"); a API não limita.
- **Duas criações ao mesmo tempo** no mesmo setor podem sair com a mesma posição, como nas categorias. O empate é resolvido pelo ID, e a próxima ordem salva renumera tudo.
- **Auditoria:** a consulta é da fase 2. As linhas das perguntas já trazem o `setorId` para o filtro por setor.
