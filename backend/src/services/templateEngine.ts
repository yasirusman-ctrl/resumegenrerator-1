export function lookupPath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

interface ParsedBlock { body: string; elseBody: string | null; end: number }

function findMatchingClose(input: string, start: number, type: string): ParsedBlock | null {
  let depth = 0
  let i = start
  let elseTagOpen = -1
  let elseStart = -1
  while (i < input.length) {
    const open = input.indexOf('{{', i)
    if (open === -1) return null
    const close = input.indexOf('}}', open)
    if (close === -1) return null
    const inner = input.slice(open + 2, close).trim()
    const isOpen = inner.startsWith('#')
    const isClose = inner.startsWith('/')
    const tag = isOpen || isClose ? inner.slice(1) : ''
    const tm = tag ? tag.match(/^(each|if)(?:\s+([\w.]+))?$/) : null
    if (tm) {
      if (isOpen) depth++
      else {
        if (depth === 0) {
          if (tm[1] !== type) return null
          return {
            body: input.slice(start, elseTagOpen >= 0 ? elseTagOpen : open),
            elseBody: elseStart >= 0 ? input.slice(elseStart, open) : null,
            end: close + 2,
          }
        }
        depth--
      }
      i = close + 2
      continue
    }
    if (inner === 'else' && depth === 0 && elseStart < 0) {
      elseTagOpen = open
      elseStart = close + 2
      i = elseStart
      continue
    }
    i = close + 2
  }
  return null
}

export function renderTemplateString(template: string, context: Record<string, unknown>, opts: { raw?: boolean } = {}): string {
  const escape = (s: string) => (opts.raw ? s : escapeValue(s))
  return renderSegment(template, context, escape)
}

function renderSegment(input: string, context: Record<string, unknown>, escape: (s: string) => string): string {
  let out = ''
  let i = 0
  while (i < input.length) {
    const open = input.indexOf('{{', i)
    if (open === -1) { out += input.slice(i); break }
    out += input.slice(i, open)
    const close = input.indexOf('}}', open)
    if (close === -1) { out += input.slice(i); break }
    const inner = input.slice(open + 2, close).trim()
    if (inner.startsWith('#')) {
      const m = inner.match(/^#(each|if)\s+([\w.]+)$/)
      if (!m) { out += input.slice(open, close + 2); i = close + 2; continue }
      const type = m[1]
      const path = m[2]
      const block = findMatchingClose(input, close + 2, type)
      if (!block) { out += input.slice(open, close + 2); i = close + 2; continue }
      const value = lookupPath(context, path)
      if (type === 'if') {
        out += renderSegment(isTruthy(value) ? block.body : (block.elseBody ?? ''), context, escape)
      } else {
        if (Array.isArray(value)) {
          for (const item of value) out += renderSegment(block.body, { ...context, this: item, item }, escape)
        } else {
          out += renderSegment(block.elseBody ?? '', context, escape)
        }
      }
      i = block.end
    } else {
      if (inner.startsWith('/') || inner === 'else') { out += input.slice(open, close + 2); i = close + 2; continue }
      const value = lookupPath(context, inner)
      if (value !== null && value !== undefined) out += escape(String(value))
      i = close + 2
    }
  }
  return out
}

function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return value !== 0
  return !!value
}

function escapeValue(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface RenderContext {
  name: string
  title: string
  email: string
  phone: string
  location: string
  website: string
  linkedin: string
  github: string
  summary: string
  skills: string[]
  sections: Array<{ type: string; title: string; items: string[] }>
  languages: string[]
  accent: string
  font: string
  locale: string
  variables: Record<string, string>
}

export function buildRenderContext(data: {
  data: { contact?: Record<string, string>; summary?: string; skills?: string[]; sections: Array<{ type: string; title: string; items: string[] }> }
  accent: string
  font: string
  locale: string
  variables?: Record<string, string>
}): RenderContext {
  const { data: d } = data
  const contact = d.contact || {}
  return {
    name: contact.name || '',
    title: contact.title || '',
    email: contact.email || '',
    phone: contact.phone || '',
    location: contact.location || '',
    website: contact.website || '',
    linkedin: contact.linkedin || '',
    github: contact.github || '',
    summary: d.summary || '',
    skills: d.skills || [],
    sections: d.sections || [],
    languages: (contact.languages || '').split(',').map(s => s.trim()).filter(Boolean),
    accent: data.accent,
    font: data.font,
    locale: data.locale,
    variables: data.variables || {},
  }
}
