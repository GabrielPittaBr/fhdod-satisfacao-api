# 12 — Dados de demonstração para a apresentação

**Issue:** [#12](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/12)

**O que construir:** Com um comando, o banco de desenvolvimento ou de homologação fica com os mesmos dados que o front mostra hoje com o mock: setores com perguntas, um usuário de cada perfil, telas de TV e alguns meses de avaliações. Assim, o dashboard, as respostas, os pedidos de retorno e a TV têm o que mostrar na apresentação, e uma pesquisa respondida ao vivo aparece nos números.

**Bloqueado por:** 05 — Login, sessão e acesso por perfil e setor; 11 — Comentário e pedido de retorno depois do envio

**Status:** done

**Critérios de aceite:**

- [x] É um comando separado do seed base e só roda com uma confirmação explícita (variável de ambiente), para nunca ser executado em produção por engano.
- [x] Traz os mesmos dados iniciais do mock do front: os 6 setores (com a Maternidade inativa), as perguntas de cada setor na ordem da jornada (a Internação com mais de 8 ativas, para o aviso aparecer), os 5 usuários de demonstração (um por perfil, um gestor com dois setores e um no primeiro acesso), uma tela de TV ativa com token conhecido e uma inativa. Tudo inventado, sem nenhum dado real.
- [x] Gera cerca de quatro meses de avaliações até o dia em que o comando roda, com semente fixa: canais web e totem, todos os turnos, maioria positiva e uma parte baixa, comentários dos quatro tipos (elogios em quantidade) e alguns pedidos de retorno com telefones claramente fictícios, cifrados como os de verdade.
- [x] Senhas e token da TV são gravados só como hash, do mesmo jeito que o login e a gestão de telas fazem; os itens copiam o texto das perguntas, e a classificação usa a mesma regra da API.
- [x] As senhas de demonstração podem ser trocadas por variável de ambiente, para a homologação, que fica na internet, não usar as senhas que estão no repositório.
- [x] Rodar de novo substitui os dados de demonstração e gera tudo outra vez até a data atual, sem duplicar nada.
- [x] Ao terminar, o comando mostra os e-mails de demonstração e o link da TV, e o README da API explica como usar.
