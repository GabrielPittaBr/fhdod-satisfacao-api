# Pesquisa geral: escolha dos setores e envio de vários setores

26/11/2026 · Agente (Claude Code)

> Ticket [21](../tickets/21-pesquisa-geral.md). A issue ainda não existe no GitHub: o `gh` da máquina não estava logado.
>
> O hospital divulga hoje um link do Google Forms. Nele a pessoa escolhe o setor e, no fim, deixa um telefone para retorno. A pesquisa geral (`/avaliar`, no front) substitui esse link: a pessoa escolhe um ou mais setores, responde só as perguntas deles e dá uma nota de 0 a 10 no fim, que vale para todos. A API abre essa pesquisa com os setores ativos e as perguntas de cada um, e grava num envio só uma avaliação por setor. Na mesma entrega, o telefone para retorno passou a ser oferecido a todos no fim da pesquisa pela web, e não só na avaliação baixa.

## O que foi feito

### Rotas novas, em `src/modules/pesquisa/`

- **`GET /publico/pesquisa`**, sem login: devolve o `PesquisaGeral`.
  - Os setores ativos, em ordem alfabética (`porNome`), cada um como `SetorDaPesquisa`, com `nome`, `slug`, `descricao` e as perguntas ativas na ordem, no mesmo `PerguntaPublica` da pesquisa do setor.
  - Os turnos, o `npsTexto` e o `textoLimiteCaracteres`.
  - Sem setores ativos, a lista vem vazia, com 200.
- **`POST /publico/respostas`**, sem login, com o limite de envios: recebe o `EnvioGeral` e devolve 201 com um `RespostaCriadaDoSetor` (`slug`, `id`, `classificacao`, `tokenComplemento`, `expiraEm`) por setor, na ordem do pedido e com `Cache-Control: no-store`.
  - O corpo tem `canal`, `dataAtendimento`, `turnoId`, `nps`, `site` e `setores`, de 1 a 20, cada um um `EnvioDoSetor`, com `slug`, `chaveIdempotencia` e `itens`.
  - Cada setor vira uma resposta, com a nota, a data, o turno e o canal do envio, os itens do próprio setor (o `conferirItens` de sempre) e a classificação pelas notas dele (`classificarNota`).
  - As respostas entram numa transação só (`criarVarias`).
- **Validação**, com um detalhe por problema:
  - setor repetido em `setores.N.slug` e chave repetida em `setores.N.chaveIdempotencia` (no Zod);
  - setor inexistente ou desativado em `setores.N.slug` (no service, todos de uma vez);
  - os erros dos itens com o prefixo do setor (`setores.1.itens.0.valorNumero`);
  - a nota, a data, o turno, o canal e o campo isca com as mensagens do envio de um setor.
- **Idempotência do lote:**
  - todas as chaves novas: grava;
  - todas já gravadas, cada uma no setor da mesma posição: devolve as gravadas, com tokens novos trocados numa transação (`trocarTokens`);
  - parte das chaves gravada, chave de outro setor ou avaliação já complementada: 409.

  Dois envios simultâneos caem no único do banco, e o segundo devolve as gravadas.
- **Limite de envios:** o envio de um setor e o geral dividem uma instância só do `criarLimiteDeEnvios`, criada uma vez em `criarPesquisaRoutes()`. Um envio geral conta uma vez.
- **O que foi reaproveitado:**
  - os campos do envio (chave, data, turno, itens, nota e isca), o token e a validade viraram constantes Zod usadas nos dois envios. O contrato do envio de um setor não mudou: só a descrição do erro 429 e a do `contato` do complemento;
  - a `perguntaPublica` e as `notasDosItens` saíram do `abrir` e do `enviar`, sem mudar o que eles fazem.

### Testes, documentos e contrato

- **Testes:** `tests/integration/pesquisa-geral.test.ts`, com 15 testes:
  - a abertura: a ordem alfabética, as perguntas ativas na ordem, nenhum campo a mais, a lista vazia e a abertura sem limite;
  - o envio de dois setores, com os itens, a classificação de cada um e os hashes no banco;
  - só a nota;
  - os erros por posição, sem gravar;
  - setor desativado ou inexistente;
  - setor ou chave repetidos e lista vazia, ausente ou grande demais;
  - nota, canal, chave e isca;
  - o reenvio, o 409 dos três casos e o toque duplo;
  - o complemento com o token de uma das avaliações, que recusa o token da outra;
  - o IP não gravado;
  - o limite dividido entre as duas rotas.
- **`openapi.json`** regenerado, com as duas rotas e os cinco schemas novos.
- **Documentos:**
  - o Plano de Desenvolvimento: a revisão de 26/11, o "Entra no MVP", as regras "Retorno ao paciente", "Setor" e "Vários setores", as duas rotas na tabela de endpoints, o `/avaliar` nas rotas do front, o fluxo da pesquisa e o link geral em Setores;
  - o `AGENTS.md`, na "Pesquisa pública";
  - o README: a pesquisa no quadro das funções e a pesquisa geral no teste com o hospital.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| Uma avaliação por setor escolhido, todas com a mesma nota | Pedido de quem encomendou a tela, entre "uma nota no fim" e "uma nota por setor". O `nps` é obrigatório em cada resposta, e o NPS por setor do painel continua com o mesmo sentido: cada avaliação de um setor tem a nota de recomendação de quem passou por ele |
