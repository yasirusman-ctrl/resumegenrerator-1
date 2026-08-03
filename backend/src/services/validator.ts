import type { ResumeData } from '../db/docs.js'

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  category: 'contact' | 'content' | 'formatting' | 'accessibility' | 'quality'
  message: string
  field?: string
}

export interface ValidationResult {
  score: number
  pass: boolean
  issues: ValidationIssue[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+\d][\d\s().-]{6,20}$/
const URL_RE = /^https?:\/\/\S+$/

export function validateResume(data: ResumeData): ValidationResult {
  const issues: ValidationIssue[] = []
  const contact = data.contact || {}
  const sections = data.sections || []

  // Contact
  if (!contact.name?.trim()) issues.push({ severity: 'error', category: 'contact', message: 'Name is missing. Add a name to the contact block.', field: 'name' })
  if (contact.email && !EMAIL_RE.test(contact.email)) issues.push({ severity: 'warning', category: 'contact', message: 'Email address does not look valid.', field: 'email' })
  if (contact.phone && !PHONE_RE.test(contact.phone)) issues.push({ severity: 'info', category: 'contact', message: 'Phone number format is unusual.', field: 'phone' })
  if (contact.website && !URL_RE.test(contact.website)) issues.push({ severity: 'warning', category: 'contact', message: 'Website should start with http(s)://', field: 'website' })
  if (!contact.email && !contact.phone && !contact.linkedin && !contact.github) {
    issues.push({ severity: 'warning', category: 'contact', message: 'No contact details found. Recruiters need at least one way to reach you.' })
  }

  // Content
  if (!data.summary?.trim()) issues.push({ severity: 'warning', category: 'content', message: 'Summary is empty. A 2-3 sentence summary improves recruiter scanning.' })
  if (!sections.length) issues.push({ severity: 'error', category: 'content', message: 'No resume sections defined.' })
  const hasExperience = sections.some(s => /experience|work|employment/i.test(s.type) || /experience|work|employment/i.test(s.title))
  if (!hasExperience) issues.push({ severity: 'info', category: 'content', message: 'No experience section found.' })

  const allItems = sections.flatMap(s => s.items)
  const emptyItems = allItems.filter(i => !i.trim())
  if (emptyItems.length) issues.push({ severity: 'error', category: 'content', message: `${emptyItems.length} empty bullet point(s) found.` })

  const longBullets = allItems.filter(i => i.split(' ').length > 35)
  if (longBullets.length) issues.push({ severity: 'warning', category: 'quality', message: `${longBullets.length} bullet(s) exceed 35 words; consider tightening.` })

  const shortBullets = allItems.filter(i => i.trim() && i.split(' ').length < 4)
  if (shortBullets.length) issues.push({ severity: 'info', category: 'quality', message: `${shortBullets.length} bullet(s) are very short (<4 words).` })

  const quantified = allItems.filter(i => /\d+%|\d+\s*(users|revenue|times|requests|tests|people|team|projects)|(\$\s*[\d,]+)/i.test(i))
  if (allItems.length >= 5 && quantified.length / allItems.length < 0.2) {
    issues.push({ severity: 'info', category: 'quality', message: 'Few bullets contain metrics. Quantify impact with numbers where possible.' })
  }

  const skills = data.skills || []
  if (skills.length > 25) issues.push({ severity: 'info', category: 'quality', message: 'Large skill list (>25). Consider trimming to the most relevant.' })

  // Formatting
  const trailing = allItems.filter(i => /\s$/.test(i) || /\.{2,}$/.test(i))
  if (trailing.length) issues.push({ severity: 'warning', category: 'formatting', message: `${trailing.length} item(s) have trailing whitespace or multiple periods.` })

  const mixedCase = allItems.filter(i => /[a-z]+[A-Z]/.test(i.replace(/https?:\/\//, '')))
  if (mixedCase.length) issues.push({ severity: 'info', category: 'formatting', message: `${mixedCase.length} item(s) use inconsistent casing (e.g. camelCase mid-sentence).` })

  const dupes = new Map<string, number>()
  for (const i of allItems) {
    const norm = i.toLowerCase().trim()
    if (norm) dupes.set(norm, (dupes.get(norm) || 0) + 1)
  }
  for (const [text, count] of dupes) {
    if (count > 1) issues.push({ severity: 'warning', category: 'quality', message: `Duplicate bullet found ${count}x: "${text.slice(0, 50)}…"` })
  }

  // Accessibility
  if (!sections.some(s => /education|degree|school/i.test(s.type) || /education|degree|school/i.test(s.title))) {
    issues.push({ severity: 'info', category: 'accessibility', message: 'No education section; omit if you prefer.' })
  }
  const fontSizes = contact.fontSize || contact.font
  if (!fontSizes && !contact['font-size']) {
    issues.push({ severity: 'info', category: 'accessibility', message: 'Font size not specified on exported HTML; defaults to accessible 16px.', field: 'font' })
  }
  const colorPairs = contact.colorOnWhite
  if (colorPairs === 'low') issues.push({ severity: 'warning', category: 'accessibility', message: 'Low contrast color scheme detected; ensure WCAG AA contrast.' })

  const score = Math.max(0, Math.min(100, 100 - issues.reduce((acc, i) => acc + (i.severity === 'error' ? 20 : i.severity === 'warning' ? 8 : 3), 0)))
  return {
    score,
    pass: !issues.some(i => i.severity === 'error'),
    issues: issues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
  }
}

function severityRank(s: 'error' | 'warning' | 'info'): number {
  return s === 'error' ? 0 : s === 'warning' ? 1 : 2
}
