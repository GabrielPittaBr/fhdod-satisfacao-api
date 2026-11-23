# 10 — Pesquisa pública: abertura e envio da avaliação

**Issue:** [#10](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/10)

**O que construir:** O paciente abre o link ou o QR Code do setor e recebe a pesquisa: o nome do setor, as perguntas ativas na ordem, os turnos e os textos e tempos que a tela usa. Ao confirmar a nota de 0 a 10, a avaliação é gravada, mesmo que ele tenha pulado todas as outras perguntas. Um toque duplo ou um reenvio depois de uma queda de rede não cria resposta repetida. A API classifica a avaliação (normal, baixa ou baixíssima) e devolve a classificação, que o front usa para escolher a próxima tela.

**Bloqueado por:** 03 — Contrato: Swagger, `openapi.json` e CI; 04 — Modelo de dados do MVP

**Status:** done

**Critérios de aceite:**

- [x] `GET /publico/setores/:slug/pesquisa`, sem login, devolve o formato que o front já usa: `setor` (`nome`, `slug`), `perguntas` ativas na ordem (`id`, `texto`, `tipo`, `opcoes`), `turnos` (`id`, `nome`, `horaInicio`, `horaFim`), `npsTexto`, `textoLimiteCaracteres` e `totem` (`reinicioSegundos`, `inatividadeSegundos`), lidos das configurações. Os limites de nota baixa não vão para o front.
- [x] Setor inexistente ou inativo devolve 404 com "Esta pesquisa não está disponível.".
- [x] `POST /publico/setores/:slug/respostas` recebe `chaveIdempotencia`, `canal` (`WEB` ou `TOTEM`), `dataAtendimento` (`AAAA-MM-DD`), `turnoId`, `itens` e `nps`, e devolve 201 com `{ id, classificacao, tokenComplemento, expiraEm }`.
- [x] Validação, com um item em `detalhes` por problema: NPS inteiro de 0 a 10, obrigatório; data que não seja futura no horário de Brasília; turno existente; chave em formato UUID; e cada item de uma pergunta ativa do próprio setor, com `valorNumero` de 1 a 5 na escala, `SIM` ou `NAO` no sim/não, uma das opções na múltipla escolha e texto não vazio dentro do limite no texto livre. Pergunta pulada simplesmente não vem nos itens.
- [x] A mesma `chaveIdempotencia` enviada de novo devolve a resposta já gravada (mesmo `id` e mesma `classificacao`), sem criar outra. Como só o hash do token de complemento fica no banco, o reenvio recebe um token novo, que substitui o anterior enquanto o complemento não tiver sido feito.
- [x] Cada item gravado copia o texto, a categoria e o tipo da pergunta no momento da resposta.
- [x] A classificação é a pior entre a do NPS e a de cada nota de 1 a 5, com os limites lidos das configurações (NPS: baixa até 6, baixíssima até 2; escala: baixa até 3, baixíssima 1), numa única função, com testes unitários.
- [x] O token de complemento é aleatório, vale 30 minutos e uma única vez, e só o hash dele fica no banco.
- [x] Limite de envios por IP na pesquisa pública (429 `LIMITE_ATINGIDO`); os IPs de `RATE_LIMIT_ALLOWLIST`, como o do hospital, por onde saem os totens, ficam fora do limite.
- [x] Um campo isca opcional, que o front mantém invisível: envio com ele preenchido é recusado e não é gravado.
- [x] O IP do paciente não é gravado no banco.
- [x] Testes de integração: pesquisa de setor ativo e inativo, envio só com o NPS, NPS ausente ou fora da faixa, item de outro setor, reenvio com a mesma chave e o limite de envios.