| O NPS geral conta cada setor avaliado | É a consequência da decisão acima, e já acontece hoje quando a mesma pessoa lê os QR Codes de dois setores. Contar a pessoa uma vez pediria agrupar as respostas de um envio e mudar as contas do dashboard, das exportações e da TV. Ficou como pendência |
| Uma rota para o lote, e não o front chamando a rota de um setor várias vezes | Com várias chamadas, o envio não seria atômico: uma queda no meio deixaria parte dos setores gravada. Cada setor também gastaria uma vaga do limite por IP, e a regra "a nota vale para todos" ficaria no front |
| Uma chave de idempotência por setor, enviada pelo front | A `chave_idempotencia` é única por resposta. Com uma chave por setor, nada muda no banco e a regra do reenvio é a mesma do envio de um setor |
| O lote é a unidade da idempotência: todas as chaves novas ou todas gravadas | É a regra mais simples de explicar e de testar. Parte das chaves gravada só acontece se o pedido mudou depois de um envio que deu certo, e aí vale o 409 do envio de um setor ("Esta avaliação já foi enviada") |
| Setor desativado ou inexistente dá 400 em `setores.N.slug`, e não 404 | Num pedido com vários setores, o problema é de um campo, e o front mostra a mensagem do campo. O 404 do envio de um setor diz que o endereço inteiro não existe |
| O limite de envios é um só para as duas rotas | Com um contador para cada rota, o mesmo IP teria o dobro da cota. Um lote conta uma vez, e por isso um paciente nunca é barrado no meio da própria pesquisa |
| No máximo 20 setores por envio | É folga para o hospital inteiro e um teto para o trabalho de um pedido público |
| Setores sem perguntas ativas aparecem na pesquisa geral | É o que o `/s/:setor` já faz: a pesquisa desse setor tem só a nota de 0 a 10 |
| O complemento não mudou | O comentário e o pedido de retorno são 1:1 com a resposta. O front pergunta a qual setor eles se referem e usa o token daquela avaliação. Assim o comentário chega ao gestor do setor certo |
| Telefone para retorno oferecido a todos no fim, na web | Pedido de quem encomendou a tela: o Forms pedia o telefone no fim. O totem continua só na avaliação baixa. A API já aceitava o `contato` em qualquer avaliação, então só a documentação mudou |
| Os turnos da pesquisa geral reaproveitam a constante Zod, sem componente novo | Registrar um componente mudaria a forma do `PesquisaPublica` no `openapi.json`. Com a constante, o contrato antigo fica igual |

## Ferramentas e skills usadas

- Claude Code, com o plugin `frontend-design` para a tela do front (ver o registro de lá).
- Docker, com o PostgreSQL de desenvolvimento e o de testes do `docker-compose.yml`.
- O painel de navegador do Claude Code, com a API e o front da máquina e os dados de demonstração, para o teste de ponta a ponta.

## Como foi verificado

- **Verificações:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (631 testes, em 54 arquivos; eram 616) e `pnpm build`, sem erros.
- **Contrato:** o `openapi.json` é o que o código gera, e o teste de contrato passa. A comparação com o da `develop` mostrou só os acréscimos e duas descrições mudadas: o 429 do envio de um setor e o `contato` do complemento.
- **De ponta a ponta,** com o front em `/avaliar` e os dados de demonstração:
  - **Dois setores:** Raio-X com uma nota 2 e Ambulatório com uma nota 5, e nota de recomendação 9. A API gravou duas respostas, a do Raio-X `BAIXA` e a do Ambulatório `NORMAL`. O comentário e o telefone foram para o Ambulatório, o setor escolhido, e o pedido apareceu em Pedidos de retorno, `NOVO` e com o telefone mascarado.
  - **API parada no envio:** o front mostrou o erro. Com a API de volta, a nova tentativa gravou uma avaliação só.
  - **Rotas antigas:** o `/s/pronto-atendimento` e o totem continuaram gravando pela rota de um setor.

## O que mudou em relação ao plano

- **Regra "Retorno ao paciente":** era "oferecido só em avaliação negativa" e virou "oferecido a todos no fim da pesquisa pela web; no totem, só em avaliação negativa".
- **Regra "Setor":** ganhou a pesquisa geral.
- **Regra "Vários setores":** é nova.

O motivo das três é o mesmo: substituir o link do Google Forms que o hospital usa, com o que ele já pedia (a escolha do setor e o telefone no fim).

- **Ticket sem issue com o mesmo número:** os números de 21 a 43 já são pull requests, então o ticket 21 não pode ser a issue #21, como pede o `AGENTS.md`. O número da issue entra no ticket quando ela for criada.

## Pendências e dúvidas

- **Issue e PR:** criar a issue do ticket 21 e abrir o PR para a `develop`, antes do PR do front. Precisa do `gh auth login` na máquina.
- **Confirmar com o hospital** o telefone oferecido a todos. Com a mudança, entram mais telefones, de pacientes satisfeitos também. Isso pesa no prazo de retenção, que ainda está em aberto no plano, e na fila da Ouvidoria. A lista já mostra a classificação de cada pedido.
- **NPS por pessoa:** se o hospital quiser que o NPS geral conte cada pessoa uma vez, a solução é guardar um identificador do envio nas respostas e usá-lo nas contas. Isso é uma mudança de modelo e de relatórios.
- **Pesquisa geral no totem** (`/totem` sem setor), para um aparelho na entrada do hospital: a rota já aceita `TOTEM` no `canal`.
- **Setores do link geral:** hoje são todos os ativos. Se algum setor não deve aparecer no link geral, cabe um campo no cadastro do setor.
- **Dados de teste no banco de desenvolvimento:** o teste de ponta a ponta gravou 5 avaliações de teste, com um comentário e um telefone fictício. O `pnpm db:demo` as substitui.
