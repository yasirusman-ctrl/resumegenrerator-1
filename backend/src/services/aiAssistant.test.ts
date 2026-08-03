import { describe, it, expect } from 'vitest'
import { suggestBulletsLocal, rewriteBulletLocal, generateSummaryLocal, suggestSkillsLocal } from './aiAssistant.js'

describe('AI assistant (local mode)', () => {
  it('suggests bullets for a role', () => {
    const bullets = suggestBulletsLocal('software engineer')
    expect(bullets.length).toBeGreaterThan(0)
    expect(bullets[0].length).toBeGreaterThan(10)
  })

  it('does not duplicate existing bullets', () => {
    const existing = suggestBulletsLocal('product manager')
    const fresh = suggestBulletsLocal('product manager', existing)
    for (const f of fresh) {
      expect(existing.some(e => e === f)).toBe(false)
    }
  })

  it('rewrites bullets per tone', () => {
    const out = rewriteBulletLocal('built the login page', 'action')
    expect(out.length).toBeGreaterThan(0)
    const concise = rewriteBulletLocal('helped the team ship releases', 'concise')
    expect(concise.endsWith('.')).toBe(true)
  })

  it('generates role-tailored summaries', () => {
    const summary = generateSummaryLocal('data scientist', ['SQL', 'Python'])
    expect(summary.toLowerCase()).toContain('data')
    expect(summary).toContain('SQL')
  })

  it('suggests skills', () => {
    const skills = suggestSkillsLocal('ui designer')
    expect(skills).toContain('Figma')
  })
})
