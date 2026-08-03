import { getDb } from '../db/schema.js'
import { createTemplate, getTemplateBySlug, updateTemplate } from '../db/marketplace.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('seed')

const MODERN_HTML = `<!DOCTYPE html>
<html lang="{{locale}}">
<head><meta charset="UTF-8"><title>{{name}} — Resume</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#f1f5f9;color:#0f172a;line-height:1.6;padding:2rem}
.page{max-width:820px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 8px 28px rgba(15,23,42,.12);overflow:hidden}
.head{background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;padding:2.2rem 2.5rem}
.head h1{font-size:2rem;font-weight:800}
.head .title{color:#c7d2fe;margin-top:.2rem}
.head .meta{color:#e0e7ff;font-size:.9rem;margin-top:.6rem}
.head .meta a{color:#fff}
.body{padding:2rem 2.5rem}
section{margin-bottom:1.4rem}
h2{font-size:1.05rem;color:#2563eb;border-bottom:2px solid #e2e8f0;padding-bottom:.3rem;margin-bottom:.7rem}
p{font-size:.95rem;color:#334155}
ul{padding-left:1.2rem}li{margin-bottom:.3rem;font-size:.92rem;color:#475569}
.skills{display:flex;flex-wrap:wrap;gap:.4rem}
.skill{background:#eff6ff;color:#1d4ed8;padding:.25rem .6rem;border-radius:999px;font-size:.82rem;font-weight:600}
@media print{body{background:#fff;padding:0}.page{box-shadow:none;border-radius:0}}
</style></head>
<body><div class="page">
  <div class="head">
    <h1>{{name}}</h1>
    {{#if title}}<div class="title">{{title}}</div>{{/if}}
    <div class="meta">
      {{#if email}}<a href="mailto:{{email}}">{{email}}</a>{{/if}}{{#if phone}} · {{phone}}{{/if}}{{#if location}} · {{location}}{{/if}}{{#if website}} · <a href="{{website}}">{{website}}</a>{{/if}}
    </div>
  </div>
  <div class="body">
    {{#if summary}}<section><h2>Summary</h2><p>{{summary}}</p></section>{{/if}}
    {{#if skills}}<section><h2>Skills</h2><div class="skills">{{#each skills}}<span class="skill">{{this}}</span>{{/each}}</div></section>{{/if}}
    {{#each sections}}
    <section>
      <h2>{{item.title}}</h2>
      {{#if item.items}}<ul>{{#each item.items}}<li>{{this}}</li>{{/each}}</ul>{{/if}}
    </section>
    {{/each}}
  </div>
</div></body></html>`

const MODERN_TEX = `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=2.2cm]{geometry}
\\usepackage{enumitem}
\\usepackage{parskip}
\\usepackage{xcolor}
\\definecolor{accent}{HTML}{2563eb}
\\pagestyle{empty}
\\begin{document}
\\begin{center}
{\\LARGE\\bfseries {{name}}}\\\\[0.3em]
{\\small \\color{gray}{{{title}}} \\cdot \\href{mailto:{{email}}}{{{email}}} \\cdot {{phone}} \\cdot {{location}}}
\\end{center}
\\vspace{0.8em}
{{#if summary}}\\textcolor{accent}{\\section*{Summary}}
{{summary}}

{{/if}}
{{#if skills}}\\textcolor{accent}{\\section*{Skills}}
{{#each skills}}{{this}}{{#unless @last}} \\textbullet{} {{/unless}}{{/each}}

{{/if}}
{{#each sections}}
\\textcolor{accent}{\\section*{ {{item.title}} }}
\\begin{itemize}[leftmargin=1.2em]
{{#each item.items}}\\item {{this}}
{{/each}}\\end{itemize}
{{/each}}
\\end{document}`

const MINIMAL_HTML = `<!DOCTYPE html>
<html lang="{{locale}}">
<head><meta charset="UTF-8"><title>{{name}}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#fff;color:#111;line-height:1.6;padding:3rem 2rem}
.page{max-width:680px;margin:0 auto}
h1{font-size:1.9rem;letter-spacing:-.02em}
.meta{color:#666;font-size:.9rem;margin-top:.4rem;border-bottom:1px solid #ddd;padding-bottom:1rem}
section{margin-top:1.5rem}
h2{font-size:.85rem;text-transform:uppercase;letter-spacing:.12em;color:#111;margin-bottom:.5rem}
p{font-size:.95rem;color:#333}
ul{padding-left:1.1rem}li{margin-bottom:.35rem;font-size:.95rem;color:#333}
</style></head>
<body><div class="page">
  <h1>{{name}}</h1>
  {{#if title}}<div class="meta">{{title}}</div>{{/if}}
  {{#if summary}}<section><h2>Summary</h2><p>{{summary}}</p></section>{{/if}}
  {{#each sections}}
  <section><h2>{{item.title}}</h2><ul>{{#each item.items}}<li>{{this}}</li>{{/each}}</ul></section>
  {{/each}}
</div></body></html>`

