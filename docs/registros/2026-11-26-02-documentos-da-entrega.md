# Documentos da entrega de Criação de Sites e Banco de Dados

26/11/2026 · Bernardo Finkler, com o agente (Claude Code)

> Ticket [22](../tickets/22-documentos-da-entrega.md), issue [#46](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/46). Os enunciados complementares das duas disciplinas pedem uma pasta `docs/` com documentos próprios. O conteúdo já existia, espalhado pelo plano, pelo código, pelos READMEs e pelos registros; agora está nos documentos e no formato que as disciplinas pedem, conferido no código.

## O que foi feito

- **Oito documentos em `docs/`:**
  - [`requisitos.md`](../requisitos.md): IEEE 830; 54 requisitos funcionais, 27 não funcionais (pelas características da ISO/IEC 25010) e 19 regras de negócio, cada um com a origem, a rota ou tela e o teste. Também a matriz de rastreabilidade dos 10 pedidos do briefing e do levantamento do Google Forms, as decisões de produto pedidas no briefing e o que falta o hospital confirmar;
  - [`arquitetura-backend.md`](../arquitetura-backend.md): visão geral, ciclo da requisição, 14 padrões de projeto com o lugar no código, segurança (autenticação, autorização, validação, dados) com os testes de cada medida, e a escalabilidade com os limites atuais;
  - [`padroes-git.md`](../padroes-git.md): branches, commits, PRs, tickets, registros e a contribuição de cada pessoa, com os números da `develop`;
  - [`plano-e-relatorio-de-testes.md`](../plano-e-relatorio-de-testes.md): níveis, técnicas com exemplos reais, ambiente, a execução de hoje, a cobertura por pasta, as execuções do CI e as falhas corrigidas, inclusive as dos testes de mutação dos registros;
  - [`modelo-de-dados-e-requisitos.md`](../modelo-de-dados-e-requisitos.md): requisitos de dados, o estudo relacional × NoSQL, o DER conceitual e o lógico em Mermaid, os relacionamentos com o `ON DELETE` de cada um, os índices, o dicionário de dados das 14 tabelas, a normalização e os scripts;
  - [`padroes-banco-de-dados.md`](../padroes-banco-de-dados.md): as convenções de nomes e de consulta, com as exceções;
  - [`mapeamento-classes-e-consultas.md`](../mapeamento-classes-e-consultas.md): o cliente, os 14 models, os 13 repositórios (funções, operações, SQL puro e transações), os auxiliares e 21 consultas, com o SQL das principais;
  - [`seguranca-e-nuvem.md`](../seguranca-e-nuvem.md): os dois caminhos de hospedagem, a conexão com TLS, o controle de acesso, a criptografia, a rede, a injeção, o backup, a LGPD, as variáveis e o acesso da banca.
- **Cobertura dos testes:** o `@vitest/coverage-v8` e o `pnpm test:cobertura`, configurados no `vitest.config.ts` para medir `src/` sem o cliente gerado. O `pnpm test` e o CI continuam sem medir.
- **Teste novo,** [`tests/integration/injecao.test.ts`](../../tests/integration/injecao.test.ts): SQL na senha e no e-mail do login, no endereço do setor, num comentário com HTML e nos filtros do painel. Ou o Zod recusa, ou a entrada é gravada e devolvida como texto.
- **Conta só de leitura para a banca,** [`infra/banco/leitura-da-banca.sql`](../../infra/banco/leitura-da-banca.sql): lê todas as tabelas, menos as colunas de segredo, não grava e tem validade.
- **README:** o comando de cobertura, os oito documentos e os links da documentação online da API e do Kanban (os dois pendentes). **`AGENTS.md`:** o comando novo e onde ficam os documentos, com a regra de atualizá-los no mesmo PR da mudança.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| Os documentos na `docs/` da API, com link no README | O plano deixa a documentação do sistema na API ("Estrutura de pastas"), e os enunciados pedem a pasta na raiz do repositório. O front ganha o link no próximo PR dele |
| DER em Mermaid, dentro do documento | O GitHub desenha o Mermaid, e o diagrama fica em texto, revisável no diff e fácil de manter junto com o schema. O critério do ticket foi ajustado antes de começar |
| `prisma/` como o "equivalente" de `/backend/database/` | A migration é o SQL de criação, e o seed grava como a API grava (hash, cifra, classificação); um `INSERT` puro teria de repetir essas regras. Os enunciados aceitam "ou equivalente" |
| A cobertura num comando próprio, fora do `pnpm test` | Instrumentar o código deixa a suíte mais lenta; a medição é para o relatório, não uma barreira do CI |
| O relatório cita os testes de mutação dos registros | Eles já existiam (407 mutações em 14 entregas) e são a melhor evidência de que os testes acusam regra quebrada, além da cobertura |
| A contribuição de cada pessoa com os números reais | O enunciado avalia a participação individual, e o histórico é público. A tabela traz o comando para gerar de novo |
| A revisão dos PRs descrita como ela foi | Nenhum dos 37 PRs mergeados tem aprovação registrada no GitHub. O documento diz isso e o que muda a partir deste ticket, em vez de descrever só a regra |
| A conta da banca com colunas, e não tabelas inteiras | A banca vê o modelo e os dados de demonstração sem o hash das senhas, os hashes dos tokens e o telefone cifrado |
| A conta da API dividida em duas fica para depois | A imagem aplica as migrations com a mesma conexão das consultas; separar pede mudar o início do container, fora do escopo deste ticket. O documento registra como próximo passo |
| O caminho do Supabase recomendado para a avaliação | O enunciado de Banco de Dados pede o banco num serviço de nuvem, acessível remotamente; no caminho da VPS, o banco não tem porta aberta |

## Ferramentas e skills usadas

- Claude Code, lendo o plano, os dois `AGENTS.md`, os READMEs, o schema, a migration, os repositórios, os middlewares, os testes e os registros, e conferindo cada número com o `git`, o `gh` e o próprio código.
- O navegador embutido, para ler os enunciados no Notion (a página é montada por JavaScript).
- `@vitest/coverage-v8` 5.1.1, o PostgreSQL 18 do `docker-compose.yml` e o `psql` do container, para testar a conta da banca.

## Como foi verificado

- **Testes:** 635 testes em 55 arquivos, todos passando, com a cobertura (98,03% das instruções, 93,41% das ramificações, 98,27% das funções, 98,56% das linhas). No front, na branch do PR #27, 161 testes em 23 arquivos.
- **O teste novo** passou sozinho e na suíte inteira.
- **A conta da banca,** no banco de desenvolvimento: o script rodou numa transação; a conta leu as avaliações e o `telefone_final` e foi recusada no `telefone_cifrado`, no `senha_hash`, nos `refresh_tokens`, num `UPDATE` (transação só de leitura) e, com o modo só de leitura desligado, num `DELETE` e num `INSERT` (`permission denied`). A validade ficou gravada. No fim, a conta foi apagada.
- **Os números dos documentos** saíram de comandos, não de memória: autores (`git shortlog`), PRs, revisões e execuções do CI (`gh`), tipos de commit, funções e operações de cada repositório (busca no código), e as mutações de cada registro.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` passaram.

## O que mudou em relação ao plano

- O plano previa ADRs em `docs/adr/`, que nunca foram criados. A arquitetura explica que as decisões ficam no plano e nos registros.
- O plano diz "pelo menos uma aprovação" em cada PR; o histórico não tem nenhuma registrada. O `padroes-git.md` registra a prática real e o que muda.

## Pendências e dúvidas

- **Depende do ticket 20:** o banco no ar na nuvem, com as evidências; a URL pública do Swagger no README; a credencial da banca; os testes em aparelhos reais e o aceite do hospital. Cada documento marca essas partes como pendentes.
- **Kanban:** o link do quadro do GitHub Projects não está no README. O token do `gh` desta máquina não tem a permissão `read:project`, então não deu para conferir se o quadro existe.
- **Os diagramas em Mermaid** foram revistos à mão, mas não renderizados aqui: o GitHub os desenha no PR, e é lá que se confere.
- **Para perguntar aos professores:** a matriz de Banco de Dados, como está publicada, soma 82%, com uma linha em branco e 2% em "Qualidade do Banco / Scripts"; se aceitam o seed em TypeScript como script de povoamento; e se a pasta `docs/` só na API basta.
- **Front:** a cobertura dos testes do front e o link para estes documentos no README de lá ficam para um ticket do front.
