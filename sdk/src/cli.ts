#!/usr/bin/env node
import { ResumeSDK, SDKError, emptyData } from './index.js'

const BASE = process.env.RESUME_API_URL || 'http://localhost:3000'
const TOKEN_FILE = process.env.HOME ? `${process.env.HOME}/.resume-cli-token` : '/tmp/.resume-cli-token'

let savedToken: string | undefined
try {
  const { readFileSync } = await import('node:fs')
  savedToken = readFileSync(TOKEN_FILE, 'utf8').trim() || undefined
} catch { /* no saved token */ }

const sdk = new ResumeSDK({ baseUrl: BASE, token: savedToken })

const { writeFileSync } = await import('node:fs')

function usage(): void {
  console.log(`
resume <command> [args]

  login    --email E --password P        Save a session token
  register --email E --password P --username U

  docs list
  docs create --title T [--template modern] [--accent blue] [--font inter]
  docs export <id> [--format pdf|html|docx|txt] [--out file]
  docs validate <id>

  schedule list
  schedule create --cron "0 9 * * 1" [--doc id] [--email x@y.z] [--webhook URL]
  schedule run <id>
  schedule next --cron "0 9 * * 1"

  ab list
  ab create --name NAME --docs 1,2,3

  template list [--query q]
  template upload --name NAME --html file.html [--tex file.tex] [--tags a,b]

  import github --username USER
  import linkedin --text FILE
`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const cmd = args[0]
  const sub = args[1] && !args[1].startsWith('--') ? args[1] : undefined
  const rest = sub ? args.slice(2) : args.slice(1)
  const arg = (flag: string): string | undefined => {
    const i = rest.indexOf(flag)
    return i >= 0 && rest[i + 1] ? rest[i + 1] : undefined
  }
  const has = (flag: string): boolean => rest.includes(flag)

  if (!cmd) return usage()

  try {
    switch (cmd) {
      case 'login': {
        const email = arg('--email')
        const password = arg('--password')
        if (!email || !password) throw new Error('--email and --password required')
        const res = await sdk.auth.login(email, password)
        writeFileSync(TOKEN_FILE, res.token)
        console.log(`Logged in as ${email} (token saved)`)
        break
      }
      case 'register': {
        const email = arg('--email')
        const password = arg('--password')
        const username = arg('--username')
        if (!email || !password || !username) throw new Error('--email, --password and --username required')
        const res = await sdk.auth.register(email, password, username)
        writeFileSync(TOKEN_FILE, res.token)
        console.log(`Registered ${username} (token saved)`)
        break
      }
      case 'docs': {
        if (sub === 'list') {
          const { docs } = await sdk.docs.list()
          for (const d of docs) console.log(`#${d.id}\t${d.title}\tv${d.version}\t${d.visibility}\t${d.updated_at}`)
          if (!docs.length) console.log('No resumes')
        } else if (sub === 'create') {
          const title = arg('--title') || 'Untitled resume'
          const doc = await sdk.docs.create({
            title,
            data: emptyData(),
            template_key: arg('--template') || 'modern',
            accent: arg('--accent') || 'blue',
            font: arg('--font') || 'inter',
          })
          console.log(`Created #${doc.doc.id}: ${doc.doc.title}`)
        } else if (sub === 'export') {
          const id = Number(rest[0])
          const format = (arg('--format') || 'pdf') as 'pdf' | 'html' | 'docx' | 'txt'
          if (!id) throw new Error('docs export <id> required')
          const out = arg('--out') || `resume_${id}.${format === 'docx' ? 'docx' : format}`
          await sdk.export(id, format, out)
          console.log(`Exported ${format} -> ${out}`)
        } else if (sub === 'validate') {
          const id = Number(rest[0])
          if (!id) throw new Error('docs validate <id> required')
          const v = await sdk.docs.validate(id)
          console.log(`Score: ${v.score}/100 (${v.pass ? 'PASS' : 'FAIL'})`)
          for (const iss of v.issues) console.log(`  [${iss.severity}] ${iss.message}`)
        } else usage()
        break
      }
      case 'schedule': {
        if (sub === 'list') {
          const { schedules } = await sdk.automation.schedules()
          for (const s of schedules) console.log(`#${s.id}\t${s.cron}\tdoc=${s.doc_id ?? '-'}\tnext=${s.next_run_at || '-'}\tactive=${s.active}`)
        } else if (sub === 'create') {
          const cron = arg('--cron')
          if (!cron) throw new Error('--cron required')
          const s = await sdk.automation.createSchedule({
            cron,
            doc_id: arg('--doc') ? Number(arg('--doc')) : null,
            email_to: arg('--email') || null,
            webhook_url: arg('--webhook') || null,
          })
          console.log(`Schedule #${s.schedule.id} (${cron}) next run ${s.schedule.next_run_at}`)
        } else if (sub === 'run') {
          const id = Number(rest[0])
          if (!id) throw new Error('schedule run <id> required')
          await sdk.automation.runSchedule(id)
          console.log('Triggered')
        } else if (sub === 'next') {
          const cron = arg('--cron')
          if (!cron) throw new Error('--cron required')
          const { next } = await sdk.automation.nextRun(cron)
          console.log(next)
        } else usage()
        break
      }
      case 'ab': {
        if (sub === 'list') {
          const { tests } = await sdk.analytics.abTests()
          for (const t of tests) console.log(`#${t.id}\t${t.name}\t/share/ab/${t.share_id}`)
        } else if (sub === 'create') {
          const name = arg('--name')
          const docsArg = arg('--docs')
          if (!name || !docsArg) throw new Error('--name and --docs required')
          const { test, url } = await sdk.analytics.createABTest(name, docsArg.split(',').map(Number))
          console.log(`A/B test #${test.id}: ${BASE}/api/v1${url}`)
        } else usage()
        break
      }
      case 'template': {
        if (sub === 'list') {
          const { templates } = await sdk.marketplace.list(arg('--query'))
          for (const t of templates) console.log(`${t.slug}\t${t.name}\t${t.is_builtin ? 'builtin' : 'community'}\t${(t.downloads || 0)} dl\t${(t.rating || 0).toFixed(1)}★`)
        } else if (sub === 'upload') {
          const { readFileSync } = await import('node:fs')
          const name = arg('--name')
          const htmlPath = arg('--html')
          if (!name || !htmlPath) throw new Error('--name and --html required')
          const t = await sdk.marketplace.create({
            name,
            content_html: readFileSync(htmlPath, 'utf8'),
            content_tex: arg('--tex') ? readFileSync(arg('--tex')!, 'utf8') : undefined,
            tags: arg('--tags') ? arg('--tags')!.split(',').map(s => s.trim()) : [],
          })
          console.log(`Published ${t.template.slug}`)
        } else usage()
        break
      }
      case 'import': {
        if (sub === 'github') {
          const username = arg('--username')
          if (!username) throw new Error('--username required')
          const { source } = await sdk.import_.github(username)
          console.log(JSON.stringify(source, null, 2))
        } else if (sub === 'linkedin') {
          const textPath = arg('--text')
          if (!textPath) throw new Error('--text required')
          const { readFileSync } = await import('node:fs')
          const { source } = await sdk.import_.linkedin(readFileSync(textPath, 'utf8'))
          console.log(JSON.stringify(source, null, 2))
        } else usage()
        break
      }
      default:
        usage()
    }
  } catch (err) {
    if (err instanceof SDKError) {
      console.error(`Error ${err.status}: ${err.message}`)
    } else if (err instanceof Error) {
      console.error(`Error: ${err.message}`)
    } else {
      console.error(err)
    }
    process.exit(1)
  }
}

void main()
