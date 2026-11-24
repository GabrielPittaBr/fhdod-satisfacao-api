import { Router } from 'express'
import { env } from '../../config/env'
import { criarLimiteDeEnvios } from '../../middlewares/rate-limit'
import { validate } from '../../middlewares/validate'
import { pesquisaController } from './pesquisa.controller'
import { abrirPesquisa, complementarResposta, enviarResposta } from './pesquisa.schemas'

/**
 * Rotas públicas da pesquisa do paciente, sem login. É uma função, como as do login, porque o limite de
 * envios guarda um contador: cada app criado ganha o seu, e os testes não dividem envios entre si.
 */
export function criarPesquisaRoutes(): Router {
  const router = Router()

  router.get('/publico/setores/:slug/pesquisa', validate(abrirPesquisa), pesquisaController.abrir)
  router.post(
    '/publico/setores/:slug/respostas',
    criarLimiteDeEnvios(env.RATE_LIMIT_ALLOWLIST),
    validate(enviarResposta),
    pesquisaController.enviar,
  )
  // Sem limite por IP: só passa quem tem o token de um envio, que já entrou no limite, e o token vale uma vez.
  router.post(
    '/publico/respostas/:id/complemento',
    validate(complementarResposta),
    pesquisaController.complementar,
  )

  return router
}
