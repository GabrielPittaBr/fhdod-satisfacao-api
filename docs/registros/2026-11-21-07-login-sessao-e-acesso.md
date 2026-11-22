# Login, sessão e acesso por perfil e setor

21/11/2026 · Agente (Claude Code)

> Ticket [05](../tickets/05-login-sessao-e-acesso.md), issue [#5](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/5). Quem trabalha no hospital entra no painel com e-mail e senha, continua logado ao recarregar a página e só alcança o que o perfil e os setores permitem. As próximas rotas já encontram prontos os middlewares de acesso.

## O que foi feito

- **Rotas** (`src/modules/auth/`, nas camadas de sempre):
  - `POST /auth/login`: confere a senha (argon2id) e devolve `{ data: { tokenAcesso } }`, um JWT HS256 de 15 minutos só com o ID no `sub`. O refresh (32 bytes aleatórios, 7 dias) vai no cookie `refresh_token`, HttpOnly, Secure e SameSite=Strict, com `Path=/api/v1/auth`; o banco guarda só o SHA-256 dele. O e-mail vale com qualquer combinação de maiúsculas. E-mail inexistente, senha errada e usuário inativo dão o mesmo 401, "E-mail ou senha incorretos.", no mesmo tempo. Cada login vai para a auditoria (`login`, com o IP) e grava o `ultimo_login_em`.
  - **Limite do login:** depois de 5 tentativas erradas em 15 minutos para o mesmo IP e e-mail, a próxima recebe 429 `LIMITE_ATINGIDO`, "Muitas tentativas. Espere 15 minutos e tente de novo.", com `Retry-After` e `RateLimit`, mesmo com a senha certa.
  - `POST /auth/refresh`: troca o refresh a cada uso. O antigo é revogado e aponta para o novo (`substituido_por_id`), e a troca é atômica: de dois pedidos com o mesmo refresh, só um vale. Sem cookie, ou com refresh desconhecido, vencido, revogado ou de usuário inativo, dá 401.
  - `POST /auth/logout`: revoga todos os refresh tokens da pessoa, apaga o cookie e responde 204. A pessoa é a do token de acesso ou, se ele já venceu, a do cookie.
  - `GET /auth/me`: a `Sessao` no formato do front (`usuario`, `permissoes`, `setores` e `todosSetores`), lida do banco a cada chamada.
  - `PATCH /auth/senha`: confere a senha atual (400 em `senhaAtual`) e a regra da nova (10 caracteres, com letras e números, e diferente da atual; 400 em `novaSenha`). Desliga o `trocar_senha`, revoga todas as sessões, grava um refresh novo no cookie e registra `troca_de_senha` na auditoria.
- **Middlewares** (`src/middlewares/`): `authenticate` (401 `NAO_AUTENTICADO` sem token, com token vencido ou adulterado e com usuário inativo; 403 com a senha provisória), `authenticateComSenhaProvisoria` (só para `/auth/me` e `/auth/senha`), `authorize(permissao)` (403 `SEM_PERMISSAO`), `setorScope(parametro)` para o parâmetro da rota ou o filtro da query (403 fora dos setores) e `rate-limit.ts`, com o `limitarTentativas` e o limite do login.
- **Regras compartilhadas:** `src/shared/constants/perfis.ts` e `permissoes.ts` (o mapa da tabela do plano, que existe só na API), `src/shared/rules/senha.ts`, `src/shared/security/password.ts` (argon2id), `tokens.ts` (JWT, tokens opacos e hash), `acesso.ts` (`UsuarioAutenticado`, `temPermissao` e `podeAcessarSetor`) e `src/shared/http/ip.ts`. O `req.usuario` entrou no `express.d.ts`.
- **Seed base:** cria o primeiro Super Admin quando a tabela de usuários está vazia, com o e-mail (em minúsculas) e a senha de `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` e com a troca de senha obrigatória. Sem as variáveis, com e-mail inválido ou com senha fora da regra, para com a mensagem do que falta, sem mostrar a senha e sem criar nada.
- **Variáveis novas:** `JWT_ACCESS_SECRET` (obrigatória, com pelo menos 32 caracteres), `ACCESS_TOKEN_TTL` (padrão 15m) e `REFRESH_TOKEN_TTL_DAYS` (padrão 7), na API; `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`, só no seed. Todas no `.env.example`, e o segredo dos testes no `vitest.config.ts`.
- **Contrato:** as 5 rotas no Swagger e no `openapi.json`, os schemas `Sessao`, `Perfil` e `Permissao` com os nomes do front e os esquemas de segurança `tokenAcesso` (Bearer JWT) e `cookieDeRefresh`. O `documentarRota` passou a aceitar, para cada erro, a descrição, a mensagem e os detalhes do exemplo da rota, e o `EXIGE_LOGIN` marca as rotas que pedem login.
- **Logs:** `tokenAcesso` entrou nas chaves sempre ocultadas.
- **Dependências:** `@node-rs/argon2`, `jose` e `express-rate-limit`.
- **Testes:** são 188 (eram 105).
  - `tests/integration/auth.test.ts`: login (token, cookie e hash no banco, maiúsculas, auditoria e último login, os 401 e a validação), limite de tentativas (o 429 mesmo com a senha certa, só para aquele IP e e-mail, sem contar os logins certos, e o fim da janela), refresh (troca, refresh antigo recusado, os 401 e a troca atômica), logout (todas as sessões, pelo cookie com o token vencido e sem sessão válida), `/auth/me` de cada perfil e a mudança no banco valendo na hora, e a troca de senha (sessões, auditoria, senha atual errada e as regras da nova).
  - `tests/integration/permissoes.test.ts`: os middlewares numa rota de teste: os 401 do `authenticate`, o `req.usuario`, a desativação e a senha provisória, o `authorize` por perfil e a mudança de perfil na hora, e o `setorScope` no parâmetro e na query.
  - Unitários do mapa de permissões (a tabela do plano escrita de novo no teste), da regra de senha, do argon2id e dos tokens; o seed com o Super Admin.
  - `tests/factories/` (`criarUsuario` e `criarSetor`) e `tests/helpers/sessao.ts`, para os próximos tickets.
- `AGENTS.md` com a seção "Login, permissões e escopo de setor", o seed, a documentação de rotas com login e os comandos; README com o primeiro acesso. Ticket 05 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| `@node-rs/argon2`, e não o pacote `argon2` | Traz o binário pronto para cada sistema e não tem script de instalação, que o pnpm 12 só roda com autorização (`allowBuilds`). Roda igual no Windows, no CI e numa imagem Alpine. Os parâmetros são o mínimo da OWASP (19 MiB, 2 passadas e 1 linha de execução): cerca de 10 ms por hash nesta máquina |
| O algoritmo do argon2 não é passado | O enum `Algorithm` da biblioteca só existe nos tipos e chega vazio em tempo de execução. O padrão dela já é o argon2id, e o teste confere o prefixo `$argon2id$v=19$m=19456,t=2,p=1$` |
| `jose` para o JWT, com HS256 fixo e só o `sub` | Não tem dependências e funciona com ESM. O `jwtVerify` aceita só o HS256, o que recusa token sem assinatura ou com outro algoritmo. Perfil, permissões e setores ficam fora do token porque o plano manda lê-los do banco a cada requisição |
| `express-rate-limit` na memória, contando só as falhas | Plano: "5 tentativas a cada 15 min por IP e e-mail". Contar só as erradas não bloqueia quem entra certo várias vezes (abas, testes). A API roda num processo só; com réplicas, o contador iria para um lugar comum |
| Passado o limite, até a senha certa recebe 429 | Se a senha certa passasse, a diferença entre 429 e 200 revelaria a senha a quem tenta adivinhá-la |
| O e-mail da chave do limite em minúsculas | O limite vem antes da validação, com o corpo ainda cru. Sem isso, trocar uma maiúscula abriria outras 5 tentativas |
| Um contador para cada app: `criarRotas()` e `criarAuthRoutes()` são funções | O contador é estado. Com o roteador criado uma vez no módulo, os testes dividiriam as tentativas, e um teste bloquearia o seguinte |
| Hash fictício quando o e-mail não existe | O login leva o mesmo tempo com e sem conta, e a resposta não revela quais e-mails estão cadastrados |
| Quem está com a senha provisória recebe 403 nas rotas com `authenticate` | Plano: "a troca é obrigatória no primeiro acesso", e quem decide é sempre a API. Sem isso, a senha provisória, que o Super Admin conhece, abriria o painel direto pela API. O `/auth/me` e o `/auth/senha` deixam a pessoa passar, e o front já a leva para `/painel/senha` |
| Logout sem `authenticate`: pelo token de acesso ou, se ele venceu, pelo cookie; sempre 204 | O front chama o logout sem renovar o token. Depois de 15 minutos parado, um logout que exigisse login daria 401, o refresh continuaria válido e a sessão voltaria no próximo carregamento. O cookie chega ao `/auth/logout` pelo `Path`, e o SameSite=Strict impede que outro site deslogue alguém |
| Troca do refresh num UPDATE condicional, dentro de uma transação | Só a linha ainda válida é revogada; o segundo pedido espera o primeiro e não a encontra mais. Sem isso, o mesmo refresh viraria duas sessões |
| O refresh recusado não apaga o cookie | Duas abas que renovam juntas disputam a troca. Se a perdedora apagasse o cookie, apagaria o novo, que a vencedora tinha acabado de gravar |
| Refresh usado de novo dá só 401, sem derrubar as outras sessões | O ticket pede o 401. Derrubar todas as sessões no reuso pegaria também as duas abas que renovaram juntas, que não são roubo |
| `ultimo_login_em` gravado por SQL | O `@updatedAt` do Prisma mudaria o `atualizado_em` a cada login, e ele marca a última mudança no cadastro, não o acesso |
| Auditoria: `acao` em snake_case e `entidade` com o nome da tabela | São as primeiras linhas da auditoria; a convenção fica no AGENTS.md para os tickets 08, 09, 15 e 17 |
| A troca de senha também vai para a auditoria | O plano audita as ações sensíveis, e o ticket 09 audita as senhas redefinidas: sem esta linha, só a troca feita pela própria pessoa ficaria sem rastro |
| IP que não é IP vira `null` na auditoria | Sem o Caddy na frente, qualquer um manda um `X-Forwarded-For`. Um valor que não é IP faria a coluna `inet` recusar a linha e derrubaria o login |
| A senha nova precisa ser diferente da atual | Sem isso, a troca obrigatória aceitaria a própria senha provisória. O formulário do front já pede isso |
| Letra com acento conta como letra na regra de senha | "Misturando letras e números": `ação-segura-9` tem letras. O front usa `[a-z]`, mais restrito, então não manda senha que a API recuse por esse motivo |
| O `setorScope` recusa, antes da validação, tudo o que não for o ID de um setor da pessoa | É a ordem do plano, e o valor ainda é texto. Se o escopo deixasse passar o que não entende, um schema que convertesse o valor de outro jeito (`" 5"` virando 5) abriria um setor de fora. Para quem enxerga todos, quem responde ao valor inválido é a validação |
| `setorScope` também na query | O ticket 13 pede 403 para um setor de fora no filtro do dashboard (`?setorId=`). Sem o filtro, a rota passa e aplica o escopo na consulta |
| O primeiro Super Admin só com a tabela de usuários vazia | Segue o seed base, que "só cria o que falta e nunca muda o que existe": depois da instalação, as contas são do painel. Trocar o `SEED_ADMIN_EMAIL` não cria outro Super Admin, e a senha pode sair do servidor |
| Sem as variáveis num banco sem usuários, o seed para | Sem o Super Admin, ninguém entra no painel. Um seed que terminasse sem ele esconderia o problema |
| O Super Admin do seed nasce com a troca de senha obrigatória | A senha fica num arquivo do servidor e vale como provisória, como as que o Super Admin cria no ticket 09 |
| `ACCESS_TOKEN_TTL` e `REFRESH_TOKEN_TTL_DAYS` | Estão na tabela "Variáveis de ambiente" do plano, com 15m e 7 como padrão |
| `Cache-Control: no-store` no login, no refresh e no `/auth/me` | Respostas com token e dados da sessão não ficam em cache de navegador nem de proxy |
| `Max-Age` do cookie arredondado para cima | O cookie vence junto com o refresh no banco; arredondado para baixo, sairia com 604799 segundos |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("Autenticação, perfis e permissões", "Backend: camadas, middlewares e padrões", "Segurança", "Endpoints da API" e "Variáveis de ambiente"), os tickets 05 a 20, o `AGENTS.md`, os registros 01 a 06 e, no front, `src/lib/api/tipos.ts`, `src/mocks/auth.ts`, `src/mocks/regras.ts`, `src/features/auth/` e as rotas e guardas de `src/app/`.
- O comportamento das bibliotecas foi conferido no código instalado: o `express-rate-limit` 8.7 conta a tentativa na chegada e desconta a que deu certo quando a resposta sai, e o `Retry-After` só vai com os cabeçalhos `RateLimit` ligados; o `Algorithm` do `@node-rs/argon2` chega vazio em tempo de execução; o `listRoutes` do Express lista o roteador do auth montado sem prefixo.
- Docker Desktop: o `postgres-teste` na 5433 para a suíte e, na verificação de ponta a ponta, um banco descartável no mesmo container, apagado no fim.
- O navegador do Claude Code (Chromium), para o Swagger e o cookie.
- Skill do navegador embutido do Claude Code.

## Como foi verificado

No Node 26.13.1, com o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 188 testes (19 arquivos), `pnpm build` e o Prettier. O `pnpm openapi:exportar` gerou o `openapi.json` desta entrega.
- **Os testes pegam o erro:** um roteiro quebrou 16 regras, uma de cada vez, e conferiu que o teste de cada uma falhou e que, sem a quebra, o mesmo teste passa. Entre elas: a troca do refresh sem o filtro da linha válida, o limite contando login certo, 6 tentativas em vez de 5, a janela de 16 minutos, a senha provisória passando, o escopo e a permissão abertos, refresh e login de usuário inativo, o logout ignorando o cookie, a troca de senha sem revogar as sessões e uma permissão a mais no Gestor. O primeiro teste da troca simultânea, só por HTTP, passou mesmo sem o filtro: o segundo pedido já encontrava o refresh revogado na leitura, antes de chegar à troca. Por isso entrou o teste que dispara as duas trocas direto no banco.
- **De ponta a ponta,** com o build (`node dist/server.js`) num banco descartável: `pnpm db:deploy`; o `pnpm db:seed` sem as variáveis parou com a mensagem; com elas, criou "7 categorias, 3 turnos, 8 configurações e 1 Super Admin"; de novo sem elas, não criou nada nem pediu as variáveis. Pelo curl: login com o e-mail em maiúsculas (cookie com todos os atributos e JWT de 900 s), `/auth/me` com `trocarSenha: true`, troca com a senha atual errada (400 em `senhaAtual`), troca certa (204 e cookie novo), refresh de antes da troca recusado, refresh novo aceito e depois recusado no segundo uso, logout só com o cookie e o 429 com `Retry-After` depois de 5 senhas erradas. No banco: as linhas `login` e `troca_de_senha` da auditoria, o último login e a corrente dos refresh tokens, só com hashes de 64 caracteres.
- **No navegador,** pela página do Swagger, na mesma origem: o Chromium guardou o cookie Secure em `http://localhost`, o JavaScript da página não o lê, o navegador o enviou sozinho ao `/auth/refresh` e o trocou pelo novo a cada renovação, e depois do logout o refresh deu 401.
- O banco de desenvolvimento não foi usado: a verificação rodou num banco à parte, apagado no fim.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **Logout sem login obrigatório:** o plano diz "Logado"; aqui ele aceita também o cookie de refresh, e sem nenhum dos dois só apaga o cookie. O porquê está nas decisões.
- **Senha provisória barrada na API:** as rotas do painel respondem 403 até a troca, e não só o front esconde o painel.
- **A troca de senha vai para a auditoria,** além do login que o ticket pede.
- **`setorScope` na query,** além do parâmetro da rota.
- **Arquivos que não estão na "Estrutura de pastas":** `src/shared/rules/senha.ts`, `src/shared/security/acesso.ts`, `src/shared/http/ip.ts`, `tests/factories/usuarios.ts` e `setores.ts` e `tests/helpers/sessao.ts`. O plano lista um `auth.service.test.ts`; as regras do service ficaram nos testes de integração, com o banco, e os unitários cobrem o que não depende dele (mapa de permissões, regra de senha, argon2id e tokens).
- **`src/routes.ts` exporta `criarRotas()`** no lugar do roteador pronto, para cada app ter o seu contador de tentativas.

## Pendências e dúvidas

- **`.env` de quem já desenvolve:** precisa de `JWT_ACCESS_SECRET`, ou a API não sobe, e de `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` para semear um banco sem usuários. Os valores de desenvolvimento estão no `.env.example`.
- **Front:** o ticket que liga o login troca o `src/mocks/auth.ts` por estas rotas, com o cookie enviado ao `/api/v1/auth` (mesma origem, pelo proxy do Vite, ou `credentials: 'include'`). Quem está com a senha provisória recebe 403, "Troque a senha provisória para continuar.", em qualquer rota do painel, e o guarda do front já a leva para `/painel/senha` antes disso.
- **Duas abas que renovam ao mesmo tempo:** só uma troca o refresh; a outra recebe 401 e vai para o login, embora o cookie novo já esteja no navegador. Se incomodar, o front pode tentar o refresh mais uma vez antes de desistir.
- **Limpeza dos refresh tokens:** os revogados e vencidos continuam na tabela. Uma limpeza periódica pode apagá-los em qualquer ordem, porque o `substituido_por_id` é SET NULL.
- **Limite na troca de senha:** quem roubar um token de acesso tem até 15 minutos para tentar adivinhar a senha atual em `PATCH /auth/senha`, que não tem limite de tentativas. Um limite por usuário, como o do login, fecharia isso.
- **Mais de uma instância da API:** o contador de tentativas fica na memória do processo; com réplicas, cada uma teria o seu.
- **Produção (ticket 19):** gerar o `JWT_ACCESS_SECRET` com o comando do `.env.example`, porque o valor de exemplo é só de desenvolvimento. A pendência do registro 06 sobre o seed na imagem de produção agora também vale para o primeiro Super Admin.
