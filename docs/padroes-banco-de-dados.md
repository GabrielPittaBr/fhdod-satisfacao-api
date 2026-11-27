# Padrões do banco de dados

As convenções de nomes e de escrita do banco do Sistema de Satisfação Hospitalar. Cada regra abaixo descreve o que está no [`prisma/schema.prisma`](../prisma/schema.prisma) e na [migration](../prisma/migrations/20261121221631_modelo_de_dados_do_mvp/migration.sql). Uma tabela nova segue as mesmas regras, e as exceções que já existem estão marcadas com o motivo.

O modelo em si está em [`modelo-de-dados-e-requisitos.md`](modelo-de-dados-e-requisitos.md), e as regras gerais de código, no [`AGENTS.md`](../AGENTS.md), em "Convenções que mais pesam".

## 1. Princípios

- **Domínio em português, sem acento nem cedilha** nos identificadores (`configuracoes`, `classificacao`, `descricao`). Termos técnicos ficam como são usados no mercado (`refresh_tokens`, `token_hash`, `slug`).
- **snake_case no banco, nomes do Prisma no código.** O `@@map` e o `@map` traduzem um para o outro, e o banco nunca vê camelCase.
- **O Prisma é a fonte do esquema.** SQL à mão só para o que o Prisma não declara: `CHECK` e índice sobre expressão.
- **UTF-8 e UTC.** O banco roda em UTC e grava os instantes em UTC; a conversão para Brasília acontece na consulta.
- **Nada se apaga do histórico.** Cadastros saem de uso pela coluna `ativo`/`ativa`.

## 2. Nomes nos dois lados

| O quê | No código (Prisma) | No banco | Exemplo |
| --- | --- | --- | --- |
| Tabela | Modelo em PascalCase, no singular | snake_case, no plural (`@@map`) | `RespostaItem` → `resposta_itens` |
| Coluna | Campo em camelCase | snake_case (`@map`) | `dataAtendimento` → `data_atendimento` |
| Tipo enumerado | Enum em PascalCase | snake_case, no singular (`@@map`) | `TipoComentario` → `tipo_comentario` |
| Valor do enum | MAIÚSCULAS_COM_SUBLINHADO | Igual | `BAIXISSIMA`, `EM_ATENDIMENTO`, `ESCALA_1_5` |
| Relação | camelCase, pelo papel | (não existe no banco) | `criadoPor`, `substituidoPor`, `contatosResponsavel` |

## 3. Tabelas

| Regra | Exemplos |
| --- | --- |
| Plural do substantivo principal | `setores`, `perguntas`, `respostas`, `categorias`, `turnos`, `usuarios` |
| Tabela que pertence a outra ou liga duas: o dono no singular + o item no plural | `resposta_itens` (itens de uma resposta), `usuario_setores` (setores de um usuário) |
| Complemento depois do substantivo, quando ele sozinho seria vago | `contatos_retorno`, `tv_telas` |

**Exceção:** `auditoria`, no singular, porque a palavra já é coletiva ("a auditoria do sistema"); "auditorias" mudaria o sentido.

## 4. Colunas

| Tipo de coluna | Padrão | Exemplos |
| --- | --- | --- |
| Chave primária | `id`, inteira e autoincremental | Todas as tabelas, menos as duas abaixo |
| Chave primária natural ou composta | O próprio dado | `configuracoes.chave`; `usuario_setores` (`usuario_id`, `setor_id`) |
| Chave estrangeira | `<entidade no singular>_id` | `setor_id`, `turno_id`, `pergunta_id`, `resposta_id`, `categoria_id`, `usuario_id` |
| Chave estrangeira com papel | `<papel>_id` | `responsavel_id`, `criado_por_id`, `atualizado_por_id`, `substituido_por_id` |
| Instante (data e hora) | Sufixo `_em`, tipo `timestamptz(3)` | `criado_em`, `atualizado_em`, `enviado_em`, `expira_em`, `revogado_em`, `consentimento_em`, `ultimo_login_em`, `ultimo_acesso_em`, `resolvido_em` |
| Dia sem hora | Prefixo `data_`, tipo `date` | `data_atendimento` |
| Hora do dia | Prefixo `hora_`, `varchar(5)` no formato `HH:mm` | `hora_inicio`, `hora_fim` |
| Booleano | Adjetivo ou verbo que se lê como pergunta de sim ou não | `ativo`, `ativa`, `trocar_senha` |
| Ordem de exibição | `ordem` (`integer`) | `categorias.ordem`, `perguntas.ordem`, `turnos.ordem` |
| Segredo guardado | O nome diz a forma: `_hash` ou `_cifrado` | `senha_hash`, `token_hash`, `token_complemento_hash`, `telefone_cifrado` |
| Parte visível de um segredo | Nome do que mostra | `telefone_final` (os 4 últimos dígitos) |
| Valor de tipo variável | Prefixo `valor` + o tipo | `valor_numero`, `valor_texto`; `configuracoes.valor` (`jsonb`) |
| Cópia de outra tabela | Nome da origem + o campo | `pergunta_texto` (cópia de `perguntas.texto`) |

- **`ativo` ou `ativa`:** concorda com o gênero da entidade (`setores.ativo`, `perguntas.ativa`, `categorias.ativa`, `tv_telas.ativa`).
- **Todo instante é `timestamptz(3)`.** Sem o `@db.Timestamptz(3)`, o Prisma criaria `timestamp` sem fuso.
- **`criado_em` e `atualizado_em`** existem nos cadastros e nas contas. `atualizado_em` é mantido pelo Prisma (`@updatedAt`).
- **Texto:** `text` por padrão; tamanho fixo só onde o formato é fixo: `varchar(64)` nos hashes SHA-256 em hexadecimal, `varchar(5)` nas horas, `char(4)` nos dígitos finais do telefone.
- **Números pequenos** (NPS e notas) em `smallint`.

