# Categorias e turnos

22/11/2026 · Agente (Claude Code)

> Ticket [07](../tickets/07-categorias-e-turnos.md), issue [#7](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/7). O Super Admin mantém as categorias, que permitem comparar a mesma etapa do atendimento entre setores (Recepção, Triagem...), e os turnos, que o paciente escolhe na pesquisa e que o totem calcula sozinho pelo horário. Todos os perfis logados leem as duas listas.

## O que foi feito

- **Categorias** (`src/modules/categorias/`, nas camadas de sempre):
  - `GET /categorias`: qualquer perfil logado recebe a lista inteira, com ativas e inativas, em `{ data: Categoria[] }`. A ordem é a do campo `ordem`, e no empate vem a mais antiga. Não há paginação.
  - `POST /categorias`: exige `categorias:gerenciar`. Cria a categoria ativa, no fim da ordem (a maior posição mais 1), e responde 201 com a `Categoria`.
  - `PATCH /categorias/:id`: exige `categorias:gerenciar`. Recebe `{ nome?, ativa? }`: muda o nome, ativa ou desativa, ou faz os dois de uma vez. Responde 200 com a `Categoria`, e a ordem não muda. Sem nenhum dos dois campos, dá 400.
  - **Nome:** os espaços das pontas saem, e precisa ter de 2 a 100 caracteres ("Informe o nome da categoria"). Nome repetido dá 409 `CONFLITO`, "Já existe uma categoria com este nome.", mesmo com outras maiúsculas ou contra uma categoria inativa. Quem detecta é o índice único sobre `lower(nome)` da migration.
  - Categoria inexistente dá 404, "Categoria não encontrada.".
- **Turnos** (`src/modules/turnos/`):
  - `GET /turnos`: qualquer perfil logado recebe todos, em `{ data: Turno[] }`, na ordem do campo `ordem` (e não na do horário), sem paginação.
  - `POST /turnos`: exige `turnos:gerenciar`. Cria o turno no fim da ordem e responde 201.
  - `PATCH /turnos/:id`: exige `turnos:gerenciar`. Recebe o turno inteiro (nome e os dois horários) e responde 200; a ordem não muda. Turno inexistente dá 404, "Turno não encontrado.".
  - **Horários:** formato `HH:mm`, de 00:00 a 23:59, a mesma regra dos CHECKs da tabela ("Informe a hora, como 07:00", em `horaInicio` e em `horaFim`). O fim igual ao início dá 400 em `horaFim`, "O fim precisa ser diferente do início". O fim menor que o início é aceito: é o turno que passa da meia-noite.
  - **Nome:** de 2 a 100 caracteres, sem os espaços das pontas ("Informe o nome do turno").
  - **Sem desativar nem apagar:** não há rota de status nem de exclusão, e um `ativo` mandado na edição é ignorado.
- **`traduzirErroDoPrisma`** (`src/database/erros.ts`): troca o `P2002` e o `P2025` pelo `AppError` com a mensagem da rota e deixa passar o resto. Os services de categorias e turnos o usam, e o de setores passou a usá-lo também, sem mudar o comportamento.
- **Contrato:** as 6 rotas no Swagger e no `openapi.json`, nas tags "Categorias" e "Turnos", com os schemas `Categoria` e `Turno` no formato dos tipos do front e os erros de cada rota com as mensagens reais.
- **Testes:** são 233 (eram 209).
  - `tests/integration/categorias.test.ts` (11 testes):
    - **Listagem:** cada um dos 4 perfis recebe a lista inteira, na ordem, com o empate e a inativa.
    - **Permissão:** o 401 sem login e o 403 para Gestor, Ouvidoria e Visualizador nas rotas de escrita, sem mudar nada no banco.
    - **Criação:** no fim da ordem, inclusive com buracos na numeração e com a última inativa; os espaços das pontas; os nomes inválidos; o 409 com "RECEPÇÃO", "recepção" e "  Recepção " e contra uma inativa.
    - **Edição:** o nome, a situação e os dois juntos; trocar só as maiúsculas do próprio nome; o 409 sem gravar nada da edição recusada; a edição vazia; a `ativa` em texto; o 404 e o ID inválido.
  - `tests/integration/turnos.test.ts` (13 testes):
    - **Listagem e permissão:** os 4 perfis, a ordem que não é a do horário (uma madrugada posta no fim) com empate, o 401 e o 403.
    - **Criação:** no fim da ordem; o turno da meia-noite; as pontas 00:00 e 23:59; oito horas inválidas (`7:00`, `24:00`, `07:60`, `0700`, `07:00:00`, `07h00`, com espaço e vazia); o fim igual ao início; os campos ausentes.
    - **Edição:** o turno inteiro, a edição parcial recusada, o 404, o ID inválido e o `DELETE`, a rota de status e o `ativo` que não existem.
  - As factories `criarCategoria` e `criarTurno`, para os tickets 08 e 10, e o teste de contrato confere os schemas `Categoria` e `Turno`.
- `AGENTS.md`: o `traduzirErroDoPrisma` e o `LC_CTYPE` do índice em "Nome repetido", as factories novas e os módulos em "Onde estão as coisas". Ticket 07 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| `PATCH /turnos/:id` recebe o turno inteiro; o de categorias, só o que muda | O ticket diz que as duas rotas de turnos "recebem o nome e os horários", e o formulário do front manda os três sempre. Na edição parcial, a regra do fim diferente do início teria de comparar com o horário gravado, e um pedido com só um dos horários poderia formar, junto com o outro, um turno sem duração. Para as categorias, o ticket pede `{ nome?, ativa? }`, e o front desativa mandando só a `ativa` |
| A categoria e o turno novos entram em "maior posição + 1", e não em "quantidade + 1" | O mock do front faz assim. Pela quantidade, uma categoria criada depois de buracos na numeração (de uma ordem mudada à mão no banco, por exemplo) cairia no meio da lista. O teste cobre isso |
| Duas criações ao mesmo tempo podem sair com a mesma posição | As duas leem a mesma maior posição. Não há índice único em `ordem`, e o empate é resolvido pelo ID: as duas ficam no fim, na ordem em que foram criadas. Um lock na tabela só para isso não vale a pena com um Super Admin cadastrando |
| A ordem da lista é a do campo `ordem`, e não a do horário | O ticket pede "na ordem", e o front e o totem percorrem os turnos nessa ordem. Por isso o teste põe uma madrugada no fim da lista |
| O nome repetido é barrado pelo índice único sobre `lower(nome)`, sem consultar antes | Como no slug dos setores: o índice não deixa passar duas criações simultâneas, e o `P2002` só pode ser o nome. "Médico" e "Medico" continuam diferentes, porque o `lower()` não tira acento; o ticket fala só de maiúsculas |
| O nome de uma categoria inativa também conta como repetido | A categoria inativa pode voltar, e duas "Recepção" ativas quebrariam a comparação entre setores, que é o motivo de existirem categorias |
| Turnos sem nome único e sem conferir sobreposição de horários | Nenhuma das duas regras está no ticket nem no plano. O totem usa o primeiro turno da ordem que contém o horário, e, fora de todos, o primeiro da lista (`turnoDoHorario`, no front) |
| Mensagem de hora inválida "Informe a hora, como 07:00", a do formulário do front | O mock usa "Informe a hora de início" e "de fim", mas quem a pessoa vê é o formulário, que já mostra esta. A do fim igual ao início é a mesma no mock e no formulário |
| Limite de 100 caracteres no nome da categoria e do turno | O mesmo dos setores: o ticket só dá o mínimo, e sem máximo cabia um nome de 100 kB |
| `traduzirErroDoPrisma` compartilhado, e o service de setores passou a usá-lo | Três services faziam a mesma tradução com mensagens diferentes. O helper deixa só as mensagens em cada um, e a suíte de setores confere que nada mudou |
| Mudanças em categorias e turnos não vão para a auditoria | Como nos setores: a auditoria do plano é de logins, perguntas, permissões, exportações e telefones |
| As listas são de qualquer perfil, sem escopo de setor | Categorias e turnos valem para todos os setores: o gestor precisa das categorias para montar as perguntas (ticket 08), e todos os perfis filtram o dashboard por turno |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("Endpoints da API", "Modelo de dados" e "Perfis e permissões"), os tickets 07, 08, 10 e 12, o `AGENTS.md`, a migration e o seed base e, no front, `src/lib/api/tipos.ts`, `src/mocks/cadastros.ts`, `src/mocks/seed/dados.ts`, `src/features/cadastros/` e o `turnoDoHorario` de `src/features/pesquisa/fluxo.ts`.
- Docker Desktop: o `postgres-teste` na 5433 para a suíte e, na verificação de ponta a ponta, um banco descartável no mesmo container, apagado no fim.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 233 testes (23 arquivos), `pnpm build` e o Prettier. O `pnpm openapi:exportar` gerou o `openapi.json` desta entrega.
- **Os testes pegam o erro:** um roteiro quebrou 23 regras, uma de cada vez, e conferiu que algum teste falhou em cada uma.
  - Categorias: a ordem por nome, o desempate invertido, a posição nova pela quantidade, o 409 e o 404 sem tradução, o nome sem trim, o nome de 1 caractere, a `ativa` convertida de texto, a edição vazia aceita, as 2 rotas de escrita sem o `authorize` e a lista sem login.
  - Turnos: a ordem pelo horário, o desempate invertido, o turno novo sempre na posição 1, o 404 sem tradução, uma hora frouxa (`\d{1,2}:\d{2}`), o fim igual ao início aceito, o nome de 1 caractere, a edição parcial, as 2 rotas de escrita sem o `authorize` e a lista sem login.
  - Na primeira rodada, a ordem pelo horário passou, porque no teste a ordem cadastrada coincidia com a do relógio. O teste ganhou uma madrugada posta no fim da lista e um empate, e passou a pegá-la.
- **De ponta a ponta,** com o build (`node dist/server.js`) num banco descartável, `prisma migrate deploy` e o seed base, as chamadas foram feitas pelo `fetch` do Node, para os acentos irem em UTF-8:
  - As categorias e os turnos do seed vieram na ordem.
  - "  Farmácia " entrou como "Farmácia", na posição 8.
  - "RECEPÇÃO" bateu na "Recepção" do seed, e "médico" na "Médico": 409.
  - Desativar o "Tempo de Espera" deu 200, e o 404 veio com a mensagem.
  - O turno das 23:00 às 05:00 entrou na posição 4. As horas `7:00` e `24:00` e o fim igual ao início deram 400 nos campos certos.
  - A edição do turno deu 200. O `DELETE` deu 404, e a lista sem login, 401.
  - Antes da troca da senha provisória, o `GET /categorias` deu 403.
- O banco de desenvolvimento não foi usado, e o Swagger não foi aberto no navegador: o teste de contrato confere que o documento tem as 6 rotas.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **Limite de 100 caracteres** no nome da categoria e do turno, além do mínimo do ticket.
- **Arquivos que não estão na "Estrutura de pastas":** `tests/factories/categorias.ts` e `turnos.ts`. Como nos setores, as regras dos services dependem do banco (o índice único e a posição nova) e ficaram nos testes de integração, sem um `<modulo>.service.test.ts`.

## Pendências e dúvidas

- **Produção (ticket 19):** o banco precisa de um `LC_CTYPE` UTF-8, como o `postgres:18` do compose (`en_US.utf8`). Com `C`, o `lower()` do índice só muda a caixa das letras sem acento, e "RECEPÇÃO" e "Recepção" passariam como nomes diferentes.
- **Front:** o ticket que liga a tela de cadastros troca o `src/mocks/cadastros.ts` por estas rotas. Os `POST` respondem 201; os formatos e as mensagens são os do formulário.
- **Mudar a ordem** das categorias e dos turnos não tem rota: a posição só é escolhida na criação. Se o hospital quiser reordenar, cabe um `PUT /categorias/ordem`, como o das perguntas no ticket 08.
- **Turnos sobrepostos ou com buracos:** a API aceita. O totem escolhe o primeiro da ordem que contém o horário e, fora de todos, o primeiro da lista. Quando o hospital definir os turnos oficiais, pode valer conferir que cobrem as 24 horas sem sobreposição.
- **Ticket 08:** a categoria da pergunta precisa existir, como diz o critério dele. Se a pergunta nova não puder usar uma categoria inativa, essa regra entra lá.
