# Exportação do resumo em PDF

24/11/2026 · Agente (Claude Code)

> Ticket [18](../tickets/18-exportacao-pdf.md), issue [#18](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/18). Quem pode exportar o resumo também baixa um PDF de no máximo duas páginas, pronto para imprimir ou mandar à direção do hospital, com os mesmos números, os mesmos filtros e o mesmo escopo do `resumo.xlsx`.

## O que foi feito

- **`GET /exportacoes/resumo.pdf`**, com `authenticate` → `authorize('exportacao:resumo')` → `setorScope('setorId', 'query')` → `validate`, os filtros do dashboard e o escopo de quem exporta, como o Excel. O nome vem no `Content-Disposition` (`fhdod-resumo-<inicio>-a-<fim>.pdf`), com `Content-Type: application/pdf` e `Cache-Control: no-store`.
- **O PDF** (`src/modules/exportacao/exportacao.pdf.ts`), montado pelo `pdfmake` 0.3 no servidor, sem navegador:
  - em A4, com o título, quem gerou e quando (no horário de Brasília), os filtros aplicados, os indicadores, o NPS por setor e as médias por categoria, e no rodapé o sistema, a hora e "Página 1 de 2";
  - com os números escritos como no Brasil (`numeroBrasileiro`: 42, 1.234, 4,3 e 67%) e as cores do painel;
  - com a fonte Roboto que vem com o `pdfmake`, embutida no arquivo, e o `pdfmake` proibido de ler qualquer arquivo fora da pasta dela e qualquer endereço da internet;
  - com os metadados do arquivo: o título, o período, quem gerou e o sistema.
- **No máximo duas páginas:** o PDF é montado com a letra das tabelas em 9 e conferido pelo número de páginas; se passar de duas, é montado de novo com 8 e com 7. Se nem assim couber, as tabelas ficam com as primeiras e as últimas linhas (no NPS por setor, os melhores e os piores) e uma linha que diz quantas ficaram de fora e que a lista inteira está no resumo em Excel.
- **A ordem do envio:** os números, o PDF montado e a linha da auditoria (`exportacao_de_resumo_em_pdf`, com os filtros e o número de respostas) ficam prontos antes do primeiro byte; um erro até ali vira o erro padrão. O envio usa o `pipe`, que espera a rede.
- **O resumo dividido entre os dois formatos** (`exportacao.resumo.ts`): os textos, os filtros descritos, os indicadores com o rótulo e as linhas das tabelas saíram do `exportacao.planilhas.ts`, com o tipo de cada número (inteiro, contagem, média ou porcentagem). A planilha guarda o número com o formato de exibição, e o PDF o escreve formatado. O `nomeDaPlanilha` virou `nomeDoArquivo`, com a extensão.
- **Contrato:** a rota no Swagger e no `openapi.json`, com o corpo binário, os cabeçalhos e os erros, e o PDF na linha das exportações da descrição geral. O diff do `openapi.json` só acrescenta, fora essa linha.
- **Testes:** são 587 (eram 565), em 51 arquivos.
  - `tests/integration/exportacao-pdf.test.ts` (16): o 401 sem login, o 403 da senha provisória, o PDF para os quatro perfis, o 403 sem a permissão, o 403 do setor de fora para o Gestor e o Visualizador, sem auditoria, e o 400 dos filtros; os cabeçalhos do download; **os números do PDF iguais aos do `resumo.xlsx`** para três combinações de filtros (os indicadores, cada linha das duas tabelas na mesma ordem, os filtros e quem gerou); as duas páginas sem o texto nem o telefone do paciente; o Gestor só com os seus setores; e a auditoria, com o PDF que não sai sem a linha.
  - `src/modules/exportacao/exportacao.pdf.test.ts` (6, sem banco): os números e a hora de Brasília, o rodapé numa linha só e os metadados; 45 setores e 15 categorias inteiros em até duas páginas; 65 setores inteiros com a letra menor; 400 setores em duas, com o primeiro, o último e o aviso, e a conta dos que ficaram de fora; o período vazio; e o `recortar`.
  - `tests/helpers/pdf.ts`: o `lerPdf`, que lê o texto do PDF com o `pdf.js` (o leitor do Firefox) e devolve as páginas e as linhas, de cima para baixo.
- `AGENTS.md`: o PDF na seção "Exportações", os arquivos novos do módulo, a ação da auditoria e o leitor dos testes. Ticket 18 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| `pdfmake` 0.3, a versão atual | O plano escolhe o `pdfmake`. A 0.3 é a versão publicada hoje; a API dela é a de um objeto só (`addFonts`, `createPdf`), e os tipos vêm do `@types/pdfmake` 0.3 |
| `@types/pdfmake` 0.3.3, e não a 0.3.4 | A 0.3.4 saiu hoje, e a regra de idade mínima do pnpm a recusa; ao instalá-la, o pnpm pôs sozinho uma exceção no `pnpm-workspace.yaml`. A exceção foi desfeita: os tipos ficam na 0.3.3, de maio, que cobre o que o PDF usa, e o `^0.3.3` sobe para a 0.3.4 quando ela tiver a idade |
| A fonte Roboto, embutida no PDF | As fontes padrão do PDF (Helvetica) não precisam de arquivo, mas só cobrem o Latin-1: um nome de setor com outro caractere sairia errado. A Roboto vem com o `pdfmake` e cobre o português e o resto; o arquivo fica com uns 30 KB |
| O `pdfmake` só lê a pasta da Roboto e nada da internet | Sem as duas regras, ele avisa no log a cada PDF e pode ler qualquer arquivo ou endereço que apareça no documento. O documento é montado só com dados do banco, mas as regras deixam isso garantido |
| O mesmo `dadosDoResumo` e os mesmos textos do Excel | O ticket pede o mesmo conteúdo, e um teste compara os dois. Com os textos e a ordem num lugar só (`exportacao.resumo.ts`), o PDF e a planilha não se desencontram |
| As duas páginas conferidas no PDF montado, e não por uma conta de linhas | O que ocupa espaço depende do tamanho dos nomes, que quebram a linha. O `pdfmake` monta as páginas na memória, e o número delas sai do próprio documento (`bufferPages`) |
| Primeiro a letra menor; só depois o recorte, com as primeiras e as últimas linhas | Com a letra 9, cabem uns 55 setores com as categorias; com a 7, uns 70. O recorte é só para não quebrar a regra das duas páginas. No NPS por setor, que vem do maior para o menor, o recorte no meio deixa à vista os melhores e os piores, e o aviso manda ao Excel, que tem tudo |
| O PDF montado antes da linha da auditoria | Como no Excel: se o PDF não sai, nada fica registrado; se a linha não é gravada, o PDF não sai |
| Uma ação própria na auditoria (`exportacao_de_resumo_em_pdf`) | O Excel e o PDF são exportações diferentes, e quem consulta a auditoria filtra pela ação, sem precisar de um campo a mais nas linhas que já existem |
| Os filtros e os indicadores um embaixo do outro | Lado a lado economizariam espaço, mas um filtro longo ("Os seus setores: ...") quebraria a linha e se misturaria com a coluna do lado. Cabe de sobra assim |
| O teste lê o PDF com o `pdf.js` | É o leitor de PDF do Firefox: o teste confere o que uma pessoa lê no arquivo, e não o documento antes de virar PDF |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("Exportação"), os tickets 17 e 18, o `AGENTS.md`, o registro do ticket 17 e o código do `pdfmake` 0.3 (o `Printer`, a saída para o Node e as regras de acesso).
- `pdfmake` 0.3.15 (dependência nova), `@types/pdfmake` 0.3.3 e `pdfjs-dist` 6.5 (só nos testes e nos tipos).
- Docker Desktop: o `postgres-teste` na 5433, para a suíte e para o banco descartável da verificação de ponta a ponta.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o pnpm 12.21.0 e o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 587 testes (51 arquivos), `pnpm build` e o Prettier. O `pnpm openapi:exportar` gerou o `openapi.json`, e a rota foi lida à mão.
- **De ponta a ponta, com o build:** `node dist/server.js` em production, na 3334, com um banco descartável e as mesmas avaliações do ticket 17. O `resumo.pdf` saiu com 200, `application/pdf`, o nome do período, `no-store` e a transferência `chunked`, sem nenhum aviso do `pdfmake` no log. Lido pelo `pdf.js`: uma página, com os mesmos números do `resumo.xlsx` baixado junto (NPS 0, 3 respostas, média 3,7 e 67% na Recepção), e os metadados certos. O rodapé tinha quebrado a hora numa segunda linha; foi corrigido e ganhou um teste. O banco foi apagado no fim.
- **Os testes pegam o erro:** um roteiro quebrou 16 regras, uma de cada vez, e rodou os testes das exportações (os dois de integração e os do módulo). Na primeira rodada, pegou 14, e as duas que escaparam mostraram buracos nos testes, corrigidos:
  - **a ação da auditoria trocada pela do Excel:** os testes comparavam com a constante `ACOES_DA_EXPORTACAO`, que a própria mutação mudava. Passaram a comparar com o texto da ação, também os do ticket 17;
  - **sem diminuir a letra:** nenhum teste tinha uma lista que só cabe com a letra menor. Medido: 60 setores já passam de duas páginas com a letra 9, e 70 só cabem com a 7. Entrou o teste dos 65 setores.
  - Com os testes novos, as duas foram pegas. As outras 14: o `authorize` e o `setorScope` da rota; o PDF sem a linha da auditoria; o nome com `.xlsx` e o tipo do Excel; até três páginas; sem o recorte; o recorte só com as primeiras linhas; a hora em UTC; a média com duas casas; a porcentagem sem o símbolo; o PDF que nunca termina; o rodapé dividindo a largura; e os metadados sem o autor.
- O PDF não foi aberto num leitor de PDF de verdade, só lido pelo `pdf.js`; ver as pendências.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **O recorte das tabelas:** o ticket pede no máximo duas páginas, mas não diz o que fazer quando os setores não cabem. O PDF diminui a letra e, só se ainda não couber, mostra as primeiras e as últimas linhas, com o aviso de que a lista inteira está no Excel.
- **Além do ticket:** o rodapé com o número da página, os metadados do arquivo e a separação do resumo em `exportacao.resumo.ts`.

## Pendências e dúvidas

- **Front (ticket 09, exportação pela API):** o botão do PDF, hoje desligado com o aviso de que chegaria com a API, pode ser ligado: `GET /exportacoes/resumo.pdf`, com os mesmos filtros do Excel e o nome no `Content-Disposition`, como o Excel.
- **Abrir à mão:** o PDF foi lido pelo `pdf.js`, que é o leitor do Firefox, mas não foi aberto no Acrobat nem impresso. Quem testar o ticket 09 do front confere também a impressão.
- **`uuid`:** a falha moderada do `uuid` 8, que o `exceljs` traz, continua (registro do ticket 17); o `pdfmake` não acrescentou nenhuma ao `pnpm audit`.
- **Gráficos:** ficam para a fase 3, como o ticket diz. O `pdfmake` desenha SVG, então dá para gerar os gráficos no servidor sem navegador.
