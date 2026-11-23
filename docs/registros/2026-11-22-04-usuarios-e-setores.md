# Usuários e seus setores

22/11/2026 · Agente (Claude Code)

> Ticket [09](../tickets/09-usuarios-e-setores.md), issue [#9](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/9). O Super Admin cria as contas do painel com uma senha provisória, mostrada uma única vez, define o perfil e os setores de cada pessoa, desativa quem saiu e redefine a senha de quem esqueceu. Desativar ou redefinir a senha derruba na hora as sessões abertas da pessoa.

## O que foi feito

- **Rotas** (`src/modules/usuarios/`, nas camadas de sempre), todas com `usuarios:gerenciar` (só o Super Admin):
  - `GET /usuarios`: todas as contas, ativas e inativas, em ordem alfabética, em `{ data: Usuario[] }`, sem paginação. O `Usuario` é `{ id, nome, email, perfil, ativo, trocarSenha, setorIds, ultimoLoginEm }`, com os setores em ordem de ID e o último login em ISO (UTC) ou `null`.
  - `POST /usuarios`: cria a conta, ativa, sem setores e com a troca de senha obrigatória, e responde 201 com `{ usuario, senhaProvisoria }`.
  - `PATCH /usuarios/:id`: muda o nome, o perfil ou os dois e responde 200 com o `Usuario`. O e-mail não muda: um `email` no corpo é ignorado.
  - `PUT /usuarios/:id/setores`: recebe `{ setorIds }`, que substitui os setores de antes, e responde 204.
  - `PATCH /usuarios/:id/status`: recebe `{ ativo }`, um booleano de verdade, e responde 204.
  - `POST /usuarios/:id/redefinir-senha`: gera outra senha provisória e responde 200 com `{ senhaProvisoria }`.
- **Senha provisória** (`gerarSenhaProvisoria`, em `src/shared/security/senha-provisoria.ts`): 12 caracteres sorteados pelo gerador criptográfico do Node, em 3 grupos (`Kp7m-Qx3r-Tz9w`), sem 0, O, 1, l e I, e sempre dentro da regra de senha. O banco guarda só o hash argon2id. Ela aparece só nas respostas da criação e da redefinição, as duas com `Cache-Control: no-store`, e o logger a oculta como as outras senhas.
- **Validação:**
  - **Nome:** de 3 a 100 caracteres, sem os espaços das pontas ("Informe o nome completo", a mensagem do formulário do front).
  - **E-mail:** válido, com até 254 caracteres, e gravado em minúsculas ("Digite um e-mail válido, como nome@hospital.com.br", a mesma do login). E-mail repetido, mesmo com outras maiúsculas ou de uma conta inativa, dá 409 com "Já existe um usuário com este e-mail.".
  - **Perfil:** um dos quatro ("Escolha um perfil").
  - **Setores:** IDs de setores cadastrados, ativos ou inativos. Os repetidos contam uma vez, e a lista vazia tira todos. Setor inexistente dá 400 em `setorIds`, com "Um dos setores escolhidos não existe.".
  - Conta inexistente dá 404, "Usuário não encontrado.".
- **Sessões:** desativar e redefinir a senha revogam todos os refresh tokens da pessoa, na mesma transação da mudança. O token de acesso que ainda está no prazo também deixa de valer, porque o `authenticate` lê do banco que a conta está inativa ou com a senha provisória.
- **A própria conta:** ninguém desativa a própria conta (409, "Você não pode desativar a própria conta."), como pede o ticket, nem muda o próprio perfil (409, "Você não pode mudar o próprio perfil.").
- **A mudança vale na hora:** o perfil e os setores novos valem já na próxima requisição da pessoa, com o mesmo token, que só leva o ID.
- **Auditoria**, na mesma transação da mudança, com o usuário e o IP:
  - `criacao_de_usuario`, com o nome, o e-mail e o perfil;
  - `alteracao_de_perfil`, com o `antes` e o `depois`;
  - `alteracao_de_setores_do_usuario`, com os setores de antes e os de depois;
  - `alteracao_de_status_de_usuario`, com o `ativo` novo;
  - `redefinicao_de_senha`, sem `dados`.

  Nenhuma senha vai para a auditoria. A troca só do nome não vai para ela, e um pedido que não muda nada responde como os outros, mas não grava nem registra.
- **Peças mudadas:** o `perfilSchema` (`auth.schemas.ts`) ganhou a mensagem "Escolha um perfil", o `linhaDeAuditoria` aceita a linha sem `dados` e o logger oculta `senhaProvisoria`.
- **Contrato:** as 6 rotas no Swagger e no `openapi.json`, na tag "Usuários", com o schema `Usuario` no formato do tipo do front e os erros de cada rota com as mensagens reais.
- **Testes:** são 279 (eram 258).
  - `tests/integration/usuarios.test.ts` (18 testes):
    - **Permissão:** o 401 e o 403 para Gestor, Ouvidoria e Visualizador nas 6 rotas, sem mudar nada nem gravar na auditoria.
    - **Listagem:** a ordem alfabética com acento e minúscula, o formato exato, sem a senha, os setores em ordem e o último login.
    - **Criação:** o 201 com o e-mail em minúsculas, a troca obrigatória, o `no-store`, só o hash no banco e a senha fora da auditoria; o primeiro acesso com a senha provisória, o 403 do painel até a troca e o painel depois dela; o 409 com outras maiúsculas e de uma conta inativa; onze casos inválidos e o nome de 3 caracteres.
    - **Edição:** o nome e o perfil com o e-mail ignorado, o perfil novo valendo no token de antes e a auditoria; só o nome, só o perfil e a edição sem mudança; o 409 do próprio perfil; a edição vazia, os valores inválidos, o 404 e o ID inválido.
    - **Setores:** a troca com repetido e inativo, o escopo novo no mesmo token e a auditoria; o setor inexistente, a mesma lista sem auditoria e a lista vazia; os corpos inválidos e o 404.
    - **Situação:** as duas sessões derrubadas (o refresh e o token de acesso), o login recusado e o de volta depois de ativar; o 409 da própria conta; a mesma situação sem gravar; os valores que não são booleanos e o 404.
    - **Redefinição:** a senha antiga recusada, a nova com a troca obrigatória, a sessão antiga derrubada, o `no-store` e a auditoria sem senha; o 404 e o ID inválido.
  - `src/shared/security/senha-provisoria.test.ts`: o formato, a regra, os caracteres que se confundem e 500 senhas sem repetição.
  - `tests/integration/middlewares.test.ts`: o log oculta a `senhaProvisoria`. O teste de contrato confere o schema `Usuario`.
- `AGENTS.md`: as sessões derrubadas na transação, a senha provisória, as regras da própria conta, a auditoria dos usuários e o módulo em "Onde estão as coisas". Ticket 09 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| A branch sai da do ticket 08, e não da `develop` | Os dois tickets mexem nos mesmos arquivos (`openapi.json`, `routes.ts`, `openapi.ts`, o teste de contrato e o `AGENTS.md`), e o 09 usa o `linhaDeAuditoria` do 08. Saindo da `develop`, os dois PRs entrariam em conflito; assim, depois que o 08 entrar, o PR do 09 mostra só o que é dele |
| Ninguém muda o próprio perfil | O ticket proíbe desativar a própria conta para o Super Admin não ficar de fora. Rebaixar o próprio perfil tem o mesmo efeito: o acesso aos usuários some na hora, e o seed só cria um Super Admin num banco sem usuários. Com as duas regras, sempre sobra um Super Admin ativo: quem fez a mudança |
| A senha provisória tem 12 caracteres em grupos, sem os que se confundem | A pessoa recebe a senha de outra, anotada ou ditada, e a digita. Os grupos e a falta de 0, O, 1, l e I evitam erros de leitura; 12 caracteres de um alfabeto de 56 dão cerca de 70 bits, para uma senha que vale até o primeiro acesso |
| As respostas com a senha não ficam em cache, e o logger a oculta | A senha só pode aparecer uma vez. O `no-store` impede que o navegador ou um proxy a guardem, e a chave `senhaProvisoria` entrou na lista do logger, para nem um log descuidado a mostrar |
| As sessões caem na mesma transação da mudança | A conta desativada ou com a senha redefinida nunca fica com uma sessão viva, nem se a gravação parar no meio. O `authService.encerrarSessoes`, que o `AGENTS.md` indicava para este ticket, roda fora da transação; a consulta é a mesma |
| `PATCH /usuarios/:id` parcial: o nome, o perfil ou os dois | O plano diz "Edita nome e perfil", e os dois campos não dependem um do outro, como nos setores e nas categorias. O formulário do front manda os dois e funciona igual |
| A troca só do nome não vai para a auditoria | O ticket pede o perfil, os setores, a situação e a senha: as mudanças de acesso. O nome não muda o que a pessoa pode fazer |
| A criação vai para a auditoria | A conta nasce com um perfil e uma senha, e sem a linha a auditoria não diria quem a criou. Vão o nome, o e-mail e o perfil; a senha, nunca |
| Setores repetidos contam uma vez, e não dão 400 | A lista é um conjunto: repetir um setor não muda o que a pessoa enxerga. O mock do front faz o mesmo |
| Setores inativos podem ser ligados à pessoa | O setor inativo continua no painel com o histórico, e o gestor pode precisar dos indicadores antigos dele. O formulário do front os mostra com "(inativo)" |
| Os setores ficam na conta mesmo quando o perfil não os usa | O Super Admin e a Ouvidoria enxergam todos os setores, e os ligados a eles não mudam nada. O front manda a lista vazia ao trocar para esses perfis; a API guarda o que recebe |
| A redefinição responde 200, e não 201 | Nada novo é criado: a conta é a mesma, com outra senha |
| E-mail com espaços nas pontas dá 400, e não é corrigido | O formulário do front recusa do mesmo jeito, e o login compara o e-mail como foi digitado (só em minúsculas). Corrigir aqui gravaria um login diferente do que a pessoa viu |
| A mensagem do e-mail inválido é a do login | É o mesmo campo, com a mesma regra, nas duas rotas. O formulário do front valida antes e mostra a sua |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("Endpoints da API", "Como funciona o login", "Perfis e permissões" e "Segurança"), os tickets 05 e 09, o `AGENTS.md`, o módulo `auth` e, no front, `src/lib/api/tipos.ts`, `src/mocks/cadastros.ts`, `src/mocks/auth.ts`, `src/features/usuarios/` e o `aplicarErroDaApi` de `src/lib/salvar.ts`.
- Docker Desktop: o `postgres-teste` na 5433 para a suíte e, na verificação de ponta a ponta, um banco descartável no mesmo container, apagado no fim.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 279 testes (27 arquivos), `pnpm build` e o Prettier. O `pnpm openapi:exportar` gerou o `openapi.json` desta entrega.
- **Os testes pegam o erro:** um roteiro quebrou 48 regras, uma de cada vez, e conferiu que algum teste falhou em cada uma.
  - **Lista:** sem a ordem alfabética, com os setores fora de ordem e com o último login sempre nulo.
  - **Criação:** sem a troca obrigatória, sem a auditoria, com a senha mostrada diferente da gravada, sem o 409 do e-mail repetido, com 200 no lugar do 201 e sem o `no-store`.
  - **Edição:** o próprio perfil mudando, o nome apagado quando só o perfil vem, a edição sem mudança gravando e a auditoria do perfil sem mudança de perfil ou com o antes errado.
  - **Setores:** o setor inexistente aceito, os de antes somados aos novos, os repetidos, a lista fora de ordem, a mesma lista gravando e o antes errado na auditoria.
  - **Situação e senha:** a própria conta desativada; a mesma situação gravando; a desativação e a redefinição sem revogar as sessões; uma revogação que não revoga nada; a redefinição sem a troca obrigatória, sem gravar a senha, com a senha mostrada diferente da gravada e sem o `no-store`; a conta inexistente sem 404.
  - **Validação:** o nome com mínimo 2 ou máximo 101, sem trim; o e-mail sem minúsculas; o `ativo` e os `setorIds` convertidos de texto; a edição vazia aceita; o perfil sem a mensagem.
  - **Rotas:** cada uma das 6 sem o `authorize`.
  - **Peças compartilhadas:** a `senhaProvisoria` fora da lista do logger, a senha provisória sem a regra e com os caracteres que se confundem.
  - Uma mutação não achou o trecho, que o Prettier tinha quebrado em várias linhas; refeita no trecho certo, o teste falhou como devia.
  - Antes do roteiro, a revisão dos testes acrescentou a edição só do perfil, que deixaria passar o nome apagado.
- **De ponta a ponta,** com o build (`node dist/server.js`) num banco descartável, `prisma migrate deploy` e o seed base, pelo `fetch` do Node:
  - o Super Admin do seed, depois da troca da senha provisória, criou a Joana com o e-mail em maiúsculas: 201, com o e-mail em minúsculas, a senha de 14 caracteres (3 grupos de 4) e o `Cache-Control: no-store`;
  - o mesmo e-mail em maiúsculas deu 409, e um cadastro todo errado, 400 nos três campos;
  - os setores com o Raio-X repetido deram 204, e com um setor inexistente, 400 em `setorIds`;
  - a Joana entrou com a senha provisória, recebeu 403 no painel até trocá-la e depois viu só o Raio-X;
  - virou Visualizadora, e o token de antes já trouxe as permissões novas;
  - mudar o próprio perfil e desativar a própria conta deram 409;
  - desativada, a Joana teve o refresh e o token de acesso recusados (401), e o login também; ativada de novo, a senha redefinida deu 200 com `no-store`, a senha antiga passou a ser recusada e a nova abriu só a troca de senha;
  - a auditoria ficou com as seis linhas esperadas, e nenhuma das duas senhas provisórias apareceu nela.
- O banco de desenvolvimento não foi usado, e o Swagger não foi aberto no navegador: o teste de contrato confere que o documento tem as 6 rotas.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **Regras além do ticket:** ninguém muda o próprio perfil; o nome tem até 100 caracteres e o e-mail, até 254; as respostas com a senha não ficam em cache.
- **A branch sai da do ticket 08,** e não da `develop` atualizada, como pede o `AGENTS.md`, pelos arquivos em comum (em "Decisões").
- **Arquivo que não está na "Estrutura de pastas":** `src/shared/security/senha-provisoria.ts`. Como nos tickets anteriores, as regras do service dependem do banco e ficaram nos testes de integração, sem um `usuarios.service.test.ts`.

## Pendências e dúvidas

- **PR:** o do ticket 08 entra antes. Até lá, um PR desta branch para a `develop` mostraria também os commits do 08.
- **Front:** o ticket que liga a tela de usuários troca o `src/mocks/cadastros.ts` por estas rotas. O `POST` responde 201, e os formatos são os do mock. As diferenças:
  - o erro de setor inexistente vem em `setorIds`, um campo que o formulário não mostra: com o `aplicarErroDaApi` de hoje, a mensagem não aparece. Vale mostrá-la junto da lista de setores;
  - mudar o próprio perfil dá 409, que o mock não tem; o formulário pode travar o perfil na própria conta;
  - a mensagem do e-mail inválido é a do login, e a do formulário continua aparecendo antes.
- **Senha esquecida pelo único Super Admin:** sem outro Super Admin para redefini-la, só o acesso ao banco resolve. Vale o hospital ter dois.
- **E-mail que muda:** o e-mail não é editável, como pede o ticket. Se uma pessoa trocar de e-mail no hospital, o caminho é criar outra conta e desativar a antiga.
