import { describe, it, expect } from 'vitest'
import { parseLinkedIn, sourceToResumeData, applyMapping } from './importer.js'

const SAMPLE = `
Ada Lovelace
Senior Software Engineer at Acme
London, United Kingdom
ada@example.com
https://www.linkedin.com/in/ada-lovelace
https://github.com/ada
Skills
TypeScript | Python | SQL | Docker
Experience
Senior Software Engineer at Acme
2020 - 2025
Led a team of 5 shipping the core platform.
Reduced deployment time by 40%.
Education
University of London
2012 - 2016
`

describe('LinkedIn importer', () => {
  it('extracts profile fields', () => {
    const source = parseLinkedIn(SAMPLE)
    expect(source.name).toBe('Ada Lovelace')
    expect(source.email).toContain('@')
    expect(source.linkedin).toContain('linkedin.com/in/')
    expect(source.github).toContain('github.com/')
    expect(source.skills).toContain('TypeScript')
  })

  it('extracts experience', () => {
    const source = parseLinkedIn(SAMPLE)
    expect(source.experience.length).toBeGreaterThan(0)
    expect(source.experience[0].role.toLowerCase()).toContain('engineer')
    expect(source.experience[0].bullets.length).toBeGreaterThan(0)
  })

  it('maps source to resume data', () => {
    const source = parseLinkedIn(SAMPLE)
    const data = sourceToResumeData(source)
    expect(data.contact.name).toBe('Ada Lovelace')
    expect(data.sections.some(s => s.type === 'experience')).toBe(true)
    expect(data.sections.some(s => s.type === 'education')).toBe(true)
  })

  it('applies field mapping', () => {
    const source = parseLinkedIn(SAMPLE)
    const mapped = applyMapping(source, { github: 'website' })
    expect(mapped.website).toContain('github.com')
    expect((mapped as unknown as Record<string, unknown>).github).toBeUndefined()
  })
})
