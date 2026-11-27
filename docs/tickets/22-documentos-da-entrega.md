# 22 — Documentos da entrega de Criação de Sites e Banco de Dados

**Issue:** [#46](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/46). O número não é o do ticket porque os números de 22 a 45 já eram issues ou pull requests.

**O que construir:** As disciplinas de Criação de Sites e de Banco de Dados pedem uma pasta `docs/` com documentos próprios, listados nos enunciados complementares: [Criação de Sites](https://cooing-trouble-f7d.notion.site/Enunciado-Complementar-Disciplina-de-Cria-o-de-Sites-3e91679f3ac58090809bc88f90c7cef6), [Banco de Dados](https://cooing-trouble-f7d.notion.site/Enunciado-Complementar-Disciplina-de-Banco-de-Dados-3ec1679f3ac580c0a8aff16123beee48) e o [enunciado geral](https://cooing-trouble-f7d.notion.site/Desenvolvimento-de-Solu-o-Web-Corporativa-3e21679f3ac5806697c1e0bcb47debb7). Quase todo o conteúdo já existe no Plano de Desenvolvimento, no código e nos READMEs; falta escrevê-lo no formato pedido. Este ticket cria os oito documentos na `docs/` da API, que é onde o plano deixa a documentação do sistema. Ele também passa a medir a cobertura dos testes da API e coloca no README os links que o enunciado pede.

Ficam fora deste ticket: o plano de negócios, o guia de estilos (que vai para o front), a cobertura do front e o roteiro do pitch. O que depende da homologação (ticket 20) fica marcado no documento como pendente, com o que falta: o banco em nuvem e as evidências dele, a URL pública do Swagger e o acesso da banca ao banco. O ticket 20 completa essas partes.

**Bloqueado por:** Nenhum — pode começar já.

**Status:** done

**Critérios de aceite:**

- [x] `docs/requisitos.md`: especificação de requisitos no formato da IEEE 830, com:
  - requisitos funcionais (`RF-`), não funcionais pelas características da ISO/IEC 25010 (`RNF-`) e regras de negócio (`RN-`), cada um com a origem, o critério de aceite, a rota ou tela e o teste que o verifica;
  - a matriz de rastreabilidade do briefing (pedido do cliente → regra → requisito → implementação → teste → situação), mostrando as divergências em vez de escondê-las: nota obrigatória, perfis, "tempo real", perguntas condicionais e escalas;
  - os itens de "Confirmar com o hospital", com o valor provisório e a resposta, quando houver.
- [x] `docs/arquitetura-backend.md`:
  - visão geral com diagrama, organização do código e ciclo da requisição;
  - os padrões de projeto (onde estão e por quê);
  - as justificativas de qualidade e manutenibilidade, segurança (autenticação, autorização, sanitização e proteção de rotas) e escalabilidade, com os limites atuais.
- [x] `docs/padroes-git.md`: branches, Conventional Commits e commitlint, fluxo de PR e revisão, tickets e Kanban, registros e contribuição de cada pessoa. Descreve o que o time faz de verdade e o que muda daqui em diante.
- [x] `docs/plano-e-relatorio-de-testes.md`:
  - níveis e técnicas de teste dos dois repositórios, ambiente e critérios de entrada e saída;
  - relatório da execução na data, com a cobertura, as evidências do CI e as falhas corrigidas.
- [x] A API mede a cobertura dos testes com o `@vitest/coverage-v8`, num script próprio, e o relatório traz os números por pasta.
- [x] `docs/modelo-de-dados-e-requisitos.md`:
  - os requisitos de dados ligados ao briefing;
  - a justificativa formal de relacional × não relacional (o plano só compara PostgreSQL com MySQL);
  - o DER conceitual e o lógico em Mermaid, que o GitHub desenha no próprio documento, e o dicionário de dados das 14 tabelas;
  - chaves, restrições, índices, enums e normalização;
  - os scripts de criação e povoamento (`prisma/`) e como rodá-los.
- [x] `docs/padroes-banco-de-dados.md`: as convenções de nomes de tabelas, colunas, chaves, restrições, índices, enums e migrations, como estão no schema e na migration, com as exceções.
- [x] `docs/mapeamento-classes-e-consultas.md`:
  - o cliente Prisma, os models e os 13 repositórios (tabelas, operações, SQL puro e transações);
  - os auxiliares de `src/database/`;
  - as consultas críticas e frequentes, com junções, filtros, agregações e o índice que atende cada uma.
- [x] `docs/seguranca-e-nuvem.md`: hospedagem do banco, conexão com TLS, controle de acesso (no banco e na aplicação), criptografia, restrição de IP, prevenção de injeção, backup, LGPD, variáveis de ambiente e como a banca recebe o acesso.
- [x] O README ganha, em "Documentação", os oito documentos, o link da documentação online da API e o link do quadro Kanban. Os links que ainda não existem ficam marcados como pendentes.
- [x] Nada inventado: números e afirmações conferidos no código e no GitHub. O que não existe fica como pendência explícita. Nenhum segredo nem dado real nos documentos.
- [x] Registro da entrega.
