import { Hono } from 'hono'
import { z } from 'zod'
import { createABTest, getABTestByShareId, listABTests, abTestStats, docStats } from '../../db/analytics.js'
import { getDoc } from '../../db/docs.js'
import { requireAuth } from '../../auth/middleware.js'

const analytics = new Hono()

analytics.get('/ab-tests', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  return c.json({ tests: listABTests(user.id) })
})

analytics.post('/ab-tests', requireAuth, async (c) => {
  const user = (c as any).get('user') as { id: number }
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ name: z.string().min(1).max(120), doc_ids: z.array(z.number().int()).min(2).max(10) }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'name and at least 2 doc_ids required' }, 400)
  for (const docId of parsed.data.doc_ids) {
    const doc = getDoc(docId)
    if (!doc || doc.user_id !== user.id) return c.json({ error: `Doc ${docId} not found or not yours` }, 404)
  }
  const test = createABTest(user.id, parsed.data.name, parsed.data.doc_ids)
  return c.json({ test, url: `/share/ab/${test.share_id}` }, 201)
})

analytics.get('/ab-tests/:id', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  const tests = listABTests(user.id)
  const test = tests.find(t => t.id === Number(c.req.param('id')))
  if (!test) return c.json({ error: 'A/B test not found' }, 404)
  const variants = JSON.parse(test.doc_ids).map((docId: number) => {
    const doc = getDoc(docId)
    return { docId, title: doc?.title || '', ...docStats(docId) }
  })
  return c.json({ test: { ...test, variants, url: `/share/ab/${test.share_id}` } })
})

analytics.get('/doc/:id', requireAuth, (c) => {
  const user = (c as any).get('user') as { id: number }
  const doc = getDoc(Number(c.req.param('id')))
  if (!doc || doc.user_id !== user.id) return c.json({ error: 'Resume not found' }, 404)
  return c.json({ stats: docStats(doc.id) })
})

export default analytics
