import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { escapeLatex } from '../utils/latex.js'
import { renderTemplateString, buildRenderContext } from './templateEngine.js'
import { getTranslations } from '../db/teams.js'
import type { TemplateRow } from '../types.js'

export type ExportFormat = 'html' | 'txt' | 'docx' | 'pdf'

interface ExportInput {
  data: { contact?: Record<string, string>; summary?: string; skills?: string[]; sections: Array<{ type: string; title: string; items: string[] }> }
  template?: TemplateRow | null
  accent: string
  font: string
  locale: string
  variables?: Record<string, string>
}

function localTitle(type: string, title: string, locale: string): string {
  const key = `section.${type}`
  const t = getTranslations(locale)[key]
  return t || title
}

export function renderDocHtml(input: ExportInput): string {
  const { data, accent = 'blue', font = 'inter' } = input
  const context = buildRenderContext({ ...input, accent, font })

  if (input.template?.content_html) {
    return renderTemplateString(input.template.content_html, context as unknown as Record<string, unknown>)
  }

  const contact = data.contact || {}
  const sectionHtml = (data.sections || [])
    .map(s => `
      <section>
        <h2>${esc(localTitle(s.type, s.title, input.locale))}</h2>
        <ul>${s.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      </section>`)
    .join('')

  const skillsHtml = data.skills?.length
    ? `<section><h2>${esc(localTitle('skills', 'Skills', input.locale))}</h2><p>${esc(data.skills.join(', '))}</p></section>`
    : ''

  return `<!DOCTYPE html>
<html lang="${input.locale}">
<head><meta charset="UTF-8"><title>${esc(contact.name || 'Resume')}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#f8fafc;color:#1e293b;line-height:1.6;padding:2rem}
.container{max-width:800px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:2.5rem}
h1{font-size:2rem;color:#0f172a;border-bottom:3px solid ${accent};padding-bottom:.5rem}
.contact{color:#64748b;font-size:.9rem;margin-top:.5rem}
section{margin-top:1.5rem}
h2{font-size:1.1rem;color:#0f172a;border-bottom:2px solid #e2e8f0;margin-bottom:.75rem;padding-bottom:.25rem}
ul{padding-left:1.25rem}li{margin-bottom:.25rem;font-size:.9rem;color:#475569}
p{font-size:.95rem;color:#475569}
</style></head>
<body><div class="container">
<h1>${esc(contact.name || '')}</h1>
<div class="contact">${[contact.email, contact.phone, contact.location, contact.website].filter(Boolean).join(' &middot; ')}</div>
${data.summary ? `<p style="margin-top:1rem">${esc(data.summary)}</p>` : ''}
${skillsHtml}
${sectionHtml}
</div></body></html>`
}

export function renderDocText(input: ExportInput): string {
  const { data } = input
  const contact = data.contact || {}
  const lines: string[] = []
  lines.push(contact.name || '')
  lines.push([contact.email, contact.phone, contact.location, contact.website].filter(Boolean).join(' | '))
  if (data.summary) lines.push('', data.summary)
  if (data.skills?.length) lines.push('', 'SKILLS', data.skills.join(', '))
  for (const s of data.sections || []) {
    lines.push('', s.title.toUpperCase())
    lines.push(...s.items.map(i => `- ${i}`))
  }
  return lines.join('\n')
}

export async function renderDocDocx(input: ExportInput): Promise<Buffer> {
  const { data } = input
  const contact = data.contact || {}
  const children: Paragraph[] = []

  const contactLine = [contact.name, contact.email, contact.phone, contact.location, contact.website].filter(Boolean).join(' | ')
  children.push(
    new Paragraph({ text: contact.name || '', heading: HeadingLevel.TITLE }),
    new Paragraph({ text: contactLine, alignment: AlignmentType.LEFT }),
  )
  if (data.summary) children.push(new Paragraph({ text: '' }), new Paragraph({ text: data.summary }))
  if (data.skills?.length) {
    children.push(new Paragraph({ text: 'SKILLS', heading: HeadingLevel.HEADING_2 }), new Paragraph({ text: data.skills.join(', ') }))
  }
  for (const s of data.sections || []) {
    children.push(new Paragraph({ text: s.title, heading: HeadingLevel.HEADING_2 }))
    for (const item of s.items) {
      children.push(new Paragraph({ children: [new TextRun({ text: '• ' }), new TextRun(item)] }))
    }
  }
  const doc = new Document({ sections: [{ children }] })
  return Buffer.from(await Packer.toBuffer(doc))
}

export function renderDocLatex(input: ExportInput): string {
  const { data, accent = 'blue', font = 'inter' } = input
  const escapeCtx = (v: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      out[k] = typeof val === 'string' ? escapeLatex(val) : val
    }
    return out
  }

  if (input.template?.content_tex) {
    const ctx = buildRenderContext({ ...input, accent, font })
    return renderTemplateString(input.template.content_tex, escapeCtx(ctx as unknown as Record<string, unknown>), { raw: true })
  }

  const contact = data.contact || {}
  const items = (data.sections || [])
    .map(s => `\\section{${escapeLatex(localTitle(s.type, s.title, input.locale))}}\n${s.items.map(i => `\\begin{itemize}\n\\item ${escapeLatex(i)}\n\\end{itemize}`).join('\n')}`)
    .join('\n\n')
  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{enumitem}
\\usepackage{parskip}
\\usepackage{xcolor}
\\definecolor{accent}{HTML}{${accentToHex(accent)}}
\\title{${escapeLatex(contact.name || '')}}
\\begin{document}
\\begin{center}
{\\LARGE\\textbf{${escapeLatex(contact.name || '')}}}\\\\[0.3em]
{\\small ${escapeLatex([contact.email, contact.phone, contact.location, contact.website].filter(Boolean).join(' | '))}}
\\end{center}
\\vspace{1em}
${data.summary ? `\\textcolor{accent}{\\textbf{Summary}}\\\\[0.2em]${escapeLatex(data.summary)}\n\n` : ''}
${items}
\\end{document}`
}

function accentToHex(accent: string): string {
  const map: Record<string, string> = { blue: '2563eb', green: '16a34a', red: 'dc2626', purple: '9333ea', orange: 'ea580c', teal: '0d9488', pink: 'db2777', gray: '4b5563' }
  return map[accent] || '2563eb'
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
