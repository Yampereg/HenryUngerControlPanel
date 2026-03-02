import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { r2, bucketName } from '@/lib/r2'
import { ListObjectsV2Command } from '@aws-sdk/client-s3'

const ENTITY_TABLES = [
  'courses', 'lectures', 'directors', 'films', 'writers',
  'books', 'painters', 'paintings', 'philosophers', 'themes',
] as const

function withTimeout<T>(promise: Promise<T>, ms = 9000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ])
}

// ── Supabase ──────────────────────────────────────────────────────────────────

async function getSupabaseStats() {
  const countRows = await Promise.all(
    ENTITY_TABLES.map(async (table) => {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      if (error) throw new Error(`${table}: ${error.message}`)
      return [table, count ?? 0] as const
    }),
  )

  const [pendingRes, recentRes] = await Promise.all([
    supabase.from('regen_jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('regen_jobs').select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 86_400_000).toISOString()),
  ])

  return {
    ok: true,
    counts: Object.fromEntries(countRows) as Record<string, number>,
    pendingJobs: pendingRes.count ?? 0,
    recentJobs: recentRes.count ?? 0,
  }
}

// ── R2 ────────────────────────────────────────────────────────────────────────

async function getR2Stats() {
  const [, imagesRes] = await Promise.all([
    r2.send(new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1 })),
    r2.send(new ListObjectsV2Command({ Bucket: bucketName, Prefix: 'images/', MaxKeys: 1000 })),
  ])
  return {
    ok: true,
    imageObjects: imagesRes.KeyCount ?? 0,
    imagesTruncated: imagesRes.IsTruncated ?? false,
  }
}

// ── Neo4j ─────────────────────────────────────────────────────────────────────

