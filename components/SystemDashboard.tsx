'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Database,
  GitBranch, Globe, HardDrive, Loader2, RefreshCw,
  Server, XCircle, Zap, Boxes,
} from 'lucide-react'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SupabaseStats {
  ok: boolean
  counts: Record<string, number>
  pendingJobs: number
  recentJobs: number
  error?: string
}
interface R2Stats {
  ok: boolean
  imageObjects: number
  imagesTruncated: boolean
  error?: string
}
interface Neo4jStats {
  configured: boolean
  ok?: boolean
  nodeCount?: number
  error?: string
}
interface VercelStats {
  configured: boolean
  state?: string
  createdAt?: number
  url?: string
  name?: string
  errorMessage?: string
  error?: string
}
interface RailwayStats {
  configured: boolean
  deployments?: { serviceName: string; status?: string; createdAt?: string; url?: string }[]
  error?: string
}
interface CloudflareStats {
  configured: boolean
  pages?: { state: string; stageName: string; createdAt: string; url: string; environment: string }
  traffic?: { dates: string[]; requests: number[]; pageViews: number[]; bandwidth: number[]; uniques: number[] }
  error?: string
}
interface Stats {
  timestamp: number
  supabase:   SupabaseStats
  r2:         R2Stats
  neo4j:      Neo4jStats
  vercel:     VercelStats
  railway:    RailwayStats
  cloudflare: CloudflareStats
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtBytes(b: number): string {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`
  if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB`
  if (b >= 1_024)         return `${(b / 1_024).toFixed(1)} KB`
  return `${b} B`
}

function fmtAgo(ts: number | string): string {
  const ms = typeof ts === 'string' ? Date.now() - new Date(ts).getTime() : Date.now() - ts
  const m = Math.floor(ms / 60_000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ ok, loading }: { ok: boolean | null; loading?: boolean }) {
  if (loading) return <Loader2 size={12} className="text-aura-muted animate-spin" />
  if (ok === null) return <span className="w-2 h-2 rounded-full bg-aura-muted block" />
  return ok ? (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-aura-success opacity-60" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-aura-success" />
    </span>
  ) : (
    <span className="w-2 h-2 rounded-full bg-aura-error block" />
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-aura-muted mb-2 px-0.5">
      {children}
    </p>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx(
      'glass rounded-xl border border-white/[0.07] p-3',
      className,
    )}>
      {children}
    </div>
  )
}

// ── Service Health Card ───────────────────────────────────────────────────────

interface HealthCardProps {
  icon: React.ReactNode
  label: string
  ok: boolean | null
  detail: string
  sub?: string
  loading?: boolean
}
function HealthCard({ icon, label, ok, detail, sub, loading }: HealthCardProps) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-aura-muted">
          {icon}
          <span className="text-[11px] font-medium">{label}</span>
        </div>
        <StatusDot ok={ok} loading={loading} />
      </div>
      <div>
        <p className={clsx(
          'text-sm font-semibold leading-tight',
          ok === true  ? 'text-aura-text'  :
          ok === false ? 'text-aura-error'  : 'text-aura-muted',
        )}>
          {detail}
        </p>
        {sub && <p className="text-[10px] text-aura-muted mt-0.5">{sub}</p>}
      </div>
    </Card>
  )
}

// ── Deployment Card ───────────────────────────────────────────────────────────

type DeployState = 'ok' | 'error' | 'building' | 'unknown' | 'unconfigured'

function deployState(state?: string): DeployState {
  if (!state) return 'unknown'
  const s = state.toLowerCase()
  if (['ready', 'success', 'active', 'deployed'].some(k => s.includes(k)))   return 'ok'
  if (['error', 'fail', 'crash'].some(k => s.includes(k)))                    return 'error'
  if (['build', 'deploy', 'progress', 'queue', 'initializ'].some(k => s.includes(k))) return 'building'
  return 'unknown'
}

function DeployBadge({ state }: { state: DeployState }) {
  return (
    <span className={clsx(
      'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
      state === 'ok'       && 'bg-aura-success/10 text-aura-success',
      state === 'error'    && 'bg-aura-error/10 text-aura-error',
      state === 'building' && 'bg-aura-warning/10 text-aura-warning animate-pulse',
      state === 'unknown'  && 'bg-white/5 text-aura-muted',
    )}>
      {state === 'ok' ? '✓ Live' : state === 'error' ? '✕ Error' : state === 'building' ? '⏳ Building' : '— Unknown'}
    </span>
  )
}

