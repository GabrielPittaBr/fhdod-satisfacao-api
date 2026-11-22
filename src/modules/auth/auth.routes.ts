import { Router } from 'express'
import { authenticateComSenhaProvisoria } from '../../middlewares/authenticate'
import { criarLimiteDeLogin } from '../../middlewares/rate-limit'
import { validate } from '../../middlewares/validate'
import { authController } from './auth.controller'
import { login, trocarSenha } from './auth.schemas'

/**
 * Rotas de /api/v1/auth. É uma função, e não um roteador pronto, porque o limite de tentativas do login
 * guarda um contador: cada app criado ganha o seu, e os testes não dividem tentativas entre si.
 *
 * O refresh e o logout não usam o `authenticate`: o refresh identifica a pessoa pelo cookie, e o logout
 * aceita o token de acesso ou o cookie, para funcionar mesmo depois que o token de acesso venceu.
 */
export function criarAuthRoutes(): Router {
  const router = Router()

  router.post('/auth/login', criarLimiteDeLogin(), validate(login), authController.entrar)
  router.post('/auth/refresh', authController.renovar)
  router.post('/auth/logout', authController.sair)
  router.get('/auth/me', authenticateComSenhaProvisoria, authController.sessao)
  router.patch(
    '/auth/senha',
    authenticateComSenhaProvisoria,
    validate(trocarSenha),
    authController.trocarSenha,
  )

  return router
}
