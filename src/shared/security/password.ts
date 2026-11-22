import { hash, verify } from '@node-rs/argon2'

/**
 * Parâmetros do argon2id: o mínimo que a OWASP recomenda (19 MiB de memória, 2 passadas e 1 linha de
 * execução). Cada hash leva cerca de 10 ms. O algoritmo não é passado porque o padrão da biblioteca já é o
 * argon2id (o enum dela não existe em tempo de execução); o teste confere o prefixo `$argon2id$`.
 */
const PARAMETROS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const

/** Hash para guardar no banco, no formato PHC (`$argon2id$v=19$m=19456,t=2,p=1$<sal>$<hash>`). */
export function gerarHashDaSenha(senha: string): Promise<string> {
  return hash(senha, PARAMETROS)
}

/** Confere a senha com o hash guardado. Um hash que não está no formato PHC é erro, não senha errada. */
export function senhaConfere(senhaHash: string, senha: string): Promise<boolean> {
  return verify(senhaHash, senha)
}
