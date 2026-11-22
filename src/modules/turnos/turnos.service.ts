import { traduzirErroDoPrisma } from '../../database/erros'
import { AppError } from '../../shared/errors/app-error'
import { turnosRepository } from './turnos.repository'
import { MENSAGEM_TURNO_NAO_ENCONTRADO, type DadosDoTurno, type Turno } from './turnos.schemas'

export const turnosService = {
  /** Todos os turnos, na ordem. Qualquer perfil lê a lista inteira. */
  listar(): Promise<Turno[]> {
    return turnosRepository.listar()
  },

  /** Cria o turno no fim da ordem. */
  criar(dados: DadosDoTurno): Promise<Turno> {
    return turnosRepository.criar(dados)
  },

  /**
   * Troca o nome e os horários; a ordem não muda. Turnos não são desativados nem apagados: as respostas
   * guardam o turno em que o paciente foi atendido. Turno inexistente dá 404.
   */
  async editar(id: number, dados: DadosDoTurno): Promise<Turno> {
    try {
      return await turnosRepository.editar(id, dados)
    } catch (erro) {
      throw traduzirErroDoPrisma(erro, {
        naoEncontrado: AppError.naoEncontrado(MENSAGEM_TURNO_NAO_ENCONTRADO),
      })
    }
  },
}
