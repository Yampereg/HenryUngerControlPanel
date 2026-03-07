'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, AlertTriangle, Database,
  GitBranch, Globe, HardDrive, Loader2, RefreshCw,
  Server, XCircle, Zap, X,
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

// ── Shared sub-components ─────────────────────────────────────────────────────

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

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('glass rounded-xl border border-white/[0.07] p-3', className)}>
      {children}
    </div>
  )
}

// ── Deploy helpers ────────────────────────────────────────────────────────────

type DeployState = 'ok' | 'error' | 'building' | 'unknown' | 'unconfigured'

function deployState(state?: string): DeployState {
  if (!state) return 'unknown'
  const s = state.toLowerCase()
  if (['ready', 'success', 'active', 'deployed'].some(k => s.includes(k)))              return 'ok'
  if (['error', 'fail', 'crash'].some(k => s.includes(k)))                              return 'error'
  if (['build', 'deploy', 'progress', 'queue', 'initializ'].some(k => s.includes(k)))  return 'building'
  return 'unknown'
}

function DeployBadge({ state }: { state: DeployState }) {
  return (
    <span className={clsx(
      'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
      state === 'ok'           && 'bg-aura-success/10 text-aura-success',
      state === 'error'        && 'bg-aura-error/10 text-aura-error',
      state === 'building'     && 'bg-aura-warning/10 text-aura-warning animate-pulse',
      (state === 'unknown' ||
       state === 'unconfigured') && 'bg-white/5 text-aura-muted',
    )}>
      {state === 'ok'       ? '✓ Live'     :
       state === 'error'    ? '✕ Error'    :
       state === 'building' ? '⏳ Building' : '— Unknown'}
    </span>
  )
}

// ── Traffic bar chart ─────────────────────────────────────────────────────────

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
  const totalReqs  = traffic.requests.reduce((a, b) => a + b, 0)
  const totalBw    = traffic.bandwidth.reduce((a, b) => a + b, 0)
  const totalUniqs = traffic.uniques.reduce((a, b) => a + b, 0)

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-aura-muted">
          <Activity size={13} />
          <span className="text-[11px] font-medium">Traffic · 7d</span>
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

// ── Architecture diagram data ─────────────────────────────────────────────────

type NodeId = 'vercel' | 'cloudflare' | 'railway' | 'supabase' | 'r2' | 'neo4j'

interface NodeMeta {
  label: string
  sub:   string
  icon:  React.ElementType
  cx:    number   // center-x in SVG viewBox 0–100
  cy:    number   // center-y in SVG viewBox 0–100
}

const NODE_META: Record<NodeId, NodeMeta> = {
  vercel:     { label: 'Vercel',     sub: 'Control Panel',  icon: Globe,      cx: 22, cy: 13 },
  cloudflare: { label: 'Cloudflare', sub: 'Website',        icon: Globe,      cx: 78, cy: 13 },
  railway:    { label: 'Railway',    sub: 'Backend API',    icon: Server,     cx: 50, cy: 48 },
  supabase:   { label: 'Supabase',  sub: 'PostgreSQL',      icon: Database,   cx: 16, cy: 83 },
  r2:         { label: 'R2',        sub: 'Object Storage',  icon: HardDrive,  cx: 50, cy: 83 },
  neo4j:      { label: 'Neo4j',     sub: 'Graph DB',        icon: GitBranch,  cx: 84, cy: 83 },
}

interface EdgeDef {
  a: NodeId; b: NodeId
  label: string
  stroke: string
  labelFill: string
}

