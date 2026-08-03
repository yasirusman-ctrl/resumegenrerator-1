import { describe, it, expect } from 'vitest'
import { renderTemplateString, buildRenderContext } from './templateEngine.js'

describe('template engine', () => {
  it('interpolates values', () => {
    expect(renderTemplateString('Hello {{name}}', { name: 'Ada' })).toBe('Hello Ada')
  })

  it('escapes HTML by default', () => {
    expect(renderTemplateString('{{value}}', { value: '<script>alert(1)</script>' })).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('supports raw mode', () => {
    expect(renderTemplateString('{{value}}', { value: '\\item x' }, { raw: true })).toBe('\\item x')
  })

  it('renders each loops', () => {
    const t = '{{#each items}}{{item}};{{/each}}'
    expect(renderTemplateString(t, { items: ['a', 'b', 'c'] })).toBe('a;b;c;')
  })

  it('renders if/else', () => {
    expect(renderTemplateString('{{#if summary}}{{summary}}{{else}}none{{/if}}', { summary: 'hi' })).toBe('hi')
    expect(renderTemplateString('{{#if summary}}{{summary}}{{else}}none{{/if}}', {})).toBe('none')
  })

  it('supports nested loops via item', () => {
    const t = '{{#each sections}}[{{item.title}}:{{#each item.items}}{{this}},{{/each}}]{{/each}}'
    const ctx = { sections: [{ title: 'Exp', items: ['x'] }] }
    expect(renderTemplateString(t, ctx)).toBe('[Exp:x,]')
  })

  it('builds render context from resume data', () => {
    const ctx = buildRenderContext({
      data: {
        contact: { name: 'Ada', email: 'a@b.c', languages: 'TS, Python' },
        summary: 's',
        skills: ['TS'],
        sections: [{ id: '1', type: 'exp', title: 'Experience', items: ['a'] } as { type: string; title: string; items: string[] }],
      },
      accent: 'blue',
      font: 'inter',
      locale: 'en',
    })
    expect(ctx.name).toBe('Ada')
    expect(ctx.languages).toEqual(['TS', 'Python'])
    expect(ctx.sections[0].title).toBe('Experience')
  })
})
