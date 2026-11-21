# 01 — Configuração dos agentes e do fluxo de trabalho

**Issue:** [#1](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/1)

**O que construir:** Quem abrir o repositório da API, pessoa ou agente, encontra num só lugar como trabalhar nele: o fluxo de branches, o padrão de commits, como pegar e fechar um ticket e quando uma tarefa está pronta. Commits e pull requests feitos por agentes saem sem coautoria e sem assinatura do Claude. Todos os outros tickets seguem o que este deixa escrito.

**Bloqueado por:** Nenhum — pode começar já.

**Status:** ready-for-agent

**Critérios de aceite:**

- [ ] A configuração do Claude Code fica versionada no repositório, para valer para o time todo, e desliga a linha `Co-Authored-By` e a assinatura "Generated with Claude Code" em commits e pull requests.
- [ ] O `AGENTS.md` diz com todas as letras que commits e pull requests não levam coautoria nem assinatura de ferramenta.
- [ ] O `AGENTS.md` descreve o fluxo de branches: uma branch por tarefa, criada a partir da `develop`, com o prefixo do tipo (`feat/`, `fix/`, `docs/`, `chore/`, `style/`, `refactor/`, `test/`, `ci/`) e o número do ticket no nome (ex.: `feat/05-login-e-sessao`); a branch volta para a `develop` quando a tarefa termina; a `main` só recebe a `develop` quando há uma versão estável, marcada com tag (`v0.1.0`, `v0.2.0`...); ninguém commita direto na `develop` nem na `main`.
- [ ] O `AGENTS.md` traz o padrão de commits do plano: Conventional Commits, tipo em inglês, descrição em português e o módulo como escopo, com exemplos.
- [ ] O `AGENTS.md` explica os tickets: ficam em `docs/tickets/`, um por arquivo, espelhados como issues no GitHub; só se pega um ticket cujos bloqueios já estão feitos; o status passa de `ready-for-agent` para `in-progress` e depois `done`; tickets `ready-for-human` precisam de alguém do time. A issue é fechada quando a branch entra na `develop` (o GitHub só fecha sozinho na branch padrão, então isso é feito à mão ou com a `develop` como branch padrão).
- [ ] O `AGENTS.md` traz a definição de pronto do plano, adaptada à API: rota validada com Zod e registrada no Swagger; permissão e escopo de setor testados; testes passando no CI; `openapi.json` atualizado sempre que o contrato muda; registro da entrega em `docs/registros/`, como no front.
- [ ] O `AGENTS.md` resume as convenções que mais pesam: domínio em português e termos técnicos em inglês; código organizado por módulo, com o papel de cada camada; respostas e erros no formato padrão, com mensagens em português que o front mostra direto para o usuário; o front só conhece a API pelo `openapi.json`, e uma mudança de contrato nunca quebra o front (campo novo entra como opcional, e o PR da API vai antes do PR do front).
- [ ] O `AGENTS.md` lista as regras de segurança e LGPD: nenhum segredo nem `.env` no Git, nenhum dado real de paciente, e telefone, senha e tokens nunca em log.
- [ ] O `AGENTS.md` aponta para o Plano de Desenvolvimento, em `docs/`, como fonte das regras de negócio, e o Claude Code carrega essas mesmas instruções ao abrir o repositório.
- [ ] O trabalho passa a partir da `develop`, que já existe no GitHub.
