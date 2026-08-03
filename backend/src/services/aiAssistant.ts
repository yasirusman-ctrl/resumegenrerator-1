import { createLogger } from '../utils/logger.js'

const log = createLogger('ai')

export type Tone = 'formal' | 'concise' | 'action' | 'friendly'

const TONE_PREFIX: Record<Tone, string[]> = {
  formal: ['Served as', 'Responsible for', 'Accountable for'],
  concise: ['Handled', 'Did', 'Owned'],
  action: ['Delivered', 'Drove', 'Engineered', 'Shipped'],
  friendly: ['Helped the team', 'Supported', 'Collaborated to'],
}

const TONE_SUFFIX: Record<Tone, string[]> = {
  formal: [' in a professional capacity', ' with a focus on quality', ' across multiple stakeholders'],
  concise: [' end-to-end', ' on time', ' with measurable results'],
  action: [' end-to-end', ' resulting in measurable impact', ' at scale'],
  friendly: [' with teammates', ' for customers', ' together with cross-functional partners'],
}

export const TONES: Tone[] = ['formal', 'concise', 'action', 'friendly']

const ROLE_BULLETS: Record<string, string[]> = {
  engineer: [
    'Built and shipped production features used by {users} users',
    'Improved code quality by introducing {tests} automated tests',
    'Reduced deployment time by {pct}% through CI/CD pipeline improvements',
    'Collaborated with cross-functional teams to deliver roadmap milestones',
    'Mentored junior engineers through code reviews and pair programming',
  ],
  designer: [
    'Designed user flows and high-fidelity mockups for {users} users',
    'Ran usability testing sessions and translated insights into design improvements',
    'Built and maintained a design system used across {users} screens',
    'Collaborated with product and engineering to ship accessible experiences',
  ],
  product: [
    'Defined product strategy and roadmap for a platform serving {users} users',
    'Shipped {count} features per quarter by prioritizing against success metrics',
    'Partnered with engineering and design to align execution with business goals',
    'Analyzed user data to inform feature prioritization and go/no-go decisions',
  ],
  data: [
    'Built dashboards that tracked key metrics for {users} stakeholders',
    'Cleaned and modeled datasets used for forecasting and reporting',
    'Automated ETL pipelines reducing manual reporting effort by {pct}%',
    'Presented data-driven insights to leadership to inform strategy',
  ],
  marketing: [
    'Launched campaigns that reached {users} users with measurable lift',
    'Grew organic channel performance by {pct}% through content optimization',
    'Managed a marketing calendar and coordinated cross-team launches',
    'A/B tested messaging to improve conversion by {pct}%',
  ],
  manager: [
    'Managed a team of {count} people, hiring, coaching, and developing talent',
    'Improved team throughput by {pct}% through process improvements',
    'Set OKRs and tracked progress to keep the team focused on outcomes',
    'Unblocked teams by removing organizational friction',
  ],
}

const ROLE_SUMMARIES: Record<string, string> = {
  engineer:
    'Software engineer with a track record of shipping reliable, maintainable systems. Strong in system design, testing, and cross-functional collaboration. Driven by measurable impact and continuous learning.',
  designer:
    'Product designer focused on crafting intuitive, accessible experiences that move business metrics. Comfortable moving from research and flows to polished, developer-ready UI.',
  product:
    'Product manager with experience taking features from idea to launch by aligning users, business, and engineering. Skilled in prioritization, roadmapping, and data-informed decisions.',
  data:
    'Analyst and data engineer who turns messy data into decisions. Experienced with pipelines, modeling, dashboards, and translating technical findings for non-technical audiences.',
  marketing:
    'Growth marketer who builds campaigns and funnels with measurable ROI. Blends creative storytelling with rigorous A/B testing and channel analytics.',
  manager:
    'People-focused engineering manager who builds high-trust teams and delivers through others. Experienced in hiring, coaching, and improving team health and throughput.',
  default:
    'Results-driven professional with hands-on experience delivering high-quality work. Known for ownership, clear communication, and a bias toward measurable outcomes.',
}

const ACTION_VERBS = [
  'Built', 'Led', 'Designed', 'Launched', 'Optimized', 'Automated', 'Shipped', 'Improved',
  'Reduced', 'Increased', 'Owned', 'Drove', 'Developed', 'Mentored', 'Implemented', 'Resolved',
]

function roleKey(role: string): string {
  const r = role.toLowerCase()
  if (/(engineer|developer|programmer|software|backend|frontend|fullstack|full-stack|dev)/.test(r)) return 'engineer'
  if (/(design|ux|ui)/.test(r)) return 'designer'
  if (/(product|pm)/.test(r)) return 'product'
  if (/(data|analyst|analytics|scientist|bi)/.test(r)) return 'data'
  if (/(market|growth|content|seo)/.test(r)) return 'marketing'
  if (/(manager|lead|head|director)/.test(r)) return 'manager'
  return 'default'
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? 'X'))
}

export interface AiOptions {
  provider?: 'local' | 'remote'
}

