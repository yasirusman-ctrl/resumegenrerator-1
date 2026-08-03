import { describe, it, expect } from 'vitest'
import { validateResume } from './validator.js'

describe('resume validator', () => {
  it('flags missing name', () => {
    const result = validateResume({ sections: [], contact: {}, summary: '', skills: [] })
    expect(result.pass).toBe(false)
    expect(result.issues.some(i => i.field === 'name' && i.severity === 'error')).toBe(true)
  })

  it('flags bad email', () => {
    const result = validateResume({ sections: [], contact: { name: 'A', email: 'nope' }, summary: '', skills: [] })
    expect(result.issues.some(i => i.field === 'email')).toBe(true)
  })

  it('flags empty bullets', () => {
    const result = validateResume({
      sections: [{ id: '1', type: 'exp', title: 'Experience', items: ['', 'valid'] }],
      contact: { name: 'A' },
      summary: 'ok',
      skills: ['ts'],
    })
    expect(result.issues.some(i => i.message.includes('empty bullet'))).toBe(true)
  })

  it('detects duplicates', () => {
    const result = validateResume({
      sections: [{ id: '1', type: 'exp', title: 'Experience', items: ['Built things', 'Built things'] }],
      contact: { name: 'A' },
      summary: 'ok',
      skills: [],
    })
    expect(result.issues.some(i => i.message.includes('Duplicate'))).toBe(true)
  })

  it('scores clean resumes high', () => {
    const result = validateResume({
      sections: [{ id: '1', type: 'experience', title: 'Experience', items: ['Built a thing that increased usage 40%'] }],
      contact: { name: 'Ada', email: 'ada@example.com', phone: '+1 555 0100' },
      summary: 'Engineer focused on impact.',
      skills: ['TypeScript', 'SQL'],
    })
    expect(result.score).toBeGreaterThan(70)
  })
})
