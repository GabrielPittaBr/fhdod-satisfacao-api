# 11 — Comentário e pedido de retorno depois do envio

**Issue:** [#11](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/11)

**O que construir:** Depois de enviar a nota, o paciente pode contar o que aconteceu ou deixar um elogio e, numa avaliação baixa, pedir que o hospital entre em contato, deixando o telefone com consentimento. Só quem acabou de responder consegue anexar isso à própria avaliação, uma única vez e dentro de 30 minutos. O telefone fica cifrado no banco desde o primeiro momento.

**Bloqueado por:** 10 — Pesquisa pública: abertura e envio da avaliação

**Status:** ready-for-agent

**Critérios de aceite:**

- [ ] `POST /publico/respostas/:id/complemento` recebe o token no cabeçalho `X-Complemento-Token` e um corpo com `comentario` (`tipo`, `texto`), `contato` (`telefone`, `consentimento`) ou os dois, e responde 204.
- [ ] Token inválido, de outra resposta, vencido ou já usado devolve 401 com "O prazo para complementar esta avaliação terminou.".
- [ ] Validação: tipo do comentário entre `ELOGIO`, `RECLAMACAO`, `SUGESTAO` e `OUTRO`; texto não vazio e dentro do limite das configurações (erro em `comentario.texto`); telefone com DDD, de 10 ou 11 dígitos, aceitando máscara (erro em `contato.telefone`); consentimento obrigatoriamente `true` (erro em `contato.consentimento`).
- [ ] O telefone é gravado cifrado com AES-256-GCM (chave em `ENCRYPTION_KEY`), com os 4 últimos dígitos em claro e a hora do consentimento; o pedido de retorno nasce com o status `NOVO`.
- [ ] Depois de usado, o token não vale mais, mesmo dentro do prazo.
- [ ] O telefone nunca aparece em log nem em mensagem de erro.
- [ ] Testes de integração: só comentário, só telefone, os dois juntos, token vencido, token reutilizado e consentimento ausente; teste unitário de cifrar e decifrar.