async function maybeCallLLM<T>(payload: Record<string, unknown>, fallback: T): Promise<T> {
  const base = process.env.AI_API_URL
  const key = process.env.AI_API_KEY
  if (!base || !key) return fallback
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ ...payload, temperature: 0.7 }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return fallback
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    if (!content) return fallback
    try {
      return JSON.parse(content) as T
    } catch {
      return content as unknown as T
    }
  } catch (err) {
    log.warn({ err }, 'LLM call failed, falling back to local')
    return fallback
  }
}

export function suggestBulletsLocal(role: string, existing: string[] = []): string[] {
  const key = roleKey(role)
  const bank = ROLE_BULLETS[key] || ROLE_BULLETS.default
  const base = bank.map(b => fill(b, { users: 1000 + Math.floor(Math.random() * 40000), count: 3 + Math.floor(Math.random() * 5), pct: 10 + Math.floor(Math.random() * 50) }))
  const seen = new Set(existing.map(b => b.toLowerCase().trim()))
  const fresh = base.filter(b => !seen.has(b.toLowerCase().trim()))
  const fallback = ACTION_VERBS.map(v => `${v} ${role} workstreams with measurable results.`).slice(0, 4)
  const candidates = [...fresh.slice(0, 4), ...fallback].filter(b => !seen.has(b.toLowerCase().trim()))
  return candidates.slice(0, 5)
}

export function rewriteBulletLocal(text: string, tone: Tone): string {
  const cleaned = text.trim().replace(/[.!]$/, '')
  const lower = cleaned.charAt(0).toLowerCase() + cleaned.slice(1)
  const prefix = TONE_PREFIX[tone][Math.floor(Math.random() * TONE_PREFIX[tone].length)]
  const suffix = TONE_SUFFIX[tone][Math.floor(Math.random() * TONE_SUFFIX[tone].length)]
  return `${prefix} ${lower}${suffix}.`
}

export function generateSummaryLocal(role: string, skills: string[] = []): string {
  const key = roleKey(role)
  const base = ROLE_SUMMARIES[key] || ROLE_SUMMARIES.default
  if (!skills.length) return base
  const skillLine = skills.slice(0, 5).join(', ')
  return `${base} Core skills include ${skillLine}.`
}

export function suggestSkillsLocal(role: string): string[] {
  const map: Record<string, string[]> = {
    engineer: ['TypeScript', 'React', 'Node.js', 'Python', 'PostgreSQL', 'AWS', 'Docker', 'CI/CD'],
    designer: ['Figma', 'Prototyping', 'User Research', 'Design Systems', 'Accessibility', 'HTML/CSS'],
    product: ['Roadmapping', 'Prioritization', 'A/B Testing', 'SQL', 'Stakeholder Management', 'Agile'],
    data: ['SQL', 'Python', 'Pandas', 'dbt', 'Tableau', 'ETL', 'Statistical Modeling'],
    marketing: ['SEO', 'Content Strategy', 'Email Marketing', 'Google Analytics', 'Paid Social', 'A/B Testing'],
    manager: ['Hiring', 'Coaching', 'OKRs', 'Agile', 'Budget Management', 'Cross-team Collaboration'],
  }
  return map[roleKey(role)] || map.engineer
}

export async function suggestBullets(role: string, existing: string[] = [], opts: AiOptions = {}) {
  if (opts.provider === 'remote') {
    const remote = await maybeCallLLM(
      {
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a resume coach. Given a role and existing bullets, return 4 new resume bullet points as a JSON array of strings. Do not repeat existing bullets.' },
          { role: 'user', content: `Role: ${role}\nExisting bullets: ${JSON.stringify(existing)}` },
        ],
      },
      null,
    )
    if (remote) return { bullets: remote, provider: 'remote' as const }
  }
  return { bullets: suggestBulletsLocal(role, existing), provider: 'local' as const }
}

export async function rewriteBullet(text: string, tone: Tone, opts: AiOptions = {}) {
  if (opts.provider === 'remote') {
    const remote = await maybeCallLLM(
      {
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Rewrite a resume bullet in a ${tone} tone. Return only the rewritten bullet as a JSON string.` },
          { role: 'user', content: text },
        ],
      },
      null,
    )
    if (remote) return { bullet: remote as string, provider: 'remote' as const }
  }
  return { bullet: rewriteBulletLocal(text, tone), provider: 'local' as const }
}

export async function generateSummary(role: string, skills: string[] = [], opts: AiOptions = {}) {
  if (opts.provider === 'remote') {
    const remote = await maybeCallLLM(
      {
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Write a 2-3 sentence professional resume summary tailored to the role and skills. Return as a JSON string.' },
          { role: 'user', content: `Role: ${role}\nSkills: ${JSON.stringify(skills)}` },
        ],
      },
      null,
    )
    if (remote) return { summary: remote as string, provider: 'remote' as const }
  }
  return { summary: generateSummaryLocal(role, skills), provider: 'local' as const }
}

export async function suggestSkills(role: string, opts: AiOptions = {}) {
  if (opts.provider === 'remote') {
    const remote = await maybeCallLLM(
      {
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Return a JSON array of 8 relevant skills for the given role.' },
          { role: 'user', content: role },
        ],
      },
      null,
    )
    if (remote) return { skills: remote, provider: 'remote' as const }
  }
  return { skills: suggestSkillsLocal(role), provider: 'local' as const }
}
