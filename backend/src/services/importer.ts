import { fetchGitHubUserData } from './github.js'
import type { ResumeData } from '../db/docs.js'

export interface ImportSource {
  name: string
  email: string
  phone: string
  location: string
  website: string
  linkedin: string
  github: string
  summary: string
  skills: string[]
  experience: Array<{ role: string; company: string; dates: string; bullets: string[] }>
  education: Array<{ school: string; degree: string; dates: string }>
  projects: Array<{ name: string; description: string; url: string }>
}

export const SOURCE_FIELDS = [
  'name', 'email', 'phone', 'location', 'website', 'linkedin', 'github',
  'summary', 'skills', 'experience', 'education', 'projects',
]

export function emptySource(): ImportSource {
  return { name: '', email: '', phone: '', location: '', website: '', linkedin: '', github: '', summary: '', skills: [], experience: [], education: [], projects: [] }
}

export function parseLinkedIn(raw: string): ImportSource {
  const source = emptySource()
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = lines[i]
    if (/^[A-Z][a-z]+(\s[A-Z][a-z]+){1,3}$/.test(line) && !source.name && !/@/.test(line)) {
      source.name = line
      continue
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const emailMatch = line.match(/[\w.+-]+@[\w-]+\.[\w.]+/)
    if (!source.email && emailMatch) source.email = emailMatch[0]
    if (!source.phone && /(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/.test(line) && line.length < 30) source.phone = line
    if (!source.location && /(United States|UK|Canada|India|Germany|Remote|Berlin|London|New York|San Francisco|Bangalore|Singapore)/.test(line) && line.length < 80) {
      source.location = line
    }
    if (!source.summary && /summary|about/i.test(line) && lines[i + 1]) source.summary = lines[i + 1]
    if (/linkedin\.com\/in\//.test(line) && !source.linkedin) source.linkedin = line.match(/linkedin\.com\/in\/[\w-]+/)?.[0] || ''
    if (/github\.com\//.test(line) && !source.github) source.github = line.match(/github\.com\/[\w-]+/)?.[0] || ''
    if (/^(skills|top skills)$/i.test(line)) {
      const skillLine = lines[i + 1] || ''
      source.skills = skillLine.split(/[|,•·\t]/).map(s => s.trim()).filter(s => s && s.length < 40)
    }
  }

  // experience: sections between "Experience" and "Education"
  const expStart = lines.findIndex(l => /^experience$/i.test(l))
  const eduStart = lines.findIndex(l => /^education$/i.test(l))
  if (expStart >= 0) {
    const end = eduStart > expStart ? eduStart : lines.length
    let current: ImportSource['experience'][number] | null = null
    for (let i = expStart + 1; i < end; i++) {
      const l = lines[i]
      if (/^(experience|education|projects|honors|awards|certifications)$/i.test(l)) continue
      if (current && /^\d{4}( – | - |–)\d{4}$/.test(l)) { current.dates = l; continue }
      const roleMatch = l.match(/^([A-Z][A-Za-z .&'-]+)\s*(?:at|@|—|-)?\s*([A-Za-z0-9 .&'-]{2,40})$/)
      if (roleMatch && l.length < 60 && !current) {
        current = { role: roleMatch[1].trim(), company: roleMatch[2].trim(), dates: '', bullets: [] }
        source.experience.push(current)
      } else if (current && l.length > 30) {
        current.bullets.push(l)
      }
    }
  }

  if (eduStart >= 0) {
    for (let i = eduStart + 1; i < Math.min(lines.length, eduStart + 8); i++) {
      const l = lines[i]
      const schoolMatch = l.match(/^([A-Z][A-Za-z0-9 .&'-]{3,60})(?:,)?\s+(\d{4})\s*(?:–|-)\s*(\d{4}|\w+)?/)
      if (schoolMatch) {
        source.education.push({ school: schoolMatch[1].trim(), degree: '', dates: `${schoolMatch[2]}${schoolMatch[3] ? ' – ' + schoolMatch[3] : ''}` })
        continue
      }
      if (/^[A-Z][A-Za-z0-9 .&'-]{3,60}$/.test(l) && /^\d{4}\s*(?:–|-)\s*(\d{4}|\w+)?$/.test(lines[i + 1] || '') && !/^(experience|education|projects|skills)$/i.test(l)) {
        source.education.push({ school: l.trim(), degree: '', dates: lines[i + 1].trim() })
        i++
      }
    }
  }

  return source
}

export function sourceToResumeData(source: ImportSource): ResumeData {
  const sections: ResumeData['sections'] = []
  if (source.experience.length) {
    sections.push({
      id: 'exp',
      type: 'experience',
      title: 'Experience',
      items: source.experience.map(e => [e.role, e.company, e.dates].filter(Boolean).join(' — ') + (e.bullets.length ? `: ${e.bullets.join('; ')}` : '')),
    })
  }
  if (source.education.length) {
    sections.push({
      id: 'edu',
      type: 'education',
      title: 'Education',
      items: source.education.map(e => [e.degree, e.school, e.dates].filter(Boolean).join(' — ')),
    })
  }
  if (source.projects.length) {
    sections.push({
      id: 'proj',
      type: 'projects',
      title: 'Projects',
      items: source.projects.map(p => p.name + (p.description ? `: ${p.description}` : '')),
    })
  }
  return {
    sections,
    contact: {
      name: source.name,
      email: source.email,
      phone: source.phone,
      location: source.location,
      website: source.website,
      linkedin: source.linkedin,
      github: source.github,
      languages: source.skills.slice(0, 5).join(', '),
    },
    summary: source.summary,
    skills: source.skills,
  }
}

export async function importFromGitHub(username: string): Promise<ImportSource> {
  const user = await fetchGitHubUserData(username)
  const source = emptySource()
  source.name = user.name
  source.email = user.email
  source.location = user.location
  source.website = user.website
  source.github = user.githubUrl
  source.summary = user.bio
  source.skills = Object.keys(user.languageBreakdown).slice(0, 10)
  source.projects = user.projects.map(p => ({ name: p.name, description: p.description, url: p.url }))
  return source
}

export function applyMapping(source: ImportSource, mapping: Record<string, string>): ImportSource {
  const out = { ...source, contact: undefined as never } as unknown as Record<string, unknown>
  const mapped = { ...source } as unknown as Record<string, unknown>
  for (const [from, to] of Object.entries(mapping)) {
    if (!(from in source) || !to || to === from) continue
    mapped[to] = source[from as keyof ImportSource]
    if (to !== from) delete mapped[from]
  }
  return mapped as unknown as ImportSource
}
