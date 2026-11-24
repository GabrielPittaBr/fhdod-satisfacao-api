# 18 — Exportação do resumo em PDF

**Issue:** [#18](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/18)

**O que construir:** Quem pode exportar o resumo também baixa um PDF de uma ou duas páginas, pronto para imprimir ou mandar para a direção do hospital, com os indicadores, o NPS por setor, as médias por categoria, os filtros usados, a data e quem gerou.

**Bloqueado por:** 17 — Exportação em Excel

**Status:** done

**Critérios de aceite:**

- [x] `GET /exportacoes/resumo.pdf` exige `exportacao:resumo` e aceita os mesmos filtros e o mesmo escopo do Excel.
- [x] O PDF tem no máximo duas páginas, com os indicadores, o NPS por setor, as médias por categoria, os filtros aplicados, a data de geração e o nome de quem gerou. Gráficos ficam para a fase 3.
- [x] É gerado no servidor, sem navegador embutido, enviado na hora com o nome `fhdod-resumo-<inicio>-a-<fim>.pdf` e registrado na auditoria.
- [x] Um teste confirma que os números do PDF batem com os do `resumo.xlsx` para os mesmos filtros.