## 5. Restrições e índices

| Objeto | Padrão de nome | Quem cria | Exemplo real |
| --- | --- | --- | --- |
| Chave primária | `<tabela>_pkey` | Prisma | `respostas_pkey` |
| Chave estrangeira | `<tabela>_<coluna>_fkey` | Prisma | `resposta_itens_categoria_id_fkey` |
| Único | `<tabela>_<colunas>_key` | Prisma | `setores_slug_key`, `resposta_itens_resposta_id_pergunta_id_key` |
| Índice | `<tabela>_<colunas>_idx` | Prisma | `respostas_setor_id_enviado_em_idx` |
| `CHECK` | `<tabela>_<coluna>_check` | À mão, no fim da migration | `respostas_nps_check`, `turnos_hora_inicio_check` |
| Único sobre expressão | `<tabela>_<coluna>_<função>_key` | À mão, no fim da migration | `categorias_nome_lower_key` |

- **Toda chave estrangeira usada para buscar os registros filhos tem índice** (`@@index` no schema). As que não precisam ficam, com o motivo, na lista `CHAVES_SEM_INDICE` de [`tests/integration/modelo-de-dados.test.ts`](../tests/integration/modelo-de-dados.test.ts), e o teste falha quando aparece uma chave nova sem índice e sem motivo.
- **Índice composto** começa pela coluna mais filtrada: `(setor_id, enviado_em)`.
- **Uma chave única que já começa pela coluna buscada dispensa outro índice**, e o schema diz isso num comentário (`usuario_setores`, `resposta_itens`).

## 6. Relacionamentos

| Situação | `ON DELETE` | Exemplos |
| --- | --- | --- |
| Partes de uma avaliação, vínculos e sessões: não existem sem o dono | `CASCADE` | `resposta_itens`, `comentarios` e `contatos_retorno` → `respostas`; `usuario_setores`; `refresh_tokens` → `usuarios` |
| Referência que o histórico usa | `RESTRICT` (o padrão) | `respostas` → `setores`; `resposta_itens` → `perguntas`; `auditoria` → `usuarios` |
| Elo opcional numa cadeia | `SET NULL` | `refresh_tokens.substituido_por_id` |

Todas as chaves estrangeiras têm `ON UPDATE CASCADE`, o padrão do Prisma. Como os cadastros são desativados, e não apagados, o `RESTRICT` protege o histórico de um `DELETE` por engano.

## 7. Migrations

- Ficam em `prisma/migrations/<AAAAMMDDHHMMSS>_<descricao_em_snake_case>/migration.sql`, por exemplo `20261121221631_modelo_de_dados_do_mvp`.
- São criadas pelo `pnpm db:migrate`, nunca escritas do zero.
- **Migration aplicada não se edita**: muda-se com uma nova.
- O SQL à mão (`CHECK`, índice sobre expressão) vai **no fim** da migration, depois de uma linha separadora e de um comentário que explica o porquê. Para isso: `pnpm db:migrate --create-only`, acrescentar o SQL e aplicar com `pnpm db:migrate`. O Prisma não lê nem compara essas restrições, então nenhuma migration gerada depois as apaga.
- O teste `migrations estão em dia com o schema.prisma` (`modelo-de-dados.test.ts`) falha se o schema mudar sem uma migration nova.

## 8. Consultas no código

- **CRUD pela API do Prisma** (`prisma.setor.findMany`, `prisma.pergunta.update`...).
- **Relatórios com `$queryRaw` em template**, sempre com parâmetros: `${valor}` vira `$1`, `$2`... e nunca é colado no texto do SQL. Pedaços reaproveitados são `Prisma.sql` e se juntam com `Prisma.join`; nenhum SQL é montado com texto vindo do usuário.
- **Apelidos fixos nas consultas:** `r` para `respostas`, `i` para `resposta_itens`, `s` para `setores`, `c` para `categorias` e `co` para `comentarios`. As condições comuns do painel (`src/database/filtros-do-painel.ts`) contam com o apelido `r`.
- **Colunas devolvidas em camelCase entre aspas**, como o TypeScript espera: `r.setor_id AS "setorId"`.
- **`::int` nas contagens e somas**, para chegarem como `number`, e não como `BigInt`.
- **Enums comparados com conversão explícita**, como em `r.canal = ${canal}::canal`.
- **Escopo de setor num parâmetro só:** `r.setor_id = ANY(${setorIds}::int[])`.
- **E-mail em minúsculas**, gravado assim pelo service; o PostgreSQL diferencia maiúsculas ao comparar texto.

## 9. Checklist para uma tabela nova

- [ ] Modelo no singular em PascalCase, com `@@map` para o plural em snake_case
- [ ] Toda coluna com `@map` para snake_case
- [ ] `id` autoincremental (ou o motivo de outra chave)
- [ ] Chaves estrangeiras com o nome certo, com `@@index` ou com o motivo em `CHAVES_SEM_INDICE`
- [ ] Instantes em `@db.Timestamptz(3)`, com o sufixo `_em`
- [ ] `ON DELETE` escolhido pela tabela da seção 6
- [ ] `CHECK`s e índices sobre expressão no fim da migration, com comentário
- [ ] Exclusão lógica se a tabela for referenciada pelo histórico
- [ ] Linha nova no dicionário de dados (`modelo-de-dados-e-requisitos.md`)
