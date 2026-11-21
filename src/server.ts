import { createApp } from './app'
import { env } from './config/env'
import { logger } from './config/logger'
import { prisma } from './database/prisma'
import { encerrarAoReceberSinal } from './shared/http/encerramento'

// No Express 5, o callback do listen também recebe o erro quando a porta não abre (já em uso, por exemplo).
const servidor = createApp().listen(env.PORT, (erro?: Error) => {
  if (erro) {
    logger.fatal({ err: erro, porta: env.PORT }, 'a API não conseguiu subir')
    process.exit(1)
  }
  logger.info({ porta: env.PORT, ambiente: env.NODE_ENV }, 'API no ar')
})

encerrarAoReceberSinal({ servidor, fecharRecursos: () => prisma.$disconnect(), logger })