const EDGES: EdgeDef[] = [
  { a: 'vercel',     b: 'supabase', label: 'SQL',  stroke: 'rgba(34,211,238,0.30)', labelFill: 'rgba(34,211,238,0.55)' },
  { a: 'vercel',     b: 'r2',       label: 'S3',   stroke: 'rgba(99,102,241,0.30)', labelFill: 'rgba(99,102,241,0.55)' },
  { a: 'cloudflare', b: 'railway',  label: 'HTTP', stroke: 'rgba(52,211,153,0.30)', labelFill: 'rgba(52,211,153,0.55)' },
  { a: 'railway',    b: 'supabase', label: 'JDBC', stroke: 'rgba(34,211,238,0.30)', labelFill: 'rgba(34,211,238,0.55)' },
  { a: 'railway',    b: 'r2',       label: 'S3',   stroke: 'rgba(99,102,241,0.30)', labelFill: 'rgba(99,102,241,0.55)' },
  { a: 'railway',    b: 'neo4j',    label: 'Bolt', stroke: 'rgba(251,191,36,0.30)', labelFill: 'rgba(251,191,36,0.55)' },
]

function getNodeStatus(id: NodeId, s: Stats): boolean | null {
  switch (id) {
    case 'vercel':
      return s.vercel.configured ? deployState(s.vercel.state) === 'ok' : null
    case 'cloudflare':
      return s.cloudflare.configured && s.cloudflare.pages
        ? deployState(s.cloudflare.pages.state) === 'ok' : null
    case 'railway': {
      if (!s.railway.configured) return null
      const states = s.railway.deployments?.map(d => deployState(d.status)) ?? []
      return states.length ? states.every(st => st === 'ok') : null
    }
    case 'supabase':   return s.supabase.ok
    case 'r2':         return s.r2.ok
    case 'neo4j':      return s.neo4j.configured ? (s.neo4j.ok ?? false) : null
  }
}

// ── Architecture diagram ──────────────────────────────────────────────────────

function ArchDiagram({ stats, onNodeClick }: { stats: Stats; onNodeClick: (id: NodeId) => void }) {
  return (
    <div className="relative w-full select-none" style={{ height: 310 }}>

      {/* SVG connection lines — uses same percentage coordinates as node divs */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Animated dash offset to make lines "flow" */}
          <style>{`
            .flow-dash {
              stroke-dasharray: 2.5 2;
              animation: flowDash 1.8s linear infinite;
            }
            @keyframes flowDash {
              to { stroke-dashoffset: -4.5; }
            }
          `}</style>
        </defs>

        {EDGES.map(edge => {
          const a  = NODE_META[edge.a]
          const b  = NODE_META[edge.b]
          const mx = (a.cx + b.cx) / 2
          const my = (a.cy + b.cy) / 2
          // Midpoint offset: push label slightly off-center to avoid overlaps
          const dx = b.cx - a.cx
          const dy = b.cy - a.cy
          const len = Math.sqrt(dx * dx + dy * dy)
          const nx = -dy / len   // perpendicular
          const ny =  dx / len
          const lx = mx + nx * 3.5
          const ly = my + ny * 3.5

          return (
            <g key={`${edge.a}-${edge.b}`}>
              {/* Glow shadow line */}
              <line
                x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}
                stroke={edge.stroke}
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.5"
                filter="blur(1px)"
              />
              {/* Animated dashed line */}
              <line
                x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}
                stroke={edge.stroke}
                strokeWidth="0.6"
                strokeLinecap="round"
                className="flow-dash"
              />
              {/* Edge label */}
              <text
                x={lx} y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="2.6"
                fontFamily="ui-monospace, monospace"
                fontWeight="600"
                fill={edge.labelFill}
              >
                {edge.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Node boxes — absolutely positioned, centered on (cx%, cy%) */}
      {(Object.entries(NODE_META) as [NodeId, NodeMeta][]).map(([id, meta]) => {
        const status = getNodeStatus(id, stats)
        const Icon   = meta.icon
        return (
          <button
            key={id}
            onClick={() => onNodeClick(id)}
            style={{ left: `${meta.cx}%`, top: `${meta.cy}%` }}
            className={clsx(
              'absolute -translate-x-1/2 -translate-y-1/2 z-10',
              'w-[70px] glass rounded-xl border p-2.5 flex flex-col items-center gap-1.5',
              'hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer',
              status === true  && 'border-aura-success/40 shadow-[0_0_12px_rgba(52,211,153,0.15)]',
              status === false && 'border-aura-error/40 shadow-[0_0_12px_rgba(239,68,68,0.15)]',
              status === null  && 'border-white/[0.10] hover:border-aura-accent/35',
            )}
          >
            <div className="relative">
              <Icon
                size={18}
                className={clsx(
                  status === true  ? 'text-aura-success' :
                  status === false ? 'text-aura-error'   : 'text-aura-muted',
                )}
              />
              {/* Status dot in corner */}
              <span className={clsx(
                'absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-black/30',
                status === true  ? 'bg-aura-success' :
                status === false ? 'bg-aura-error'   : 'bg-white/20',
              )} />
            </div>
            <p className="text-[9.5px] font-bold text-aura-text leading-none tracking-wide">
              {meta.label}
            </p>
            <p className="text-[8px] text-aura-muted leading-none text-center">
              {meta.sub}
            </p>
          </button>
        )
      })}
    </div>
  )
}

// ── Modal content per node ────────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
  courses: 'Courses', lectures: 'Lectures',
  directors: 'Directors', films: 'Films', writers: 'Writers',
  books: 'Books', painters: 'Painters', paintings: 'Paintings',
  philosophers: 'Philosophers', themes: 'Themes',
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-aura-muted">{label}</span>
      <span className="font-semibold text-aura-text">{value}</span>
    </div>
  )
}

