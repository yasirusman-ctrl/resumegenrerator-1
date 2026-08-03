import { describe, it, expect } from 'vitest'
import { parseCron, nextRunAfter } from './scheduler.js'

describe('cron parser', () => {
  it('parses five fields', () => {
    const spec = parseCron('0 9 * * 1-5')
    expect(spec.minutes.has(0)).toBe(true)
    expect(spec.hours.has(9)).toBe(true)
    expect(spec.dows.has(1)).toBe(true)
    expect(spec.dows.has(5)).toBe(true)
    expect(spec.dows.has(6)).toBe(false)
  })

  it('supports star and step', () => {
    const spec = parseCron('*/15 * * * *')
    expect(spec.minutes.has(0)).toBe(true)
    expect(spec.minutes.has(15)).toBe(true)
    expect(spec.minutes.has(45)).toBe(true)
    expect(spec.minutes.has(59)).toBe(false)
  })

  it('rejects wrong field count', () => {
    expect(() => parseCron('0 9 * *')).toThrow()
  })

  it('computes next run', () => {
    const from = new Date('2026-08-03T08:00:00Z')
    const next = nextRunAfter('0 9 * * *', from)
    expect(next.toISOString().slice(0, 16)).toBe('2026-08-03T09:00')
  })

  it('skips to next day for out-of-range hour', () => {
    const from = new Date('2026-08-03T10:00:00Z')
    const next = nextRunAfter('0 9 * * *', from)
    expect(next.getUTCDate()).toBe(4)
  })
})
