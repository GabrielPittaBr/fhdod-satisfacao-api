# Plano e relatório de testes

Como o Sistema de Satisfação Hospitalar é testado (parte A) e o resultado da execução em 26/11/2026 (parte B). Vale para os dois repositórios: a API (este) e o [front](https://github.com/GabrielPittaBr/fhdod-satisfacao-web). Os requisitos que cada teste verifica estão na coluna "Teste" de [`requisitos.md`](requisitos.md).

## Parte A: estratégia e plano

### 1. Objetivo e escopo

Garantir, antes de cada merge, que as regras do sistema continuam valendo. As que mais importam são a nota obrigatória, a classificação das notas, as permissões e o escopo de setor, a integridade do envio da pesquisa e a proteção dos dados pessoais.

| Testado automaticamente | Testado à mão, na homologação | Fora desta versão |
| --- | --- | --- |
| Regras de negócio, segurança, todas as rotas da API contra um PostgreSQL de verdade, contrato OpenAPI, configuração de produção, regras de commit, lógica do front (fluxo da pesquisa, clientes da API, filtros, visões da TV, acessibilidade) | Aparelhos reais (celular, totem, TV), tempos do totem, queda de rede, leitura de longe na TV, usabilidade com o hospital | Testes de componentes React e de ponta a ponta com Playwright (fase 2 do plano) e testes de carga |

### 2. Estratégia: testar onde o erro custa mais

No prazo do MVP, os testes foram para onde um erro custa mais caro (plano, "Testes"):

| Risco | O que poderia dar errado | Como é coberto |
| --- | --- | --- |
| Nota classificada errado | A Ouvidoria não vê uma avaliação ruim | Testes unitários das regras (`classificar-nota`, `calcular-nps`, `media`, `notas-da-escala`) com os valores-limite |
| Acesso indevido | Um gestor vê outro setor; alguém sem permissão vê telefones | Testes de integração de cada rota: sem login (401), sem permissão (403), fora do setor (403), lista sem dado de outro setor |
| Avaliação perdida ou duplicada | Clique duplo, rede instável, dois usos do mesmo token | Testes de integração da idempotência, do token de uso único e da concorrência |
| Dado pessoal exposto | Telefone em log, na TV ou numa exportação sem permissão | Testes da cifra, do logger, da TV e das exportações por perfil |
| Front e API fora de sincronia | Uma tela quebra depois do deploy | Teste do contrato na API e tipos gerados no front |
| Produção mal configurada | A API sobe sem uma variável ou o compose quebra | Testes do `env` e dos composes |

### 3. Níveis de teste

| Nível | Ferramentas | Onde | Arquivos | Testes | O que cobre |
| --- | --- | --- | --- | --- | --- |
| **Unitário** (API) | Vitest | `src/**/*.test.ts` e `tests/*.test.ts` | 31 | 167 | Regras (`src/shared/rules/`: NPS, classificação, média, ranking, calendário, senha, telefone), segurança (`src/shared/security/`: cifra, senha, tokens), auxiliares HTTP, constantes, configuração, geração do PDF e das planilhas; contrato OpenAPI, composes de produção, commitlint |
| **Integração** (API) | Vitest + Supertest + PostgreSQL 18 | `tests/integration/` | 24 | 468 | Cada rota de ponta a ponta na API, com banco real: status, formato da resposta e do erro, permissão, escopo de setor, transações, idempotência, auditoria, arquivos exportados, seed e dados de demonstração |
| **Unitário** (front) | Vitest | `src/**/*.test.ts` e `tests/` do front | 23 | 161 | Clientes da API de cada funcionalidade, fluxo da pesquisa por setor e geral, filtros do painel na URL, visões da TV, menu, acessibilidade, VLibras, regras de commit |
| **Funcional manual** | Roteiro | Homologação (ticket 20) | — | — | Pesquisa no celular e no totem, painel com cada perfil, TV, exportações |
| **Usabilidade** | Roteiro com pessoas | Homologação | — | — | Os cenários da seção 12 |
| **Aceitação** | Hospital | Homologação | — | — | O roteiro de aceite das funcionalidades do briefing |

Os testes de integração chamam as rotas pelo `createApp()`, com o Supertest, sem subir o servidor. Cada arquivo começa com o banco de teste limpo (`limparBanco`), e os arquivos rodam um de cada vez (`fileParallelism: false`), porque dividem o mesmo banco.

### 4. Técnicas de projeto de teste

| Técnica | Exemplo real |
| --- | --- |
| **Valores-limite** | `classificar-nota.test.ts`: NPS de 0 a 2 é baixíssima, de 3 a 6 é baixa e de 7 a 10 é normal; nota 1 é baixíssima, 2 e 3 são baixas, 4 e 5 são normais. `complemento.test.ts`: o token "vence 30 minutos depois do envio, e não antes" |
| **Partição de equivalência** | `complemento.test.ts`: telefone fixo e celular, com ou sem máscara, valem; sem DDD, com dígitos a mais ou a menos ou com letras dão 400 |
| **Tabela de decisão** | `permissoes.test.ts` (unitário): o mapa perfil × permissão "é a tabela do plano, na ordem dela"; só Super Admin e Ouvidoria veem telefones; o Visualizador não vê respostas nem a exportação detalhada |
| **Transição de estado** | Token do complemento: válido → usado (o segundo uso dá 401) e válido → vencido. Sessão: refresh usado é trocado, e o antigo deixa de valer. Conta: ativa → desativada perde o acesso na hora, mesmo com o token ainda válido |
| **Testes negativos** | Em todo módulo: sem token, token forjado ou vencido (401), sem permissão (403), fora do setor (403), inexistente (404), repetido (409), limite atingido (429). `injecao.test.ts`: SQL e HTML nas rotas públicas e nos filtros do painel são recusados pelo Zod ou gravados como texto |
| **Concorrência** | `complemento.test.ts`: "dois usos ao mesmo tempo do mesmo token: um grava, o outro dá 401"; `pesquisa-geral.test.ts`: "toque duplo: dois envios iguais ao mesmo tempo gravam as avaliações uma vez só" |
| **Atomicidade** | `complemento.test.ts`: "se a gravação falha no meio, nada fica gravado e o token continua valendo"; `pesquisa-geral.test.ts`: "setor inexistente ou desativado: 400 no setor da posição, sem gravar os outros" |
| **Teste de mutação (manual)** | Em 14 entregas, um roteiro quebrou as regras do código uma a uma e conferiu que algum teste falhava (seção 11) |
| **Teste de contrato** | `tests/contrato.test.ts`: toda rota do Express está no OpenAPI, e o `openapi.json` é o que o código gera |

### 5. Ambiente e dados de teste

- **Banco de teste:** o `postgres-teste` do [`docker-compose.yml`](../docker-compose.yml) (porta 5433, em memória, separado do de desenvolvimento). Antes da suíte de integração, o [`tests/setup.ts`](../tests/setup.ts) recria o schema e aplica as migrations; ele só roda se o nome do banco tiver "test".
- **No CI:** um serviço `postgres:18` no próprio GitHub Actions.
- **Variáveis:** fixas no [`vitest.config.ts`](../vitest.config.ts) (segredos próprios dos testes); os testes nunca leem o `.env`.
- **Dados:** criados por cada teste com as factories de `tests/factories/` (usuários, setores, categorias, turnos, perguntas, respostas, telas de TV), sempre inventados.

### 6. Critérios de entrada e saída

- **Entrada:** um ticket com critérios de aceite.
- **Saída (definição de pronto):** `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` verdes na máquina e no CI; permissão e escopo testados em toda rota nova; os critérios do ticket marcados.
- **Cobertura:** medida com `pnpm test:cobertura`. Não há um mínimo que bloqueie o CI; a meta é não cair abaixo do medido hoje (seção 9).

### 7. Como rodar

```powershell
docker compose up -d --wait
```

```powershell
pnpm test
```

```powershell
pnpm test:cobertura
```

O `pnpm test:cobertura` mostra a tabela no terminal e grava o relatório em HTML em `coverage/index.html` (fora do Git).

## Parte B: relatório da execução

### 8. Execução de 26/11/2026

| Repositório | Branch e commit | Comando | Arquivos | Testes | Passaram | Falharam | Duração |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API | `docs/22-documentos-da-entrega`, `d27b574` | `pnpm test:cobertura` | 55 | 635 | 635 | 0 | 125 s |
| Front | `feat/12-ajuda-no-painel`, `86046aa` (a `develop` com o PR #27) | `pnpm test` | 23 | 161 | 161 | 0 | 3 s |

Na API, Node.js 26.13.1 e PostgreSQL 18 do `docker-compose.yml`, no Windows 11. Os 635 testes da API são os 631 da `develop` mais os 4 de `injecao.test.ts`, deste ticket.

### 9. Cobertura da API

| Métrica | Coberto | Total | % |
| --- | --- | --- | --- |
| Instruções | 1.944 | 1.983 | **98,03%** |
| Ramificações | 681 | 729 | **93,41%** |
| Funções | 570 | 580 | **98,27%** |
| Linhas | 1.792 | 1.818 | **98,56%** |

**Por pasta** (`src/`, sem o cliente gerado pelo Prisma):

| Pasta | Arquivos | Instruções | Ramificações | Funções | Linhas |
| --- | --- | --- | --- | --- | --- |
| `src/` (`app.ts`, `routes.ts`, `server.ts`) | 3 | 81,1% | 75,0% | 50,0% | 82,9% |
| `src/config` | 4 | 91,7% | 90,0% | 100,0% | 92,5% |
| `src/database` | 5 | 97,1% | 93,8% | 100,0% | 96,3% |
| `src/middlewares` | 10 | 95,7% | 83,5% | 95,3% | 97,0% |
| `src/modules/auth` | 6 | 98,4% | 98,0% | 96,9% | 99,2% |
| `src/modules/categorias` | 6 | 100,0% | 100,0% | 100,0% | 100,0% |
| `src/modules/contatos` | 6 | 100,0% | 91,7% | 100,0% | 100,0% |
| `src/modules/dashboard` | 6 | 98,3% | 83,9% | 100,0% | 99,1% |
| `src/modules/docs` | 1 | 100,0% | — | 100,0% | 100,0% |
| `src/modules/exportacao` | 9 | 98,7% | 97,1% | 96,4% | 99,3% |
| `src/modules/health` | 6 | 100,0% | 100,0% | 100,0% | 100,0% |
| `src/modules/perguntas` | 6 | 100,0% | 98,4% | 100,0% | 100,0% |
| `src/modules/pesquisa` | 6 | 98,2% | 93,2% | 100,0% | 99,6% |
| `src/modules/respostas` | 6 | 98,5% | 90,9% | 100,0% | 100,0% |
| `src/modules/setores` | 6 | 100,0% | 100,0% | 100,0% | 100,0% |
| `src/modules/turnos` | 6 | 100,0% | 100,0% | 100,0% | 100,0% |
| `src/modules/tv-wall` | 6 | 100,0% | 100,0% | 100,0% | 100,0% |
| `src/modules/usuarios` | 6 | 100,0% | 100,0% | 100,0% | 100,0% |
| `src/shared/constants` | 8 | 100,0% | — | 100,0% | 100,0% |
| `src/shared/errors` | 2 | 100,0% | 100,0% | 100,0% | 100,0% |
| `src/shared/http` | 9 | 94,7% | 92,9% | 97,4% | 94,3% |
| `src/shared/rules` | 9 | 100,0% | 97,9% | 100,0% | 100,0% |
| `src/shared/security` | 5 | 97,8% | 94,1% | 100,0% | 97,6% |

**O que fica de fora, e por quê:**

| Trecho | Cobertura | Por quê |
| --- | --- | --- |
| `src/server.ts` | 0% | Só sobe o servidor; os testes usam o `createApp()` direto. É exercitado no build e na imagem Docker |
| `src/config/env.ts` | 87,5% das linhas | A saída do processo quando falta uma variável ao iniciar (os testes conferem a validação sem derrubar o processo) e o `catch` de um endereço que nem chega a ser URL |
| `src/middlewares/rate-limit.ts` | 42,9% das ramificações | Os avisos e erros internos do `express-rate-limit`, que só aparecem se a biblioteca falhar |
| `src/shared/http/encerramento.ts` | 84,6% das linhas | O encerramento por sinal do sistema (`SIGTERM`), que derruba o processo |
| `src/modules/dashboard` | 83,9% das ramificações | Defesas para resultados que o banco não devolve (por exemplo, a consulta do resumo sem linha) |

As regras de negócio (`src/shared/rules`), a segurança (`src/shared/security`) e todos os módulos de cadastro estão com 100% ou perto disso. A cobertura do front ainda não é medida: é o mesmo `@vitest/coverage-v8`, num ticket do front.

### 10. Evidências do CI

As últimas execuções na `develop`, todas verdes:

| Repositório | Commit | Data | Execução |
| --- | --- | --- | --- |
| API | `f9df354` (merge do PR #45) | 26/11/2026 | [Actions #45882745441](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/actions/runs/45882745441) |
| API | `df01859` | 26/11/2026 | [Actions #45745579330](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/actions/runs/45745579330) |
| Front | `f1c5f39` | 26/11/2026 | [Actions #45899355284](https://github.com/GabrielPittaBr/fhdod-satisfacao-web/actions/runs/45899355284) |
| Front | `9f14a05` | 26/11/2026 | [Actions #45882728934](https://github.com/GabrielPittaBr/fhdod-satisfacao-web/actions/runs/45882728934) |

O CI roda em todo PR e em cada push na `develop` e na `main`: lint, tipos, testes (na API, com PostgreSQL 18), contrato e build. A execução do PR deste ticket entra aqui quando ele for aberto.

### 11. Falhas encontradas e corrigidas

**Pelos testes de mutação.** Em 14 entregas da API, um roteiro quebrou as regras uma de cada vez e rodou os testes. A mutação é "pega" quando algum teste falha. As que escaparam mostraram buracos nos testes, corrigidos na mesma entrega:

| Entrega (registro) | Mutações | Pegas na primeira rodada | O que escapou e o que mudou |
| --- | --- | --- | --- |
| Login, sessão e acesso (21/11) | 16 | 16 | — |
| Setores (22/11) | 18 | 18 | — |
| Categorias e turnos (22/11) | 23 | 23 | — |
| Perguntas do setor (22/11) | 50 | 50 | — |
| Usuários e setores (22/11) | 48 | 48 | — |
| Pesquisa pública (23/11) | 26 | 26 | — |
| Comentário e pedido de retorno (23/11) | 31 | 31 | — |
| Dashboard: resumo, setores e evolução (23/11) | 34 | 33 | O desempate do NPS por setor: os setores empatados eram criados em ordem alfabética, e a ordem do ID dava o mesmo resultado. O teste passou a criá-los na ordem inversa |
| Dashboard: categorias, ranking e comentários (24/11) | 34 | 34 | — |
| Respostas e pedidos de retorno (24/11) | 32 | 32 | — |
| TV Wall (24/11) | 33 | 33 | — |
| Exportação em Excel (24/11) | 32 | 31 | Uma mutação equivalente: tirar um `return` depois de uma conexão já fechada não muda nada observável. O código ficou como estava |
| Exportação em PDF (24/11) | 16 | 14 | A ação da auditoria era comparada com a constante que a própria mutação mudava (passou a comparar com o texto); nenhum teste tinha uma lista que só cabe com a letra menor (entrou o teste de 65 setores) |
| Dados de demonstração (25/11) | 14 | 13 | O teste passava a confirmação vazia, e a linha do `.env` nunca era lida; o teste passou a tirar a variável do ambiente |
| **Total** | **407** | **402** | 4 buracos nos testes corrigidos; 1 mutação equivalente |

**Pelos testes e pela revisão, no front** (commits `fix` na `develop`):

| Commit | Data | Falha corrigida |
| --- | --- | --- |
| `184a0e8` | 21/11 | O Tailwind procurava classes fora de `src` |
| `9e82397` | 24/11 | As listas não recarregavam depois de uma gravação que falhou |
| `19518ca` | 24/11 | Os botões das perguntas não ficavam numa linha própria no celular |
| `0cb28b1` | 25/11 | Filtros inválidos na URL chegavam à API |
| `545be11` | 26/11 | Uma página nova não abria no topo |

### 12. Testes manuais e de usabilidade (homologação)

Ficam para a homologação com o hospital (ticket 20), com o resultado anotado aqui:

| Cenário | O que conferir | Resultado |
| --- | --- | --- |
| Paciente responde pelo QR Code sem ajuda | Entende o propósito, está no setor certo e chega ao agradecimento | Pendente |
| Atendimento de ontem | Escolhe a data certa, sem confundir com a do envio | Pendente |
| Pula todas as perguntas opcionais | Conclui só com o NPS, sem erro | Pendente |
| Nota baixa com telefone | O consentimento vem desmarcado; o pedido aparece em Contatos, com o número mascarado | Pendente |
| Nota boa com elogio | O elogio fica na avaliação, sem identificação | Pendente |
| Queda de rede no envio | Não confirma um envio que não aconteceu; tenta de novo sem duplicar | Pendente |
| Totem compartilhado | Reinicia sozinho e não mostra nada da pessoa anterior; "Ainda está aí?" depois de 60 s | Pendente |
| Painel com cada perfil | Cada um vê só o que pode; o gestor, só os seus setores | Pendente |
| TV em tela cheia | Legível de longe; nenhum dado pessoal; mantém os números se a rede cair | Pendente |
| Exportações | Excel e PDF com os filtros da tela; telefones só para quem pode | Pendente |

### 13. Conclusão

- Todos os 635 testes da API e os 161 do front passam, e o CI da `develop` está verde nos dois repositórios.
- A cobertura da API é de 98% das instruções e 93% das ramificações, com 100% nas regras de negócio e nos cadastros; o que não é coberto são pontos de entrada e defesas que só disparam com falhas externas.
- Os testes de mutação mostraram que os testes acusam as quebras de regra: 402 das 407 na primeira rodada, e os buracos achados foram corrigidos.
- **Falta:** os testes em aparelhos reais e com pessoas (seção 12), que dependem da homologação; a cobertura do front; e os testes de componentes e de ponta a ponta, previstos para a fase 2.
