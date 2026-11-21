import lint from '@commitlint/lint'
import load from '@commitlint/load'
import { describe, expect, it } from 'vitest'

// Confere o commitlint.config.js, o mesmo que o hook commit-msg do Husky usa.
async function conferir(mensagem: string) {
  const config = await load({}, { cwd: process.cwd() })
  const resultado = await lint(mensagem, config.rules, {
    plugins: config.plugins,
    parserOpts: config.parserPreset?.parserOpts as never,
    defaultIgnores: config.defaultIgnores,
    ignores: config.ignores,
  })
  return { valida: resultado.valid, regras: resultado.errors.map((erro) => erro.name) }
}

describe('commitlint', () => {
  it.each([
    'feat(health): rota /api/health com o estado do banco',
    'chore: configuração do Claude Code sem coautoria',
    'docs(tickets): divide o backend em 20 tickets',
    'fix(auth): renovar o token só uma vez\n\nCo-authored-by: Maria Souza <maria@exemplo.com.br>',
    'Merge pull request #21 from GabrielPittaBr/chore/01-configuracao-dos-agentes',
  ])('aceita %j', async (mensagem) => {
    expect(await conferir(mensagem)).toEqual({ valida: true, regras: [] })
  })

  it.each([
    ['tipo fora da lista', 'feature: rota nova', 'type-enum'],
    ['descrição com maiúscula', 'feat: Rota nova', 'subject-case'],
    ['ponto final', 'feat: rota nova.', 'subject-full-stop'],
    ['sem tipo', 'rota nova', 'type-empty'],
  ])('recusa %s', async (_caso, mensagem, regra) => {
    const { valida, regras } = await conferir(mensagem)
    expect(valida).toBe(false)
    expect(regras).toContain(regra)
  })

  it.each([
    'feat: rota nova\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
    'feat: rota nova\n\nco-authored-by: claude <noreply@anthropic.com>',
    'feat: rota nova\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    'feat: rota nova\n\nClaude-Session: https://claude.ai/code/session_123',
  ])('recusa coautoria ou assinatura do Claude: %j', async (mensagem) => {
    const { valida, regras } = await conferir(mensagem)
    expect(valida).toBe(false)
    expect(regras).toEqual(['sem-coautoria-do-claude'])
  })
})
