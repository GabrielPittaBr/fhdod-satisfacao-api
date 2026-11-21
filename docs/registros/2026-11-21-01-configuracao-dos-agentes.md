# Configuração dos agentes e do fluxo de trabalho

21/11/2026 · Agente (Claude Code)

> Ticket [01](../tickets/01-configuracao-dos-agentes.md), issue [#1](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/1). Primeiro ticket da API: ainda não há código, só a forma de trabalhar que os próximos tickets seguem.

## O que foi feito

- `AGENTS.md` na raiz, com:
  - a regra de que commits e PRs não levam coautoria nem assinatura de ferramenta;
  - o fluxo de branches (`develop` como base, branch por tarefa com prefixo e número do ticket, `main` só com versão estável e tag);
  - o padrão de commits, com exemplos;
  - como pegar, acompanhar e fechar um ticket;
  - a definição de pronto da API e o formato do registro da entrega;
  - as convenções de idioma, módulos e camadas, respostas e erros e contrato com o front;
  - as regras de segurança e LGPD.
- `CLAUDE.md` que importa o `AGENTS.md` (`@AGENTS.md`), para o Claude Code carregar as mesmas instruções ao abrir o repositório.
- `.claude/settings.json` versionado, com `attribution` vazio (commit e PR), `sessionUrl: false` e `includeCoAuthoredBy: false`.
- `.claude/settings.local.json` no `.gitignore`, para a configuração pessoal de cada um não ir para o Git.
- README com o caminho para o `AGENTS.md` e para o plano.
- Ticket 01 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| As instruções ficam no `AGENTS.md`, e o `CLAUDE.md` só o importa | Um texto só, que vale para qualquer pessoa ou agente; o Claude Code lê o `CLAUDE.md` e segue o `@AGENTS.md` |
| `attribution.commit` e `attribution.pr` vazios, e também `includeCoAuthoredBy: false` | `attribution` é a chave atual do Claude Code (texto vazio esconde a assinatura). A chave antiga fica para quem estiver numa versão anterior |
| `attribution.sessionUrl: false` | Sessões pela web ou por Remote Control acrescentam um trailer `Claude-Session` e um link no PR, que também é assinatura de ferramenta |
| Status do ticket no arquivo e na etiqueta da issue, com `in-progress` no lugar de `ready-for-agent` | O arquivo guarda o histórico no Git; a etiqueta mostra ao time, na hora, quem já pegou o ticket |
| Issue fechada à mão quando a branch entra na `develop` | O GitHub só fecha sozinho com `Closes #N` na branch padrão, que hoje é a `main` |
| Merge commit, sem squash | É o que o histórico da `develop` já usa, e cada tarefa continua visível como uma branch |
| Mensagens de erro escritas para quem está na tela | O front mostra a `mensagem` direto ao usuário (seção "Respostas e erros" do plano) |
| Mesmo formato de registro do front (`AAAA-MM-DD-NN-assunto.md`) | O ticket pede o registro "como no front", e assim os dois repositórios se leem do mesmo jeito |
| Aviso para conferir os tipos e o mock do front antes de criar uma rota | O front já tem telas prontas sobre um mock; a API não pode desenhar um contrato diferente sem combinar |
| Branch `chore/01-configuracao-dos-agentes` | O ticket é configuração do projeto; a documentação vem junto |

## Ferramentas e skills usadas

- Claude Code, lendo o plano, os tickets da API e do front e o registro de fundação do front.
- A descrição das chaves `attribution` e `includeCoAuthoredBy` foi conferida na própria instalação do Claude Code (2.1.325).

## O que mudou em relação ao plano

- **Definição de pronto adaptada à API.** O item "a tela funciona no celular e no computador" fica com o front; entram o `openapi.json` atualizado e o registro da entrega, como o ticket pede.
- **Comandos do projeto.** A seção existe no `AGENTS.md`, mas fica vazia até o ticket 02, que cria o `package.json`.

## Pendências e dúvidas

- **Etiqueta `in-progress`.** O `AGENTS.md` usa a etiqueta, mas ela ainda não existe no GitHub; hoje só há `ready-for-agent` e `ready-for-human`.
- **Branch padrão.** Se a `develop` virar a branch padrão no GitHub, o `Closes #N` passa a fechar a issue sozinho e o PR já abre com a base certa. É uma decisão do time.
- **Proteção das branches.** "Ninguém commita direto na `develop` nem na `main`" está escrito, mas o GitHub ainda não bloqueia. Uma regra de proteção (PR obrigatório e CI verde) faria isso valer sozinho depois do ticket 03.
