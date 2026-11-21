# 20 — Publicação em homologação

**Issue:** [#20](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/20)

**O que construir:** O sistema fica no ar num servidor de teste, com domínio e HTTPS, para o hospital testar antes da entrega: pacientes respondendo pelo celular e pelo totem de verdade, a gestão usando o painel e a TV ligada. Se a API cair, o time fica sabendo na hora. Este ticket precisa de alguém do time: envolve escolher a hospedagem, acessar o servidor e acompanhar o teste com o hospital.

**Bloqueado por:** 12 — Dados de demonstração para a apresentação; 18 — Exportação do resumo em PDF; 19 — Imagem Docker e ambiente de produção; WEB 10 — Fim dos dados simulados (repositório do front)

**Status:** ready-for-human

**Critérios de aceite:**

- [ ] Hospedagem e domínio de teste escolhidos, de preferência com data center no Brasil, e a decisão registrada no plano.
- [ ] Servidor com os dois repositórios lado a lado e o `.env` de homologação, com segredos gerados só para este ambiente e o Swagger ligado.
- [ ] Sistema publicado com o passo a passo do ticket 19, com o HTTPS emitido pelo Caddy.
- [ ] Dados de demonstração carregados, com as senhas de demonstração trocadas pela variável de ambiente.
- [ ] Um monitor externo chama `/api/health` a cada 5 minutos e avisa o time se falhar.
- [ ] Teste completo em aparelhos reais: pesquisa no celular (nota baixa com telefone e nota normal com elogio), totem reiniciando sozinho, painel com cada perfil, TV em tela cheia e as exportações.
- [ ] Cada problema encontrado vira uma issue nova; a versão aprovada vai para a `main` com tag de versão.