function SupabaseModalContent({ stats }: { stats: SupabaseStats }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StatusDot ok={stats.ok} />
        <span className="text-xs font-medium text-aura-text">
          {stats.ok ? 'Connected' : 'Unreachable'}
        </span>
        {stats.error && <span className="text-[10px] text-aura-error truncate">{stats.error}</span>}
      </div>

      {stats.ok && stats.counts && (
        <>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
            {Object.entries(ENTITY_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between text-[11px]">
                <span className="text-aura-muted">{label}</span>
                <span className="font-semibold text-aura-text tabular-nums">
                  {fmtNum(stats.counts[key] ?? 0)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-white/[0.06] pt-2 space-y-1.5">
            <Row label="Pending jobs"  value={stats.pendingJobs ?? 0} />
            <Row label="Jobs (24h)"    value={stats.recentJobs ?? 0} />
          </div>
        </>
      )}
    </div>
  )
}

function R2ModalContent({ stats }: { stats: R2Stats }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <StatusDot ok={stats.ok} />
        <span className="text-xs font-medium text-aura-text">
          {stats.ok ? 'Connected' : 'Unreachable'}
        </span>
      </div>
      {stats.ok && (
        <div className="space-y-1.5">
          <Row label="Image objects" value={`${fmtNum(stats.imageObjects)}${stats.imagesTruncated ? '+' : ''}`} />
          <Row label="Prefix"        value={<span className="font-mono text-[10px] text-aura-muted">images/</span>} />
        </div>
      )}
      {stats.error && <p className="text-[10px] text-aura-error">{stats.error}</p>}
    </div>
  )
}

function Neo4jModalContent({ stats }: { stats: Neo4jStats }) {
  if (!stats.configured) {
    return (
      <div className="flex items-center gap-2 text-aura-muted">
        <AlertTriangle size={13} />
        <p className="text-[11px]">Not configured — add NEO4J_URI env var</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <StatusDot ok={stats.ok ?? false} />
        <span className="text-xs font-medium text-aura-text">
          {stats.ok ? 'Connected' : 'Unreachable'}
        </span>
      </div>
      {stats.ok && <Row label="Total nodes" value={fmtNum(stats.nodeCount ?? 0)} />}
      {stats.error && <p className="text-[10px] text-aura-error">{stats.error}</p>}
    </div>
  )
}

function VercelModalContent({ stats }: { stats: VercelStats }) {
  if (!stats.configured) {
    return (
      <div className="flex items-center gap-2 text-aura-muted">
        <AlertTriangle size={13} />
        <p className="text-[11px]">Add VERCEL_TOKEN + VERCEL_PROJECT_ID env vars</p>
      </div>
    )
  }
  const state = deployState(stats.state)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-aura-muted">Status</span>
        <DeployBadge state={state} />
      </div>
      {stats.name     && <Row label="Project"     value={stats.name} />}
      {stats.createdAt && <Row label="Last deploy" value={fmtAgo(stats.createdAt)} />}
      {stats.url && (
        <a
          href={stats.url.startsWith('http') ? stats.url : `https://${stats.url}`}
          target="_blank" rel="noreferrer"
          className="block text-[10px] text-aura-accent/70 hover:text-aura-accent truncate transition-colors"
        >
          {stats.url.replace(/^https?:\/\//, '')}
        </a>
      )}
      {(stats.error ?? stats.errorMessage) && (
        <p className="text-[10px] text-aura-error">{stats.error ?? stats.errorMessage}</p>
      )}
    </div>
  )
}

function RailwayModalContent({ stats }: { stats: RailwayStats }) {
  if (!stats.configured) {
    return (
      <div className="flex items-center gap-2 text-aura-muted">
        <AlertTriangle size={13} />
        <p className="text-[11px]">Add RAILWAY_TOKEN + RAILWAY_PROJECT_ID env vars</p>
      </div>
    )
  }
  if (stats.error) return <p className="text-[10px] text-aura-error">{stats.error}</p>
  return (
    <div className="space-y-3">
      {stats.deployments?.map((d, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-aura-text">{d.serviceName}</span>
            <DeployBadge state={deployState(d.status)} />
          </div>
          {d.createdAt && <Row label="Deployed" value={fmtAgo(d.createdAt)} />}
          {d.url && (
            <a
              href={d.url.startsWith('http') ? d.url : `https://${d.url}`}
              target="_blank" rel="noreferrer"
              className="block text-[10px] text-aura-accent/70 hover:text-aura-accent truncate transition-colors"
            >
              {d.url.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

function CloudflareModalContent({ stats }: { stats: CloudflareStats }) {
  if (!stats.configured) {
    return (
      <div className="flex items-center gap-2 text-aura-muted">
        <AlertTriangle size={13} />
        <p className="text-[11px]">Add CF_API_TOKEN + CF_PAGES_PROJECT env vars</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {stats.pages && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-aura-muted">{stats.pages.environment}</span>
            <DeployBadge state={deployState(stats.pages.state)} />
          </div>
          <Row label="Stage"       value={stats.pages.stageName} />
          {stats.pages.createdAt && <Row label="Last deploy" value={fmtAgo(stats.pages.createdAt)} />}
          {stats.pages.url && (
            <a
              href={stats.pages.url.startsWith('http') ? stats.pages.url : `https://${stats.pages.url}`}
              target="_blank" rel="noreferrer"
              className="block text-[10px] text-aura-accent/70 hover:text-aura-accent truncate transition-colors"
            >
              {stats.pages.url.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      )}
      {stats.error && <p className="text-[10px] text-aura-error">{stats.error}</p>}
      {stats.traffic && stats.traffic.dates.length > 0 && (
        <div className="border-t border-white/[0.06] pt-2">
          <TrafficChart traffic={stats.traffic} />
        </div>
      )}
      {!stats.traffic && (
        <div className="flex items-center gap-2 text-aura-muted">
          <AlertTriangle size={11} />
          <span className="text-[10px]">Add CF_ZONE_ID for traffic analytics</span>
        </div>
      )}
    </div>
  )
}

// ── Node modal ────────────────────────────────────────────────────────────────

function NodeModal({ id, stats, onClose }: { id: NodeId; stats: Stats; onClose: () => void }) {
  const meta   = NODE_META[id]
  const Icon   = meta.icon
  const status = getNodeStatus(id, stats)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-4 pb-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{    y: 48, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="w-full max-w-sm glass rounded-2xl border border-white/[0.12] p-4 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={clsx(
              'w-8 h-8 rounded-xl flex items-center justify-center',
              status === true  ? 'bg-aura-success/10 border border-aura-success/30' :
              status === false ? 'bg-aura-error/10 border border-aura-error/30'     :
                                 'bg-white/[0.05] border border-white/[0.1]',
            )}>
              <Icon size={15} className={clsx(
                status === true  ? 'text-aura-success' :
                status === false ? 'text-aura-error'   : 'text-aura-muted',
              )} />
            </div>
            <div>
              <p className="text-sm font-bold text-aura-text leading-none">{meta.label}</p>
              <p className="text-[10px] text-aura-muted mt-0.5">{meta.sub}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-aura-muted hover:text-aura-text hover:bg-white/[0.06] transition-all"
          >
            <X size={14} />
          </button>
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Per-node content */}
        {id === 'supabase'   && <SupabaseModalContent   stats={stats.supabase}   />}
        {id === 'r2'         && <R2ModalContent         stats={stats.r2}         />}
        {id === 'neo4j'      && <Neo4jModalContent      stats={stats.neo4j}      />}
        {id === 'vercel'     && <VercelModalContent     stats={stats.vercel}     />}
        {id === 'railway'    && <RailwayModalContent    stats={stats.railway}    />}
        {id === 'cloudflare' && <CloudflareModalContent stats={stats.cloudflare} />}
      </motion.div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function SystemDashboard() {
  const [stats,       setStats]       = useState<Stats | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [activeNode,  setActiveNode]  = useState<NodeId | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stats')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStats(await res.json())
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
      <div className="glass rounded-xl border border-white/[0.07] p-3 flex items-start gap-3 text-aura-error">
        <XCircle size={16} className="shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">Failed to load stats</p>
          <p className="text-xs text-aura-muted mt-1">{error}</p>
          <button onClick={() => load()} className="mt-2 text-xs text-aura-accent underline">
            Retry
          </button>
        </div>
      </div>
    )
  }

  const s = stats!

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-3"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-aura-accent" />
            <span className="text-xs font-semibold text-aura-text">Architecture</span>
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

        {/* Legend + hint */}
        <div className="flex flex-wrap items-center gap-3 px-0.5">
          {[
            { bg: 'bg-aura-success', label: 'Healthy' },
            { bg: 'bg-aura-error',   label: 'Error'   },
            { bg: 'bg-white/20',     label: 'Not configured' },
          ].map(({ bg, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={clsx('w-1.5 h-1.5 rounded-full', bg)} />
              <span className="text-[9px] text-aura-muted">{label}</span>
            </div>
          ))}
          <p className="text-[9px] text-aura-muted/40 ml-auto">tap to inspect</p>
        </div>

        {/* Architecture diagram */}
        <ArchDiagram stats={s} onNodeClick={setActiveNode} />

        {/* Edge legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-0.5 pt-1">
          {[
            { color: 'bg-[rgba(34,211,238,0.5)]',  label: 'SQL / Supabase' },
            { color: 'bg-[rgba(99,102,241,0.5)]',  label: 'S3 / R2'        },
            { color: 'bg-[rgba(52,211,153,0.5)]',  label: 'HTTP REST'       },
            { color: 'bg-[rgba(251,191,36,0.5)]',  label: 'Bolt / Neo4j'   },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={clsx('inline-block h-[2px] w-5 rounded', color)} />
              <span className="text-[9px] text-aura-muted">{label}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center pt-1">
          <p className="text-[10px] text-aura-muted/40">Auto-refreshes every 60s</p>
        </div>
      </motion.div>

      {/* Node detail modal */}
      <AnimatePresence>
        {activeNode && (
          <NodeModal id={activeNode} stats={s} onClose={() => setActiveNode(null)} />
        )}
      </AnimatePresence>
    </>
  )
}
