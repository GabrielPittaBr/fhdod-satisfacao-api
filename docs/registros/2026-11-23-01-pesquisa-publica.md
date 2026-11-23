# Pesquisa pública: abertura e envio da avaliação

23/11/2026 · Agente (Claude Code)

> Ticket [10](../tickets/10-pesquisa-publica-abertura-e-envio.md), issue [#10](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/10). O paciente abre a pesquisa do setor pelo link ou pelo QR Code, e a avaliação é gravada ao confirmar a nota de 0 a 10, mesmo sem nenhuma outra resposta. Um toque duplo ou um reenvio depois de uma queda de rede não cria resposta repetida, e a API devolve a classificação que o front usa para escolher a próxima tela.

## O que foi feito

- **Rotas** (`src/modules/pesquisa/`, nas camadas de sempre), sem login:
  - `GET /publico/setores/:slug/pesquisa`: `{ setor: { nome, slug }, perguntas, turnos, npsTexto, textoLimiteCaracteres, totem: { reinicioSegundos, inatividadeSegundos } }`, o formato do mock do front. As perguntas são só as ativas, na ordem, com `{ id, texto, tipo, opcoes }` (`opcoes` é `null` fora da múltipla escolha); os turnos, todos, na ordem, com `{ id, nome, horaInicio, horaFim }`. Os limites de nota baixa, a categoria e a ordem não saem.
  - `POST /publico/setores/:slug/respostas`: recebe `{ chaveIdempotencia, canal, dataAtendimento, turnoId, itens, nps }` e o campo isca `site`, e responde 201 com `{ id, classificacao, tokenComplemento, expiraEm }` e `Cache-Control: no-store`.
  - Setor inexistente ou inativo dá 404 nas duas, com "Esta pesquisa não está disponível.".
- **Validação**, com um item em `detalhes` por problema:
  - No Zod: a chave em UUID ("Chave de envio inválida"), o canal `WEB` ou `TOTEM`, a data em `AAAA-MM-DD` que não passe de hoje no horário de Brasília ("Informe uma data que não seja futura"), o turno como número, o NPS inteiro de 0 a 10 ("Obrigatório, de 0 a 10", também quando falta) e o campo isca vazio.
  - No service, com o banco: o turno existente (em `turnoId`) e cada item, no caminho dele. Pergunta que não é uma ativa do setor, ou repetida, dá erro em `itens.N`; valor errado para o tipo, em `itens.N.valorNumero` ou `itens.N.valorTexto`: nota inteira de 1 a 5 na escala, `SIM` ou `NAO` no sim ou não, uma das opções na múltipla escolha e texto não vazio, até o `texto_limite_caracteres`, no texto livre.
- **Gravação:** cada item copia o texto, a categoria e o tipo da pergunta daquele momento. O texto livre perde os espaços das pontas; o sim ou não e a opção ficam como vieram. A data do atendimento vai para a coluna `date`. O IP de quem envia não é gravado em lugar nenhum, e a rota não escreve na auditoria.
- **Classificação:** `classificarNota(nps, notas, limites)`, em `src/shared/rules/classificar-nota.ts`, a pior entre a do NPS e a de cada nota de 1 a 5. Os limites vêm da tabela `configuracoes`, pelo `pesquisaRepository.lerConfiguracoes()`; uma chave que falta, ou com valor de outro tipo, vale o padrão.
- **Idempotência:** a chave é conferida antes da validação do banco. A mesma chave devolve a avaliação gravada (o mesmo `id` e a mesma `classificacao`), com um token novo no lugar do anterior. Dois envios simultâneos com a mesma chave caem no único do banco (`P2002`), e o segundo também devolve a gravada. A chave usada noutro setor, ou numa avaliação já complementada, dá 409 com "Esta avaliação já foi enviada. Obrigado por responder!".
- **Token de complemento:** 32 bytes aleatórios (`gerarTokenOpaco`), válido por 30 minutos. O banco guarda só o hash SHA-256 e a validade, e o logger oculta `tokenComplemento`.
- **Limite de envios:** 30 a cada 15 minutos por IP, contando os aceitos e os recusados (`criarLimiteDeEnvios`, em `src/middlewares/rate-limit.ts`, que ganhou a opção `pular` no `limitarTentativas`). Os IPs do `RATE_LIMIT_ALLOWLIST` ficam fora. A abertura da pesquisa não entra no limite.
- **Variável nova:** `RATE_LIMIT_ALLOWLIST`, IPs v4 ou v6 separados por vírgula, opcional, no `env.ts` e no `.env.example`. O `CORS_ORIGIN` passou a usar o mesmo `separarPorVirgula`.
- **Contrato:** as 2 rotas no Swagger e no `openapi.json`, na tag "Pesquisa pública", com os schemas `PesquisaPublica`, `PerguntaPublica`, `EnvioResposta`, `ItemEnvio`, `RespostaCriada`, `Classificacao` e `Canal`, os nomes dos tipos do front.
- **Factory:** o `criarResposta` grava `SIM` no sim ou não, como a pesquisa.
- **Testes:** são 305 (eram 279).
  - `tests/integration/pesquisa.test.ts` (20 testes): a abertura de setor ativo, com as configurações do banco e as padrão, e de setor inativo ou inexistente; o envio só com o NPS, com o hash do token e a validade de 30 minutos; os itens dos quatro tipos com o texto copiado e a pergunta pulada; a classificação pelas notas e por um limite mudado no banco; o NPS ausente e fora da faixa; os erros de formato juntos; a data de hoje; o turno e os itens errados, um detalhe cada; o texto acima do limite do banco; o reenvio com a mesma chave, também com a pergunta desativada no meio; o toque duplo; o 409 noutro setor e depois do complemento; o campo isca; o IP fora do banco; o limite de 30, o outro IP, o IP do hospital e a abertura fora do limite.
  - Unitários: `classificar-nota.test.ts` (as 11 notas do NPS, as 5 da escala, a pior entre elas e os limites recebidos), `pesquisa.schemas.test.ts` (a virada do dia em Brasília, às 03:00 UTC) e o `RATE_LIMIT_ALLOWLIST` no `env.test.ts`.
- `AGENTS.md`: a seção "Pesquisa pública" e o módulo em "Onde estão as coisas". Ticket 10 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| A chave é conferida antes de validar os itens no banco | O reenvio depois de uma queda de rede é do mesmo envio, que já foi aceito. Se uma pergunta foi desativada no meio, validar de novo recusaria uma avaliação já gravada |
| O reenvio também responde 201 | O front não precisa distinguir o primeiro envio do reenvio: nos dois casos, a avaliação está gravada e o corpo é o mesmo |
| Token usado = `tokenComplementoHash` nulo; o reenvio de uma avaliação assim dá 409 | O ticket pede o token novo "enquanto o complemento não tiver sido feito", e o token vale uma vez só. Com o hash apagado no uso (ticket 11), o reenvio não tem como ressuscitar o token. Na prática, o caso não acontece: quem reenvia não recebeu o token e não pôde fazer o complemento |
| A chave usada noutro setor dá 409 | Uma chave é de um envio só. Devolver a avaliação de outro setor entregaria a ela um token novo, por uma página que não é a dela |
| 30 envios a cada 15 minutos por IP, contando os recusados | Uma pessoa manda um envio; vários celulares podem sair pelo mesmo IP da operadora (CGNAT). Contar os recusados impede um robô de testar o formulário à vontade. O número fica num lugar só, com o aviso no código |
| O campo isca se chama `site` e dá 400 | É um nome que um robô preenche e que não existe na pesquisa. O ticket pede o envio "recusado", e o 400 com o campo deixa claro no log por que nada foi gravado. O front o esconde fora da tela, com `tabindex="-1"` e `autocomplete="off"`, para o preenchimento automático do navegador não o tocar |
| O `POST` responde com `Cache-Control: no-store` | O token de complemento só pode aparecer nessa resposta, como a senha provisória |
| Configuração faltando ou com outro tipo vale o padrão | A tabela nasce do seed, mas pode ficar sem uma chave (banco de teste, chave nova). A pesquisa não pode parar por isso, e a tela de configurações (fase 2) vai validar o que grava |
| Erros dos itens em `itens.N`, pelo índice, e não pelo `perguntaId` | O `AGENTS.md` pede o caminho no corpo (`itens.0.valor`). O mock do front usa `itens.<perguntaId>`; vale a API |
| A data do atendimento é comparada com hoje no horário de Brasília, calculado pelo `Intl` | O ticket pede o fuso de Brasília. Às 22h em Brasília já é o dia seguinte em UTC, e a comparação em UTC aceitaria o "amanhã" do paciente |
| Os itens vêm `[]` quando faltam | O ticket diz que a pergunta pulada não vem; sem nenhuma resposta, a lista pode faltar ou vir vazia, e o envio só com o NPS passa igual |
| Os testes criam um app por teste e mandam o IP pelo `X-Forwarded-For` | Cada app tem o seu contador de envios, então um teste não esgota o limite de outro. O `X-Forwarded-For` é o caminho real do IP, atrás do Caddy |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("Segurança", "Endpoints da API", "Exemplo: envio da pesquisa", "Fluxo da pesquisa", "Configurações do sistema" e "Variáveis de ambiente"), os tickets 10 e 11, o `AGENTS.md`, o módulo `perguntas` e, no front, `src/lib/api/tipos.ts`, `src/mocks/pesquisa.ts`, `src/mocks/regras.ts`, `src/features/pesquisa/` e o ticket 04 do front.
- Docker Desktop: o `postgres-teste` na 5433 para a suíte.
- Nenhuma skill.

## Como foi verificado

No Node 24.14.0, a versão instalada nesta máquina (o projeto pede a 26; o pnpm instalou e rodou tudo sem erro), com o pnpm 12.21.0 pelo corepack e o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 305 testes (30 arquivos), `pnpm build` e o Prettier. O `pnpm openapi:exportar` gerou o `openapi.json` desta entrega.
- **Os testes pegam o erro:** um roteiro quebrou 26 regras, uma de cada vez, e conferiu que algum teste falhou em todas.
  - **Idempotência:** sem conferir a chave antes da validação, sem trocar o token no reenvio, com a chave de outro setor aceita, com o token já usado trocado de novo e sem tratar o `P2002` do toque duplo.
  - **Validação:** as perguntas inativas na pesquisa, o turno inexistente aceito, a pergunta repetida aceita, a escala até 6, o sim ou não com qualquer texto, a opção fora da lista, o texto sem trim e sem limite, a data futura aceita e o campo isca ignorado.
  - **Gravação e token:** as configurações sempre no padrão, o token em claro no banco, o token de 60 minutos, a resposta sem `no-store`, a classificação sem as notas e o item sem copiar o texto da pergunta.
  - **Limite:** o `RATE_LIMIT_ALLOWLIST` ignorado e o limite de 31.
  - **Regras:** o `Math.max` trocado por `Math.min` na classificação, o NPS 6 como normal e o dia calculado em UTC, e não em Brasília.
  - A mutação do campo isca não achou o trecho, que o Prettier tinha quebrado em várias linhas; refeita no trecho certo, o teste falhou como devia.
  - Antes do roteiro, a revisão dos testes acrescentou o reenvio com a pergunta desativada no meio: sem ele, apagar a conferência da chave passaria, porque o `P2002` do banco também devolve a avaliação gravada.
- O banco de desenvolvimento não foi usado, e o Swagger não foi aberto no navegador: o teste de contrato confere que o documento tem as 2 rotas.
- O CI só roda no GitHub: o resultado fica no PR deste ticket, que roda no Node 26.

## O que mudou em relação ao plano

- **"Uma única vez" do token:** este ticket cria o token e não o deixa ser trocado depois de usado; quem marca o uso é o complemento, no ticket 11, apagando o hash.
- **Regras além do ticket:** o 409 da chave usada noutro setor ou numa avaliação já complementada, a pergunta repetida nos itens, o campo isca chamado `site`, o limite de 30 envios em 15 minutos e o `Cache-Control: no-store`.
- **O `Canal` do contrato tem só `WEB` e `TOTEM`:** o banco já tem `WHATSAPP`, da fase 3, que a pesquisa do MVP não aceita.

## Pendências e dúvidas

- **Ticket 11:** o complemento precisa apagar o `tokenComplementoHash` ao usar o token, a convenção que este ticket segue (no `AGENTS.md`, em "Pesquisa pública").
- **Front (ticket 04 de lá):** as diferenças para o mock:
  - os erros dos itens vêm em `itens.<índice>` e `itens.<índice>.valorNumero` ou `.valorTexto`, e não em `itens.<perguntaId>`;
  - o formulário manda o campo isca `site`, vazio e invisível;
  - o 409 do reenvio de uma avaliação já complementada e o 429 do limite de envios não existem no mock;
  - o reenvio devolve um token novo, que é o que vale: o front usa o da última resposta.
- **Limite e CGNAT:** se o hospital vir pacientes barrados pela rede móvel, o limite sobe no `criarLimiteDeEnvios`.
- **Node 26 nesta máquina:** a verificação local rodou no Node 24. O CI, no Node 26, é a confirmação.
- **Docker Desktop nesta máquina:** nas primeiras subidas, o Docker caiu por não conseguir apagar um socket antigo, `%LOCALAPPDATA%\Docker\run\dockerInference`; depois o motor subiu. Se voltar a cair, apagar esse arquivo com o Docker fechado resolve.
