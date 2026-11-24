# Comentário e pedido de retorno depois do envio

23/11/2026 · Agente (Claude Code)

> Ticket [11](../tickets/11-comentario-e-pedido-de-retorno.md), issue [#11](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/11). Depois de enviar a nota, o paciente pode contar o que aconteceu ou deixar um elogio e, numa avaliação baixa, deixar o telefone para o hospital ligar. Só quem acabou de responder anexa isso à própria avaliação, uma vez só e dentro de 30 minutos, e o telefone já entra cifrado no banco.

## O que foi feito

- **Rota** `POST /publico/respostas/:id/complemento`, no módulo `pesquisa`, sem login: o token de complemento vai no cabeçalho `X-Complemento-Token`, e o corpo traz `comentario: { tipo, texto }`, `contato: { telefone, consentimento }` ou os dois. Responde 204, sem corpo.
- **Token:** só vale o desta avaliação, no prazo e ainda não usado. Sem o cabeçalho, com o token vazio, inventado, de outra avaliação, numa avaliação que não existe, vencido ou já usado, a resposta é 401 `NAO_AUTENTICADO` com "O prazo para complementar esta avaliação terminou.". No uso, a avaliação perde o hash e a validade do token, numa transação com a gravação do comentário e do pedido de retorno.
- **Uso único também ao mesmo tempo:** o `pesquisaRepository.complementar` usa um `updateMany` que confere o hash e o prazo no mesmo `UPDATE` que os apaga. Num segundo uso simultâneo, o PostgreSQL espera o primeiro terminar, confere de novo e não acha o token: um grava, o outro recebe 401.
- **Validação**, com um item em `detalhes` por problema:
  - No Zod: o tipo entre `ELOGIO`, `RECLAMACAO`, `SUGESTAO` e `OUTRO` ("Escolha o tipo do comentário", em `comentario.tipo`); o texto não vazio depois de tirar os espaços das pontas ("Escreva o comentário", em `comentario.texto`); o telefone com DDD, de 10 ou 11 dígitos, com ou sem a máscara ("Informe o telefone com DDD, como (51) 99999-0000", em `contato.telefone`); o consentimento `true` ("O consentimento é obrigatório para guardar o telefone", em `contato.consentimento`); e pelo menos o comentário ou o contato ("Envie o comentário, o telefone ou os dois", em `body`).
  - No service: o texto até o `texto_limite_caracteres` das configurações ("O comentário pode ter até N caracteres", em `comentario.texto`). Fica antes de usar o token, como toda a validação: um erro de validação não gasta o token, e a pessoa pode corrigir e mandar de novo.
- **Telefone:** `telefoneValido`, `digitosDoTelefone` e `finalDoTelefone`, numa regra nova, `src/shared/rules/telefone.ts`. A máscara aceita espaços, parênteses, hífen e ponto; o DDD não pode ter zero. O banco recebe só os dígitos, cifrados, e os 4 últimos em claro (`telefone_final`), com a hora do consentimento (`consentimento_em`); o pedido de retorno nasce `NOVO`.
- **Cifra:** `cifrar` e `decifrar`, em `src/shared/security/crypto.ts`, com AES-256-GCM e a chave do `ENCRYPTION_KEY`. O texto gravado é `v1.<iv>.<etiqueta>.<cifrado>`, em base64url, com um IV de 12 bytes sorteado a cada cifra e a etiqueta de 16 bytes. Um texto adulterado, de outra chave ou em outro formato é recusado.
- **Variável nova:** `ENCRYPTION_KEY`, obrigatória, 32 bytes em base64, no `env.ts`, no `.env.example` (com o comando para gerar uma) e no `vitest.config.ts` (uma chave só dos testes).
- **Constantes:** os tipos de comentário em `src/shared/constants/tipos-de-comentario.ts`, conferidos com o tipo `tipo_comentario` do banco, como os de pergunta.
- **Contrato:** a rota no Swagger e no `openapi.json`, com os schemas `Complemento` e `TipoComentario` (os nomes dos tipos do front) e o esquema de segurança `tokenComplemento` (o cabeçalho `X-Complemento-Token`). A descrição geral do documento cita o cabeçalho.
- **Testes:** são 336 (eram 305).
  - `tests/integration/complemento.test.ts` (19 testes), com o token tirado de um envio de verdade: só o comentário, só o telefone e os dois juntos; o fixo e o celular, com e sem máscara; o token vencido, o prazo de 30 minutos (29 passa, 30 e um milissegundo não), o token reutilizado e dois usos ao mesmo tempo; a gravação que falha no meio, sem deixar nada gravado nem gastar o token; os 401 sem token, com o token vazio, inventado, de outra avaliação e numa avaliação inexistente; o consentimento ausente e `false`, o telefone errado (sem DDD, curto, longo, com letra, DDD com zero e número em vez de texto), o tipo e o texto vazio juntos, o texto acima do limite do banco e o corpo vazio, todos sem gravar nada e sem gastar o token; o telefone fora do log, das respostas de erro e do banco em claro; o reenvio de uma avaliação complementada (409) e o token trocado pelo reenvio; e nada de IP nem de auditoria.
  - Unitários: `crypto.test.ts` (ida e volta, também com acento e emoji; o formato; o IV sorteado; o `node:crypto` decifra o texto sozinho com a chave do ambiente, o que prova o AES-256-GCM; o texto adulterado, de outra chave e em outro formato), `telefone.test.ts`, `tipos-de-comentario.test.ts` e o `ENCRYPTION_KEY` no `env.test.ts`.
- `AGENTS.md`: o complemento e o telefone em "Pesquisa pública", a cifra em "Segurança e LGPD" e os arquivos novos em "Onde estão as coisas". Ticket 11 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| O token é conferido e apagado no mesmo `UPDATE` | O ticket pede uso único. Ler o token e depois apagá-lo deixaria dois envios simultâneos passarem juntos. Antes de escolher o `updateMany`, um teste com o log de consultas do Prisma 7 mostrou que ele gera um `UPDATE` só, com o `id`, o hash e o prazo no `WHERE` |
| O comentário e o telefone chegam numa chamada só | O token vale uma vez; é o que o front já faz, juntando o comentário guardado e o telefone na tela do contato |
| A validação roda antes de usar o token | Um texto longo demais ou um telefone errado é corrigível: gastar o token nesse erro deixaria a pessoa sem como mandar de novo |
| A ordem é validação (400) e depois token (401), como nas outras rotas públicas | O token é conferido junto com a gravação, numa instrução só. Conferi-lo antes da validação pediria uma consulta a mais só para trocar a ordem dos erros, e o front já valida o telefone, o consentimento e o tamanho do texto antes de mandar |
| Avaliação que não existe também dá 401, e não 404 | O ticket pede 401 para o token "de outra resposta"; um 404 diria a quem não tem token quais IDs existem |
| O telefone é gravado só com os dígitos | O hospital liga para o número, não para a máscara. A tela mascarada (ticket 15) usa o `telefone_final`, e a revelação, o número limpo |
| DDD sem zero e só os sinais da máscara | O ticket pede "com DDD"; não há DDD com zero (10, 20...), e um zero na frente é o prefixo da operadora. Recusar letras e outros sinais evita que um texto qualquer com 11 dígitos passe por telefone |
| A mensagem de erro do telefone é fixa e o corpo nunca vai para o log | O ticket pede o telefone fora do log e das mensagens. O logger já ocultava `telefone`, e o log das requisições não registra o corpo; o teste confere o log de verdade e as respostas de erro |
| A cifra grava `v1.<iv>.<etiqueta>.<cifrado>` | O GCM precisa do IV e da etiqueta para decifrar. A versão na frente deixa trocar a chave ou o formato depois sem perder os telefones já gravados |
| `ENCRYPTION_KEY` em base64, conferida com 32 bytes | É o formato do plano ("Variáveis de ambiente"). Uma chave curta ou malformada para a API na subida, com a mensagem do que falta, sem mostrar o valor |
| O complemento não tem limite por IP | Só passa quem tem o token de um envio, que já entrou no limite de 30 em 15 minutos, e o token vale uma vez. Um token inventado custa uma busca pela chave primária |
| O telefone não é recusado na avaliação normal | O ticket pede a validação do telefone e do consentimento, não da classificação, e o front só oferece a tela do contato na avaliação baixa. Recusar o pedido de quem quis ser ouvido não ajuda o hospital |
| O `comentario.categoria_id` fica nulo | O corpo do ticket e o tipo `Complemento` do front não trazem categoria. A coluna fica para o painel classificar o comentário depois |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("Segurança", "Endpoints da API", "Exemplo: complemento", "Fluxo da pesquisa", "Autenticação e sessão", "LGPD" e "Variáveis de ambiente"), os tickets 10 e 11, o `AGENTS.md`, o registro do ticket 10 e, no front, `src/lib/api/tipos.ts`, `src/mocks/pesquisa.ts`, `src/features/pesquisa/hooks/useFluxoPesquisa.ts` e `src/features/pesquisa/components/EtapaContato.tsx`.
- Docker Desktop: o `postgres-teste` na 5433 para a suíte e para conferir o SQL do `updateMany`.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o pnpm 12.21.0 e o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 336 testes (34 arquivos), `pnpm build` e o Prettier. O `pnpm openapi:exportar` gerou o `openapi.json` desta entrega.
- **O SQL do `updateMany`:** um teste descartável, com o log de consultas do Prisma ligado, mostrou um `UPDATE` só, com o `id`, o hash e o prazo no `WHERE`, e a data enviada em ISO com o `Z`. Foi o que decidiu entre o `updateMany` e um SQL escrito à mão.
- **Os testes pegam o erro:** um roteiro quebrou 31 regras, uma de cada vez, e conferiu que algum teste falhou em todas.
  - **Token:** aceito com qualquer valor, de qualquer avaliação ou vencido; o hash ou a validade mantidos depois do uso; lido e apagado em duas instruções (a corrida foi pega nas 3 rodadas, sem nenhuma espera posta no meio); e o 401 trocado por 404.
  - **Transação:** o comentário gravado fora dela. Essa escapou na primeira rodada, porque nenhum teste fazia a gravação falhar no meio; o teste "se a gravação falha no meio" entrou por isso, e a mutação passou a ser pega.
  - **Validação:** o corpo vazio aceito, o consentimento `false` aceito, o tipo livre, o texto sem trim, sem limite, com o limite um a menos e com o limite sempre no padrão.
  - **Telefone:** gravado em claro, cifrado com a máscara, com o final errado, com a hora do consentimento errada, sem gravar o contato, o erro repetindo o número enviado, o DDD com zero aceito, qualquer sinal aceito e 12 dígitos aceitos.
  - **Cifra e chave:** o IV fixo, outro algoritmo, a versão do formato não conferida e a chave de qualquer tamanho.
  - **Rota:** o cabeçalho com outro nome e o 200 no lugar do 204.
- O banco de desenvolvimento não foi usado, e o Swagger não foi aberto no navegador: o teste de contrato confere a rota no documento, e o trecho novo do `openapi.json` foi lido à mão.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **Regras além do ticket:** o corpo vazio recusado (em `body`), o DDD sem zero e só os sinais da máscara no telefone, o 401 também para uma avaliação que não existe, a validade do token apagada junto com o hash e o erro de validação que não gasta o token.
- **Mensagens:** o ticket não as define. As do complemento ficaram em `MENSAGENS_DO_COMPLEMENTO`, no `pesquisa.schemas.ts`, e diferem um pouco das do mock do front (abaixo).

## Pendências e dúvidas

- **Front (ticket 04 de lá):** as diferenças para o mock:
  - as mensagens: "Escreva o comentário" e "O comentário pode ter até N caracteres" no lugar de "Escreva até N caracteres", e "Informe o telefone com DDD, como (51) 99999-0000" no lugar de "Informe o telefone com DDD";
  - o mock aceita DDD com zero e qualquer sinal no meio do número; a API, não;
  - no envio feito ao sair da página (`pagehide`), o cliente de verdade precisa do `fetch` com `keepalive: true`, porque o `sendBeacon` não manda o cabeçalho `X-Complemento-Token`;
  - esse envio só com o comentário gasta o token: se a página voltar do cache do navegador e a pessoa mandar o telefone depois, a resposta é 401.
- **Ticket 15:** a revelação do telefone usa o `decifrar`, e a tela mascarada, o `telefone_final`. A troca de chave, quando vier, entra como `v2`, com o `v1` ainda decifrável.
- **Chave em produção:** o `ENCRYPTION_KEY` precisa de uma cópia guardada fora do servidor (ticket 19): sem ela, os telefones gravados se perdem.
