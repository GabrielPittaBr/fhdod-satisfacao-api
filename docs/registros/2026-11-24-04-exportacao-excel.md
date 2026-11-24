# Exportação em Excel

24/11/2026 · Agente (Claude Code)

> Ticket [17](../tickets/17-exportacao-excel.md), issue [#17](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/17). A gestão baixa em Excel o que está vendo no dashboard, com os mesmos filtros e só dos setores que pode ver: o resumo, para os quatro perfis, e o detalhado, com cada resposta, cada pergunta respondida e cada comentário, para quem tem `exportacao:detalhada`. O telefone completo só sai para quem tem `contatos:ver`, e toda exportação fica na auditoria.

## O que foi feito

- **Módulo `exportacao`** (`src/modules/exportacao/`), com o `exceljs` 4.4, a biblioteca do plano:
  - `GET /exportacoes/resumo.xlsx`, com `authenticate` → `authorize('exportacao:resumo')` → `setorScope('setorId', 'query')` → `validate`: uma aba, Resumo, com quem gerou e quando, os filtros com os nomes do setor, do turno e do canal, os indicadores de `/dashboard/resumo`, o NPS por setor e as médias por categoria.
  - `GET /exportacoes/respostas.xlsx`, com o `authorize('exportacao:detalhada')`: a mesma aba Resumo e as abas Respostas (uma linha por envio), Itens (uma linha por pergunta respondida) e Comentários, do envio mais recente para o mais antigo, ligadas pelo código da resposta.
  - Os filtros do dashboard (`filtrosDoDashboardSchema`), com o período e a base obrigatórios, e o escopo de quem exporta dentro das consultas.
  - O nome no `Content-Disposition` (`fhdod-resumo-<inicio>-a-<fim>.xlsx` e `fhdod-respostas-<inicio>-a-<fim>.xlsx`), o `Content-Type` do `.xlsx` e `Cache-Control: no-store`.
  - Datas e números como data e número, com o formato de exibição (`dd/mm/yyyy`, `dd/mm/yyyy hh:mm`, `0.0`, `#,##0` e `0%`), e o envio no horário de Brasília. As tabelas têm o cabeçalho fixo, em negrito, e o filtro do Excel.
  - A coluna "Telefone para retorno", com o número completo, só para quem tem `contatos:ver`.
  - A linha da auditoria (`exportacao_de_resumo` e `exportacao_de_respostas`), gravada antes de o arquivo sair, com os filtros, o número de respostas, o `comTelefones` e, no detalhado, quantos telefones foram.
- **O envio em streaming** (`src/shared/http/download.ts`): o `enviarArquivo` põe os cabeçalhos e manda o arquivo que o service devolveu; a `Saida` faz a geração esperar a rede e parar quando a conexão fecha. Um erro antes do primeiro byte vira o erro padrão, em JSON; depois dele, a conexão é derrubada e o erro vai para o log.
- **As abas em lotes:** a lista das respostas do arquivo sai de uma consulta; as abas leem as respostas, os itens e os comentários dessa lista 500 de cada vez, pelos IDs, só quando pedem o próximo lote. Uma aba que passaria do limite do Excel (1.048.576 linhas) continua noutra, como "Itens (2)".
- **Peças compartilhadas:** os nomes dos códigos (`src/shared/constants/rotulos.ts`, com os textos do front), o `formatarTelefone` ("(51) 99999-0042"), o `horarioDeBrasilia` e o `respostaArquivo`, que documenta uma resposta com arquivo no Swagger. O CORS expõe o `Content-Disposition`, e o log das requisições passou a tratar como erro o `res.err` de uma resposta que já tinha mandado o 200.
- **Contrato:** as duas rotas no Swagger e no `openapi.json`, com o corpo binário, os cabeçalhos `Content-Disposition` e `Cache-Control` e os erros. O diff do `openapi.json` só acrescenta, fora uma linha nova na descrição geral do documento.
- **Testes:** são 565 (eram 513), em 49 arquivos.
  - `tests/integration/exportacao.test.ts` (41):
    - **Acesso:** o 401 sem login, o 403 da senha provisória, o resumo para os quatro perfis, o detalhado para três e o 403 do Visualizador, e o 403 sem `exportacao:resumo`.
    - **Escopo:** o setor de fora para o Gestor e o Visualizador, sem auditoria; e o Gestor e o Visualizador sem setor pedido, só com os seus setores em todas as abas.
    - **Resumo:** os cabeçalhos do download; os números iguais aos do dashboard; os formatos; os filtros descritos com os nomes, com a base do envio, sem filtros e com códigos que não existem; o período sem respostas; e a conta sem setores.
    - **Detalhado:** as quatro abas com os cabeçalhos em português; cada aba célula a célula, com as datas em Brasília; o texto e a categoria do momento da resposta; e cada filtro valendo em todas as abas.
    - **Telefone:** a coluna para o Super Admin e a Ouvidoria; nenhum sinal do número no arquivo do Gestor; o arquivo do Gestor saindo com o número cifrado estragado; e o 500, sem download nem auditoria, quando o número de quem pode vê-lo não se decifra.
    - **Auditoria e validação:** uma linha por exportação, com o autor, o IP, os filtros e os telefones; a exportação que não sai sem a linha; e o 400 dos filtros.
    - **Streaming:** o erro no meio que derruba a conexão e vai para o log como erro, e a conexão fechada que para a geração sem erro no log, com um servidor de verdade e o cliente HTTP do Node.
    - **Lotes:** pelo service, com lotes de 3, mantendo a ordem e o desempate no mesmo instante.
  - Unitários: a `Saida` (4), a continuação das abas e o erro que não encerra a saída (3), o `formatarTelefone` (2) e o `horarioDeBrasilia` (2, um no horário de verão de 2018).
- `AGENTS.md`: a seção "Exportações"; os filtros do dashboard nas exportações; a auditoria das exportações; as regras novas em "Modelo de dados" e "Organização por módulo"; o telefone completo na exportação, em "Respostas e pedidos de retorno" e em "Segurança e LGPD"; e o módulo em "Onde estão as coisas". Ticket 17 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| As exportações exigem o período e a base, como o dashboard | "A gestão baixa em Excel exatamente o que está vendo no dashboard, com os mesmos filtros" (ticket), e o nome do arquivo leva o `<inicio>` e o `<fim>`. O front manda o `FiltrosDashboard`, que sempre tem os três. O `AGENTS.md` dizia que as exportações usariam os filtros opcionais das listas; ver "O que mudou em relação ao plano" |
| A aba Resumo do detalhado é a mesma do arquivo do resumo, com o NPS por setor e as médias por categoria | O ticket pede "indicadores e filtros aplicados"; a aba traz isso e mais as duas tabelas, com o mesmo código, e quem abre o detalhado vê o contexto dos números sem baixar o outro |
| O arquivo é escrito direto na resposta, sem arquivo temporário | "Gerado na hora e enviado em streaming" (ticket e plano). Num arquivo temporário, os telefones ficariam em claro no disco do servidor durante o download |
| Tudo o que pode falhar roda antes do primeiro byte; depois dele, um erro derruba a conexão | O `exceljs` começa a mandar bytes assim que o livro é criado, e depois disso a resposta não vira mais JSON. Com a conexão derrubada, o navegador mostra o download como falho, em vez de salvar um arquivo pela metade que pareceria completo |
| A geração espera a rede a cada linha (`Saida`) | O `exceljs` não respeita a vazão: o `write` dele sempre aceita, e o que a rede não levou se acumula na memória. Com a espera, um download lento não faz o servidor guardar o arquivo inteiro |
| A geração olha o `close` da resposta, e não só o `writableNeedDrain` | Fechada a conexão, o Node volta o `writableNeedDrain` a `false` (conferido no Node 26): sem o `close`, a geração seguiria até o fim para ninguém |
| Uma lista de IDs e as abas em lotes de 500, pelos IDs | A memória não cresce com o período, e as três abas usam o mesmo conjunto de respostas, na mesma ordem. Ler cada lote pela chave primária é rápido; paginar pela ordem do envio faria o banco ordenar tudo de novo a cada lote |
| Do envio mais recente para o mais antigo | A ordem padrão da lista de respostas do painel e a do CSV do mock |
| Os telefones são decifrados antes do primeiro byte | Um número que não se lê vira o 500 padrão, sem arquivo pela metade, e a auditoria conta exatamente os números que foram no arquivo |
| A linha da auditoria entra antes de o arquivo sair | Como na revelação do telefone: se a linha não for gravada, nada sai; se a geração cair no meio, a tentativa fica registrada, porque parte do arquivo pode ter saído |
| A auditoria leva os filtros, o número de respostas, o `comTelefones` e quantos telefones | O ticket pede "os filtros usados e se levou telefones". O número de respostas e o de telefones respondem à pergunta seguinte de uma auditoria da LGPD: quantos dados saíram |
| Datas e números como data e número, com o formato de exibição | O Excel em português mostra 4,3, 1.234 e 24/11/2026, e a coluna continua servindo para somar, filtrar e ordenar. Como texto, "4,3" pareceria certo e não somaria. A data usa `dd/mm/yyyy`, que vale em qualquer idioma |
| O envio no horário de Brasília, com o `horarioDeBrasilia` | A data e a hora do Excel não têm fuso: a planilha mostra o que recebe. A conversão vem do `Intl`, e não de três horas a menos, e por isso vale também nas datas do horário de verão |
| `.xlsx`, com os textos como texto e repetidos uma vez só (`useSharedStrings`) | O plano pede o `exceljs`. No `.xlsx`, um comentário que começa com "=" é texto, nunca fórmula, o que um CSV não garante. Os textos compartilhados são o jeito como o próprio Excel grava; o custo é guardar na memória os textos diferentes até o fim |
| A tabela continua numa aba nova no limite do Excel | Uma aba do Excel tem no máximo 1.048.576 linhas, e o que passa disso não abre. Os itens de um ano inteiro podem chegar perto |
| Os nomes dos códigos em `src/shared/constants/rotulos.ts`, com os textos do front | O arquivo fala como o painel ("Celular ou computador", "Rostinhos (1 a 5)"); o PDF do ticket 18 vai usar os mesmos |
| O telefone escrito como "(51) 99999-0042" | É como se lê e se disca. Os números vão como texto, para o Excel não tirar o zero nem virar notação científica |
| Os setores de quem exporta aparecem nos filtros ("Os seus setores: ...") | O arquivo vai circular pelo hospital: quem abrir sabe o que ele cobre, sem conhecer o perfil de quem exportou |
| Um setor ou um turno que não existe não dá 404 | Como no dashboard, os números saem zerados; o filtro aparece como "Nenhum setor tem o código 9999" |
| O CORS expõe o `Content-Disposition` | O front lê o nome do arquivo no cabeçalho (ticket 09 do front). Em produção, front e API ficam no mesmo domínio, mas no desenvolvimento o front roda na 5173 |
| O log trata o `res.err` como erro mesmo com o 200 | O pino-http calcula o nível pelo status, e o 200 já tinha saído quando o banco caiu no meio do download: sem a mudança, o erro ia para o log como `info` |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("Exportação", "Endpoints da API", "Perfis e permissões" e "LGPD"), o ticket 17, o ticket 18, o `AGENTS.md`, os registros dos tickets 15 e 16 e, no front, `src/lib/api/tipos.ts`, `src/lib/rotulos.ts`, `src/mocks/consultas.ts`, `src/features/dashboard/` e o ticket 09 do front. Também o código do `exceljs` (o `WorkbookWriter`, o `StreamBuf` e o `xmlEncode`), para saber quando os bytes saem e o que acontece sem vazão.
- `exceljs` 4.4.0 (dependência nova).
- Docker Desktop: o `postgres-teste` na 5433, para a suíte e para o banco descartável da verificação de ponta a ponta.
- Excel 16 desta máquina, por automação (invisível e só leitura), para abrir os arquivos gerados pelo build.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o pnpm 12.21.0 e o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 565 testes (49 arquivos), `pnpm build` e o Prettier. O `pnpm openapi:exportar` gerou o `openapi.json` desta entrega, e as duas rotas foram lidas à mão: os seis filtros, o corpo binário e os cabeçalhos.
- **De ponta a ponta, com o build:** `node dist/server.js` em production, na 3334, com um banco descartável (as migrations e o seed base). O roteiro trocou a senha provisória do admin, cadastrou um setor com as quatro perguntas, mandou três avaliações pela rota pública (uma com uma reclamação de duas linhas, aspas, "&" e "=SOMA(1;2)" e com o telefone) e baixou os dois arquivos: 200, o tipo do `.xlsx`, o nome do período, `no-store`, o `Content-Disposition` exposto e a transferência `chunked`. Sem login, o 401 em JSON. O banco foi apagado no fim.
- **No Excel:** os dois arquivos abriram com todas as abas e todo o conteúdo. O Excel mostrou "24/11/2026 16:48" no envio (o servidor estava às 19:48 UTC), "3,7" na média, "67%" nas notas 4 e 5, "(51) 99999-0042" no telefone, o filtro ligado nas abas de dados e o comentário inteiro como texto, sem fórmula. A automação roda o Excel sem os avisos dele, então um reparo silencioso não apareceria; ver as pendências.
- **Os testes pegam o erro:** um roteiro quebrou 32 regras, uma de cada vez, rodou os testes da exportação (os de integração, os das planilhas e os da `Saida`) e conferiu que algum falhou. Pegou 31.
  - **Acesso e escopo:** o `authorize` e o `setorScope` tirados de cada rota; o resumo, o NPS por setor, as respostas e a descrição dos filtros com todos os setores, sem o escopo de quem exporta.
  - **Telefone:** a coluna para todos os perfis, para nenhum ou sempre no arquivo, e o número cifrado no lugar do decifrado.
  - **Auditoria:** cada arquivo sem a linha, e a linha dizendo que não levou telefones.
  - **Planilhas:** sem a continuação no limite de linhas, o envio em UTC, a porcentagem de 0 a 100, o `SIM` e o `NAO` como vieram do banco, a data como AAAA-MM-DD e o zip ainda ligado à resposta depois do erro.
  - **Ordem:** a lista do arquivo, cada lote, os itens e os comentários na ordem contrária.
  - **Envio:** sem o `no-store`, o erro no meio sem derrubar a conexão, a geração sem ver a conexão fechada, o CORS sem o `Content-Disposition`, o log com o erro no meio como `info` e o período opcional, como nas listas.
  - **A que escapou** tira o `return` do `DownloadInterrompido` no `enviarArquivo`, e ela não muda nada que se possa ver: o pino-http escreve a linha do log no `close` da resposta, e o `DownloadInterrompido` só nasce depois desse `close`. Sem o `return`, o código só põe um `res.err` que ninguém mais lê e derruba de novo uma conexão já fechada. A linha fica, para deixar claro que a conexão fechada por quem pediu não é erro.
- O Swagger não foi aberto no navegador, e os arquivos não foram abertos no LibreOffice.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **Os filtros das exportações:** o `AGENTS.md` e um comentário do `filtros-do-painel.ts` diziam que as exportações usariam o `filtrosDoPainelSchema`, com tudo opcional. Elas usam o do dashboard, com o período e a base obrigatórios, pelos motivos da primeira decisão; os dois textos foram corrigidos. Também saiu o "e das exportações" da descrição dos pontos avaliados: as exportações usam o resumo, o NPS por setor e as categorias, não os pontos.
- **Além do ticket:** a aba Resumo do detalhado com as duas tabelas; "Gerado em" e "Gerado por" no topo, que o PDF vai exigir; o número de respostas e de telefones na auditoria; a continuação das abas no limite do Excel; o CORS do `Content-Disposition`; e o nível do log.

## Pendências e dúvidas

- **Front (ticket 09, exportação pela API):** as diferenças para o mock:
  - o arquivo é `.xlsx`, e não CSV, com as abas separadas: as notas de 1 a 5 de cada resposta estão na aba Itens, e o texto dos comentários, na aba Comentários;
  - o nome vem no `Content-Disposition`, sem aspas (`attachment; filename=fhdod-resumo-2026-11-01-a-2026-11-30.xlsx`), e é preciso ler os dois formatos;
  - os filtros `inicio`, `fim` e `base` são obrigatórios, como o front já manda;
  - um erro antes do arquivo vem no formato padrão, em JSON; um erro no meio aparece como falha de rede na leitura do corpo;
  - o telefone vem escrito como "(51) 99999-0042";
  - a auditoria registra toda exportação, e não só as que levam telefones.
- **`uuid` do `exceljs`:** o `pnpm audit` acusa uma falha moderada no `uuid` 8, que o `exceljs` traz (GHSA-w5hq-g745-h8pq). A falha está no `v3`, no `v5` e no `v6` com um `buf` informado; o `exceljs` só usa o `v4`, nas regras de formatação condicional, que a exportação não usa. O `exceljs` 4.4.0 é a última versão publicada.
- **Números de um mesmo instante:** a aba Resumo e as outras abas saem de consultas separadas, antes e durante o arquivo. Uma avaliação enviada no meio da exportação pode entrar numa e não na outra, e um comentário deixado no meio pode aparecer na aba Comentários sem estar na aba Respostas.
- **HEAD:** como em toda rota GET do Express, um HEAD nas duas rotas gera o arquivo (e a linha da auditoria) sem mandar o corpo. Navegadores não fazem isso num download; se aparecer nos logs, as rotas podem recusar o HEAD.
- **Carga:** a exportação não tem limite por pessoa nem de exportações ao mesmo tempo. Um ano inteiro faz centenas de consultas pequenas; o tempo com o volume do hospital não foi medido. Se ficar pesado, o limite entra como o do login.
- **Abrir à mão:** os arquivos foram abertos pela automação do Excel, que não mostra avisos. Quem testar o ticket 09 do front, que pede os arquivos abertos no Excel com cada perfil, confere também que não aparece o aviso de reparo.
- **Ticket 18 (PDF):** pode usar o `dadosDoResumo` do service, o `descreverFiltros` das planilhas, o `enviarArquivo` e o `respostaArquivo`.
