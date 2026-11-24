import type { StatusRetorno as StatusRetornoDoBanco } from '../../generated/prisma/enums'

/**
 * Status de um pedido de retorno, os mesmos do tipo `status_retorno` do banco, na ordem do fluxo. No MVP, todo
 * pedido fica `NOVO`; os outros são do fluxo da fase 2 (`PATCH /contatos/:id/status`), e o contrato já os traz
 * para o tipo não mudar quando o fluxo chegar. A lista fica aqui, e não só no cliente do Prisma, porque os
 * schemas e a documentação não importam o Prisma.
 */
export const STATUS_DE_RETORNO = [
  'NOVO',
  'PENDENTE',
  'EM_ATENDIMENTO',
  'RESOLVIDO',
] as const satisfies readonly StatusRetornoDoBanco[]

export type StatusRetorno = (typeof STATUS_DE_RETORNO)[number]
