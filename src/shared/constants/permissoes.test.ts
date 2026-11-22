import { describe, expect, it } from 'vitest'
import { Perfil as PerfilDoBanco } from '../../generated/prisma/enums'
import { enxergaTodosOsSetores, PERFIS, PERFIS_SEM_ESCOPO } from './perfis'
import { PERMISSOES, PERMISSOES_POR_PERFIL, permissoesDoPerfil } from './permissoes'

// A tabela "Perfis e permissões" do plano, escrita aqui de novo, perfil por perfil, para o teste não conferir
// o código com ele mesmo.
const TABELA_DO_PLANO = {
  SUPER_ADMIN: [
    'setores:gerenciar',
    'usuarios:gerenciar',
    'categorias:gerenciar',
    'turnos:gerenciar',
    'tvwall:gerenciar',
    'configuracoes:gerenciar',
    'auditoria:ver',
    'perguntas:gerenciar',
    'dashboard:ver',
    'respostas:ver',
    'comentarios:ver',
    'contatos:ver',
    'contatos:gerenciar',
    'exportacao:resumo',
    'exportacao:detalhada',
    'escalas:gerenciar',
  ],
  GESTOR: [
    'perguntas:gerenciar',
    'dashboard:ver',
    'respostas:ver',
    'comentarios:ver',
    'exportacao:resumo',
    'exportacao:detalhada',
    'escalas:gerenciar',
  ],
  OUVIDORIA: [
    'dashboard:ver',
    'respostas:ver',
    'comentarios:ver',
    'contatos:ver',
    'contatos:gerenciar',
    'exportacao:resumo',
    'exportacao:detalhada',
  ],
  VISUALIZADOR: ['dashboard:ver', 'exportacao:resumo'],
}

describe('perfis', () => {
  it('são os mesmos do tipo perfil do banco', () => {
    expect([...PERFIS].sort()).toEqual(Object.values(PerfilDoBanco).sort())
  })

  it('Super Admin e Ouvidoria enxergam todos os setores; Gestor e Visualizador, só os seus', () => {
    expect(PERFIS_SEM_ESCOPO).toEqual(['SUPER_ADMIN', 'OUVIDORIA'])
    expect(PERFIS.filter(enxergaTodosOsSetores)).toEqual(['SUPER_ADMIN', 'OUVIDORIA'])
  })
})

describe('mapa de permissões por perfil', () => {
  it('é a tabela do plano, na ordem dela', () => {
    expect(PERMISSOES_POR_PERFIL).toEqual(TABELA_DO_PLANO)
    for (const perfil of PERFIS) expect(permissoesDoPerfil(perfil)).toEqual(TABELA_DO_PLANO[perfil])
  })

  it('tem as 16 permissões que o front conhece, e o Super Admin tem todas', () => {
    expect(PERMISSOES).toHaveLength(16)
    expect(new Set(PERMISSOES).size).toBe(16)
    expect(PERMISSOES_POR_PERFIL.SUPER_ADMIN).toEqual(PERMISSOES)
  })

  it('só Super Admin e Ouvidoria veem os telefones', () => {
    const comTelefone = PERFIS.filter((perfil) => permissoesDoPerfil(perfil).includes('contatos:ver'))

    expect(comTelefone).toEqual(['SUPER_ADMIN', 'OUVIDORIA'])
  })

  it('o Visualizador não vê respostas, comentários nem a exportação detalhada', () => {
    for (const permissao of ['respostas:ver', 'comentarios:ver', 'exportacao:detalhada'] as const) {
      expect(permissoesDoPerfil('VISUALIZADOR')).not.toContain(permissao)
    }
  })

  it('não pode ser alterado em tempo de execução', () => {
    expect(Object.isFrozen(PERMISSOES_POR_PERFIL)).toBe(true)
    expect(Object.isFrozen(PERMISSOES_POR_PERFIL.GESTOR)).toBe(true)
  })
})