async function getNeo4jStatus() {
  const boltUri  = process.env.NEO4J_URI
  const httpUri  = process.env.NEO4J_HTTP_URI
  const user     = process.env.NEO4J_USER ?? 'neo4j'
  const password = process.env.NEO4J_PASSWORD
  if (!boltUri && !httpUri) return { configured: false }

  const base = (httpUri ?? boltUri!)
    .replace(/^neo4j(\+s)?:\/\//, 'http$1://')
    .replace(/^bolt(\+s)?:\/\//, 'http$1://')
    .replace(/:7687$/, ':7474')

  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(`${base}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
      },
      body: JSON.stringify({ statements: [{ statement: 'MATCH (n) RETURN count(n) AS count' }] }),
      signal: ctrl.signal,
    })
    clearTimeout(id)
    if (!res.ok) return { configured: true, ok: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    const nodeCount: number = data.results?.[0]?.data?.[0]?.row?.[0] ?? 0
    return { configured: true, ok: true, nodeCount }
  } catch (e) {
    clearTimeout(id)
    return { configured: true, ok: false, error: String(e) }
  }
}

// ── Vercel ────────────────────────────────────────────────────────────────────

async function getVercelDeployment() {
  const token = process.env.VERCEL_TOKEN
  if (!token) return { configured: false }

  const params = new URLSearchParams({ limit: '1' })
  if (process.env.VERCEL_PROJECT_ID) params.set('projectId', process.env.VERCEL_PROJECT_ID)
  if (process.env.VERCEL_TEAM_ID)    params.set('teamId',    process.env.VERCEL_TEAM_ID)

  const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return { configured: true, error: `HTTP ${res.status}` }

  const data = await res.json()
  const d = data.deployments?.[0]
  if (!d) return { configured: true, error: 'No deployments found' }

  return {
    configured: true,
    state:        d.state        as string,
    createdAt:    d.created      as number,
    url:          d.url          as string,
    name:         d.name         as string,
    errorMessage: d.errorMessage as string | undefined,
  }
}

// ── Railway ───────────────────────────────────────────────────────────────────

async function getRailwayDeployment() {
  const token     = process.env.RAILWAY_TOKEN
  const projectId = process.env.RAILWAY_PROJECT_ID
  if (!token || !projectId) return { configured: false }

  const query = `{
    project(id: "${projectId}") {
      services { edges { node {
        name
        deployments(first: 1) { edges { node { status createdAt staticUrl }}}
      }}}
    }
  }`

  const res = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return { configured: true, error: `HTTP ${res.status}` }

  const data = await res.json()
  const edges: any[] = data.data?.project?.services?.edges ?? []

  return {
    configured: true,
    deployments: edges.map(e => ({
      serviceName: e.node.name                                       as string,
      status:      e.node.deployments?.edges?.[0]?.node?.status     as string | undefined,
      createdAt:   e.node.deployments?.edges?.[0]?.node?.createdAt  as string | undefined,
      url:         e.node.deployments?.edges?.[0]?.node?.staticUrl  as string | undefined,
    })),
  }
}

// ── Cloudflare ────────────────────────────────────────────────────────────────

async function getCloudflareStats() {
  const token        = process.env.CF_API_TOKEN
  const zoneId       = process.env.CF_ZONE_ID
  const accountId    = process.env.R2_ACCOUNT_ID
  const pagesProject = process.env.CF_PAGES_PROJECT
  if (!token) return { configured: false }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const result: Record<string, unknown> = { configured: true }

  // Pages — latest deployment
  if (accountId && pagesProject) {
    try {
      const r = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${pagesProject}/deployments?per_page=1`,
        { headers, signal: AbortSignal.timeout(8000) },
      )
      if (r.ok) {
        const json = await r.json()
        const d = json.result?.[0]
        if (d) {
          result.pages = {
            state:       d.latest_stage?.status as string,
            stageName:   d.latest_stage?.name   as string,
            createdAt:   d.created_on           as string,
            url:        `https://${d.url}`       as string,
            environment: d.environment           as string,
          }
        }
      }
    } catch { /* partial failure ok */ }
  }

  // Zone analytics — 7-day traffic
  if (zoneId) {
    try {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0]
      const gql = `{
        viewer { zones(filter:{ zoneTag:"${zoneId}" }) {
          httpRequests1dGroups(limit:7, filter:{date_geq:"${since}"}, orderBy:[date_ASC]) {
            dimensions { date }
            sum { requests pageViews bytes }
            uniq { uniques }
          }
        }}
      }`
      const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST', headers,
        body: JSON.stringify({ query: gql }),
        signal: AbortSignal.timeout(8000),
      })
      if (r.ok) {
        const json = await r.json()
        const groups: any[] = json.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? []
        result.traffic = {
          dates:     groups.map(g => g.dimensions.date as string),
          requests:  groups.map(g => g.sum.requests    as number),
          pageViews: groups.map(g => g.sum.pageViews   as number),
          bandwidth: groups.map(g => g.sum.bytes       as number),
          uniques:   groups.map(g => g.uniq.uniques    as number),
        }
      }
    } catch { /* partial failure ok */ }
  }

  return result
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const [sbR, r2R, neo4jR, vercelR, railwayR, cfR] = await Promise.allSettled([
    withTimeout(getSupabaseStats()),
    withTimeout(getR2Stats()),
    withTimeout(getNeo4jStatus()),
    withTimeout(getVercelDeployment()),
    withTimeout(getRailwayDeployment()),
    withTimeout(getCloudflareStats()),
  ])

  const unwrap = (r: PromiseSettledResult<unknown>) =>
    r.status === 'fulfilled' ? r.value : { ok: false, error: String(r.reason) }

  return NextResponse.json({
    timestamp:  Date.now(),
    supabase:   unwrap(sbR),
    r2:         unwrap(r2R),
    neo4j:      unwrap(neo4jR),
    vercel:     unwrap(vercelR),
    railway:    unwrap(railwayR),
    cloudflare: unwrap(cfR),
  })
}
