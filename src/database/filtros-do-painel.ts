import { Prisma } from '../generated/prisma/client'
import { FUSO_DE_BRASILIA } from '../shared/constants/fuso-horario'
import type { BaseData, FiltrosDoPainel } from '../shared/http/filtros-do-painel'

// Os filtros do painel em SQL, para as consultas que leem a tabela `respostas` com o apelido `r`. Tudo entra
// como parâmetro do `$queryRaw`, nunca como texto concatenado.

/**
 * O dia de cada resposta na base pedida: o do atendimento ou o do envio no horário de Brasília. O envio fica
 * gravado em UTC; às 23h30 do dia 10 em Brasília, o instante já é dia 11 em UTC, e a conversão o devolve ao 10.
 */
export function diaDaResposta(base: BaseData): Prisma.Sql {
  return base === 'ENVIO'
    ? Prisma.sql`(r.enviado_em AT TIME ZONE ${FUSO_DE_BRASILIA})::date`
    : Prisma.sql`r.data_atendimento`
}

/** O instante em que começa um dia de Brasília (`AAAA-MM-DD`), mais `dias` dias. */
function inicioDoDia(data: string, dias = 0): Prisma.Sql {
  return Prisma.sql`((${data}::date + ${dias}::int)::timestamp AT TIME ZONE ${FUSO_DE_BRASILIA})`
}

/**
 * As condições do `WHERE` para os filtros e o escopo de quem pede. Com `setorIds`, só esses setores, mesmo sem
 * filtro de setor: é o escopo do Gestor e do Visualizador dentro da própria consulta; com `null`, todos.
 *
 * Com a base do envio, o período vira um intervalo de instantes (da meia-noite do início à meia-noite depois
 * do fim, em Brasília), que usa o índice de `(setor_id, enviado_em)`; converter cada linha para o dia não usaria.
 */
export function condicoesDoPainel(filtros: FiltrosDoPainel, setorIds: readonly number[] | null): Prisma.Sql {
  const condicoes: Prisma.Sql[] = []
  if (setorIds !== null) condicoes.push(Prisma.sql`r.setor_id = ANY(${[...setorIds]}::int[])`)
  if (filtros.setorId !== undefined) condicoes.push(Prisma.sql`r.setor_id = ${filtros.setorId}`)
  if (filtros.turnoId !== undefined) condicoes.push(Prisma.sql`r.turno_id = ${filtros.turnoId}`)
  if (filtros.canal !== undefined) condicoes.push(Prisma.sql`r.canal = ${filtros.canal}::canal`)

  if (filtros.base === 'ENVIO') {
    if (filtros.inicio !== undefined)
      condicoes.push(Prisma.sql`r.enviado_em >= ${inicioDoDia(filtros.inicio)}`)
    if (filtros.fim !== undefined) condicoes.push(Prisma.sql`r.enviado_em < ${inicioDoDia(filtros.fim, 1)}`)
  } else {
    if (filtros.inicio !== undefined)
      condicoes.push(Prisma.sql`r.data_atendimento >= ${filtros.inicio}::date`)
    if (filtros.fim !== undefined) condicoes.push(Prisma.sql`r.data_atendimento <= ${filtros.fim}::date`)
  }

  return condicoes.length > 0 ? Prisma.join(condicoes, ' AND ') : Prisma.sql`TRUE`
}
