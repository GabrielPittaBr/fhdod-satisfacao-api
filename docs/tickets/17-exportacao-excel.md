# 17 — Exportação em Excel

**Issue:** [#17](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/17)

**O que construir:** A gestão baixa em Excel exatamente o que está vendo no dashboard, com os mesmos filtros e só dos setores que pode ver: um arquivo de resumo para todos os perfis e, para quem tem permissão, um arquivo detalhado com cada resposta, cada pergunta respondida e cada comentário. Telefones só saem para quem pode vê-los, e toda exportação fica registrada.

**Bloqueado por:** 14 — Dashboard: categorias, melhores e piores pontos e comentários; 15 — Respostas e pedidos de retorno no painel

**Status:** ready-for-agent

**Critérios de aceite:**

- [ ] `GET /exportacoes/resumo.xlsx` exige `exportacao:resumo` e gera uma planilha com os filtros aplicados, os indicadores do resumo, o NPS por setor e as médias por categoria.
- [ ] `GET /exportacoes/respostas.xlsx` exige `exportacao:detalhada` e gera as abas Resumo (indicadores e filtros aplicados), Respostas (uma linha por envio), Itens (uma linha por pergunta respondida) e Comentários.
- [ ] O telefone completo só entra no arquivo detalhado para quem tem `contatos:ver`; para os demais, a coluna nem existe.
- [ ] Os dois arquivos aceitam os mesmos filtros e respeitam o mesmo escopo do dashboard; setor fora do escopo devolve 403.
- [ ] O arquivo é gerado na hora e enviado em streaming, com o nome no cabeçalho de download (`fhdod-resumo-<inicio>-a-<fim>.xlsx` e `fhdod-respostas-<inicio>-a-<fim>.xlsx`), cabeçalhos em português e datas e números no formato brasileiro.
- [ ] Cada exportação vai para a auditoria, com os filtros usados e se levou telefones.
- [ ] Testes de integração: permissões, escopo, a coluna de telefone por perfil e o conteúdo das abas.