const MINIMAL_TEX = `\\documentclass[10pt,a4paper]{article}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{enumitem}
\\usepackage{parskip}
\\begin{document}
{\\huge\\bfseries {{name}}}
\\\\[0.2em]
{\\small {{title}} \\cdot {{email}} \\cdot {{phone}} \\cdot {{location}}}
\\vspace{1em}
{{#if summary}}\\section*{Summary}{{summary}}
{{/if}}
{{#each sections}}
\\section*{ {{item.title}} }
\\begin{itemize}[leftmargin=1.2em]
{{#each item.items}}\\item {{this}}
{{/each}}\\end{itemize}
{{/each}}
\\end{document}`

const SIDEBAR_HTML = `<!DOCTYPE html>
<html lang="{{locale}}">
<head><meta charset="UTF-8"><title>{{name}}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#e2e8f0;color:#1e293b;line-height:1.6;padding:2rem}
.page{max-width:880px;margin:0 auto;display:grid;grid-template-columns:260px 1fr;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.15)}
.side{background:#1e293b;color:#e2e8f0;padding:2rem 1.5rem}
.side h2{font-size:.85rem;text-transform:uppercase;letter-spacing:.12em;color:#94a3b8;margin:1.5rem 0 .5rem;border:none}
.side p,.side li{font-size:.85rem;color:#cbd5e1}
.side ul{list-style:none;padding:0}
.side li{margin-bottom:.4rem}
.main{padding:2.5rem}
.main h1{font-size:2rem;color:#0f172a}
.main .title{color:#2563eb;font-weight:600}
.main h2{font-size:1.05rem;color:#2563eb;border-bottom:2px solid #e2e8f0;padding-bottom:.3rem;margin:1.4rem 0 .7rem}
.main p{font-size:.95rem;color:#475569}
.main ul{padding-left:1.2rem}.main li{margin-bottom:.35rem;font-size:.93rem;color:#475569}
.skill{margin-bottom:.35rem}
</style></head>
<body><div class="page">
  <aside class="side">
    <h2>Contact</h2>
    <p>{{email}}</p><p>{{phone}}</p><p>{{location}}</p>
    {{#if website}}<p>{{website}}</p>{{/if}}
    {{#if linkedin}}<p>{{linkedin}}</p>{{/if}}
    {{#if github}}<p>{{github}}</p>{{/if}}
    {{#if skills}}<h2>Skills</h2><div>{{#each skills}}<div class="skill">{{this}}</div>{{/each}}</div>{{/if}}
  </aside>
  <main class="main">
    <h1>{{name}}</h1>
    {{#if title}}<div class="title">{{title}}</div>{{/if}}
    {{#if summary}}<section><h2>Summary</h2><p>{{summary}}</p></section>{{/if}}
    {{#each sections}}
    <section><h2>{{item.title}}</h2><ul>{{#each item.items}}<li>{{this}}</li>{{/each}}</ul></section>
    {{/each}}
  </main>
</div></body></html>`

const SIDEBAR_TEX = `\\documentclass[10pt,a4paper]{article}
\\usepackage[margin=1.8cm]{geometry}
\\usepackage{enumitem}
\\usepackage{parskip}
\\usepackage{xcolor}
\\usepackage{tabularx}
\\definecolor{side}{HTML}{1e293b}
\\begin{document}
\\begin{minipage}[t]{0.3\\textwidth}\\color{side}
{\\Large\\bfseries {{name}}}\\\\[0.4em]
{\\small Contact: {{email}} \\cdot {{phone}} \\cdot {{location}}\\\\ {{website}}}
{{#if skills}}\\\\[0.6em]
\\section*{Skills}
\\begin{itemize}[leftmargin=1em]
{{#each skills}}\\item {{this}}
{{/each}}\\end{itemize}
{{/if}}
\\end{minipage}%
\\hfill\\vrule\\hspace{1em}%
\\begin{minipage}[t]{0.62\\textwidth}
{{#if title}}{\\large\\bfseries {{title}}}\\\\[0.4em]{{/if}}
{{#if summary}}\\section*{Summary}{{summary}}
{{/if}}
{{#each sections}}
\\section*{ {{item.title}} }
\\begin{itemize}[leftmargin=1.2em]
{{#each item.items}}\\item {{this}}
{{/each}}\\end{itemize}
{{/each}}
\\end{minipage}
\\end{document}`

export function seedBuiltinTemplates(): void {
  const existingModern = getTemplateBySlug('modern')
  if (existingModern?.is_builtin) return

  const defs = [
    { slug: 'modern', name: 'Modern', description: 'Two-tone modern layout with gradient header and pill skills.', html: MODERN_HTML, tex: MODERN_TEX },
    { slug: 'minimal', name: 'Minimal', description: 'Clean single-column layout focused on readability.', html: MINIMAL_HTML, tex: MINIMAL_TEX },
    { slug: 'sidebar', name: 'Sidebar', description: 'Contact and skills in a dark sidebar, content on the right.', html: SIDEBAR_HTML, tex: SIDEBAR_TEX },
  ]

  for (const def of defs) {
    const existing = getTemplateBySlug(def.slug)
    if (existing) {
      updateTemplate(existing.id, { content_html: def.html, content_tex: def.tex })
    } else {
      createTemplate({
        name: def.name,
        description: def.description,
        authorId: null,
        contentTex: def.tex,
        contentHtml: def.html,
        variables: [{ key: 'headline', label: 'Headline', type: 'string', default: '' }],
        language: 'en',
        tags: ['builtin', def.slug],
        isBuiltin: true,
      })
    }
  }

  log.info('builtin templates seeded')
}