function DeployCard({
  icon, platform, state, label, ago, url, error,
}: {
  icon: React.ReactNode
  platform: string
  state: DeployState
  label?: string
  ago?: string
  url?: string
  error?: string
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-aura-muted">
          {icon}
          <span className="text-[11px] font-medium">{platform}</span>
        </div>
        <DeployBadge state={state} />
      </div>
      {label && <p className="text-xs text-aura-text font-medium truncate mb-0.5">{label}</p>}
      {ago   && <p className="text-[10px] text-aura-muted">{ago}</p>}
      {error && <p className="text-[10px] text-aura-error mt-1 truncate">{error}</p>}
      {url && state === 'ok' && (
        <a
          href={url.startsWith('http') ? url : `https://${url}`}
          target="_blank" rel="noreferrer"
          className="text-[10px] text-aura-accent/70 hover:text-aura-accent truncate block mt-1 transition-colors"
        >
          {url.replace(/^https?:\/\//, '')}
        </a>
      )}
    </Card>
  )
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function BarChart({ values, color = 'aura-accent' }: { values: number[]; color?: string }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-0.5 h-10">
      {values.map((v, i) => (
        <div
          key={i}
          className={clsx(
            'flex-1 rounded-t-sm min-h-[2px] transition-all',
            color === 'aura-accent'  && 'bg-aura-accent/50',
            color === 'aura-indigo'  && 'bg-aura-indigo/50',
            color === 'aura-success' && 'bg-aura-success/50',
          )}
          style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

function TrafficChart({ traffic }: {
  traffic: { dates: string[]; requests: number[]; pageViews: number[]; bandwidth: number[]; uniques: number[] }
}) {
  const totalReqs = traffic.requests.reduce((a, b) => a + b, 0)
  const totalBw   = traffic.bandwidth.reduce((a, b) => a + b, 0)
  const totalUniqs = traffic.uniques.reduce((a, b) => a + b, 0)

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-aura-muted">
          <Activity size={13} />
          <span className="text-[11px] font-medium">Cloudflare Traffic · 7d</span>
        </div>
        <div className="flex gap-3">
          <div className="text-right">
            <p className="text-xs font-bold text-aura-accent">{fmtNum(totalReqs)}</p>
            <p className="text-[9px] text-aura-muted">requests</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-aura-indigo">{fmtNum(totalUniqs)}</p>
            <p className="text-[9px] text-aura-muted">visitors</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-aura-success">{fmtBytes(totalBw)}</p>
            <p className="text-[9px] text-aura-muted">bandwidth</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[9px] text-aura-muted mb-1">Requests</p>
          <BarChart values={traffic.requests} color="aura-accent" />
        </div>
        <div>
          <p className="text-[9px] text-aura-muted mb-1">Unique Visitors</p>
          <BarChart values={traffic.uniques} color="aura-indigo" />
        </div>
        <div>
          <p className="text-[9px] text-aura-muted mb-1">Bandwidth</p>
          <BarChart values={traffic.bandwidth} color="aura-success" />
        </div>
      </div>

      {/* Date labels */}
      <div className="flex mt-1.5">
        {traffic.dates.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[9px] text-aura-muted/60">
            {new Date(d).toLocaleDateString('en-US', { weekday: 'narrow' })}
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Entity Counts ─────────────────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
  courses: 'Courses', lectures: 'Lectures',
  directors: 'Directors', films: 'Films', writers: 'Writers',
  books: 'Books', painters: 'Painters', paintings: 'Paintings',
  philosophers: 'Philosophers', themes: 'Themes',
}

function EntityCounts({ counts }: { counts: Record<string, number> }) {
  return (
    <Card>
      <div className="flex items-center gap-1.5 text-aura-muted mb-3">
        <Database size={13} />
        <span className="text-[11px] font-medium">Supabase · Entity Counts</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {Object.entries(ENTITY_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-[11px] text-aura-muted">{label}</span>
            <span className="text-[11px] font-semibold text-aura-text tabular-nums">
              {fmtNum(counts[key] ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SystemDashboard() {
  const [stats, setStats]       = useState<Stats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stats')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStats(data)
      setLastUpdated(new Date())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 60_000)
    return () => clearInterval(interval)
  }, [load])

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-aura-muted">
        <Loader2 size={24} className="animate-spin" />
        <p className="text-xs">Loading system stats…</p>
      </div>
    )
  }

  if (error && !stats) {
    return (
      <Card className="flex items-start gap-3 text-aura-error">
        <XCircle size={16} className="shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">Failed to load stats</p>
          <p className="text-xs text-aura-muted mt-1">{error}</p>
          <button onClick={() => load()} className="mt-2 text-xs text-aura-accent underline">
            Retry
          </button>
        </div>
      </Card>
    )
  }

  const s = stats!

  // ── Derived state ──────────────────────────────────────────────────────────
  const vercelState   = s.vercel.configured   ? deployState(s.vercel.state)      : 'unconfigured'
  const cfPagesState  = s.cloudflare.configured && s.cloudflare.pages
    ? deployState(s.cloudflare.pages.state) : 'unconfigured'
  const railwayStates = s.railway.configured && s.railway.deployments
    ? s.railway.deployments.map(d => deployState(d.status))
    : []

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-4"
      >

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-aura-accent" />
            <span className="text-xs font-semibold text-aura-text">System Dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-[10px] text-aura-muted">{fmtAgo(lastUpdated.getTime())}</span>
            )}
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="flex items-center gap-1 text-[10px] text-aura-muted hover:text-aura-accent
                         transition-colors px-1.5 py-1 rounded border border-white/[0.06] hover:border-aura-accent/30"
            >
              <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Service Health ─────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Service Health</SectionLabel>
          <div className="grid grid-cols-2 gap-2">

            <HealthCard
              icon={<Database size={13} />}
              label="Supabase DB"
              ok={s.supabase.ok ?? false}
              detail={s.supabase.ok ? `${fmtNum((s.supabase.counts?.lectures ?? 0))} lectures` : 'Unreachable'}
              sub={s.supabase.ok ? `${fmtNum(s.supabase.counts?.courses ?? 0)} courses` : s.supabase.error}
            />

            <HealthCard
              icon={<HardDrive size={13} />}
              label="R2 Storage"
              ok={s.r2.ok ?? false}
              detail={s.r2.ok
                ? `${fmtNum(s.r2.imageObjects)}${s.r2.imagesTruncated ? '+' : ''} images`
                : 'Unreachable'}
              sub={s.r2.ok ? 'images/ prefix' : s.r2.error}
            />

            <HealthCard
              icon={<Server size={13} />}
              label="Neo4j Graph"
              ok={!s.neo4j.configured ? null : (s.neo4j.ok ?? false)}
              detail={
                !s.neo4j.configured ? 'Not configured' :
                s.neo4j.ok ? `${fmtNum(s.neo4j.nodeCount ?? 0)} nodes` : 'Unreachable'
              }
              sub={!s.neo4j.configured ? 'Add NEO4J_URI env var' : s.neo4j.error}
            />

            <HealthCard
              icon={<Boxes size={13} />}
              label="Job Queue"
              ok={s.supabase.ok ?? false}
              detail={`${s.supabase.pendingJobs ?? 0} pending`}
              sub={`${s.supabase.recentJobs ?? 0} jobs in last 24h`}
            />

          </div>
        </div>

        {/* ── Deployments ────────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Deployments</SectionLabel>
          <div className="space-y-2">

            <DeployCard
              icon={<Globe size={13} />}
              platform="Vercel · Control Panel"
              state={s.vercel.configured ? vercelState : 'unconfigured'}
              label={s.vercel.name}
              ago={s.vercel.createdAt ? fmtAgo(s.vercel.createdAt) : undefined}
              url={s.vercel.url}
              error={s.vercel.error ?? s.vercel.errorMessage
                ?? (!s.vercel.configured ? 'Add VERCEL_TOKEN + VERCEL_PROJECT_ID env vars' : undefined)}
            />

            {s.railway.configured && s.railway.deployments?.map((d, i) => (
              <DeployCard
                key={i}
                icon={<GitBranch size={13} />}
                platform={`Railway · ${d.serviceName}`}
                state={deployState(d.status)}
                label={d.status}
                ago={d.createdAt ? fmtAgo(d.createdAt) : undefined}
                url={d.url}
              />
            ))}
            {!s.railway.configured && (
              <DeployCard
                icon={<GitBranch size={13} />}
                platform="Railway · Backend"
                state="unconfigured"
                error="Add RAILWAY_TOKEN + RAILWAY_PROJECT_ID env vars"
              />
            )}
            {s.railway.error && (
              <DeployCard
                icon={<GitBranch size={13} />}
                platform="Railway · Backend"
                state="error"
                error={s.railway.error}
              />
            )}

            <DeployCard
              icon={<Globe size={13} />}
              platform={`Cloudflare Pages · ${s.cloudflare.pages?.environment ?? 'Frontend'}`}
              state={s.cloudflare.configured ? cfPagesState : 'unconfigured'}
              label={s.cloudflare.pages ? `${s.cloudflare.pages.stageName} (${s.cloudflare.pages.state})` : undefined}
              ago={s.cloudflare.pages?.createdAt ? fmtAgo(s.cloudflare.pages.createdAt) : undefined}
              url={s.cloudflare.pages?.url}
              error={s.cloudflare.error
                ?? (!s.cloudflare.configured ? 'Add CF_API_TOKEN + CF_PAGES_PROJECT env vars' : undefined)}
            />

          </div>
        </div>

        {/* ── Traffic ────────────────────────────────────────────────────── */}
        {s.cloudflare.traffic && s.cloudflare.traffic.dates.length > 0 && (
          <div>
            <SectionLabel>Traffic</SectionLabel>
            <TrafficChart traffic={s.cloudflare.traffic} />
          </div>
        )}

        {/* Traffic not configured notice */}
        {s.cloudflare.configured && !s.cloudflare.traffic && (
          <div>
            <SectionLabel>Traffic</SectionLabel>
            <Card className="flex items-center gap-2 text-aura-muted">
              <AlertTriangle size={13} />
              <span className="text-xs">Add CF_ZONE_ID env var to enable traffic analytics</span>
            </Card>
          </div>
        )}

        {/* ── Database Stats ─────────────────────────────────────────────── */}
        {s.supabase.ok && s.supabase.counts && (
          <div>
            <SectionLabel>Database</SectionLabel>
            <EntityCounts counts={s.supabase.counts} />
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="text-center pt-1">
          <p className="text-[10px] text-aura-muted/50">Auto-refreshes every 60s</p>
        </div>

      </motion.div>
    </AnimatePresence>
  )
}
