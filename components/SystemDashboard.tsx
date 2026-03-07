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

// ── Deploy helpers ────────────────────────────────────────────────────────────

type DeployState = 'ok' | 'error' | 'building' | 'unknown' | 'unconfigured'

function deployState(state?: string): DeployState {
  if (!state) return 'unknown'
  const s = state.toLowerCase()
  if (['ready', 'success', 'active', 'deployed'].some(k => s.includes(k)))             return 'ok'
  if (['error', 'fail', 'crash'].some(k => s.includes(k)))                             return 'error'
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
      (state === 'unknown' || state === 'unconfigured') && 'bg-white/5 text-aura-muted',
    )}>
      {state === 'ok' ? '✓ Live' : state === 'error' ? '✕ Error' : state === 'building' ? '⏳ Building' : '— Unknown'}
    </span>
  )
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('glass rounded-xl border border-white/[0.07] p-3', className)}>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-aura-muted">{label}</span>
      <span className="font-semibold text-aura-text">{value}</span>
    </div>
  )
}

// ── Traffic chart ─────────────────────────────────────────────────────────────

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
            <p className="text-[9px] text-aura-muted">req</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-aura-indigo">{fmtNum(totalUniqs)}</p>
            <p className="text-[9px] text-aura-muted">vis</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-aura-success">{fmtBytes(totalBw)}</p>
            <p className="text-[9px] text-aura-muted">bw</p>
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        {[
          { label: 'Requests',         values: traffic.requests,  color: 'aura-accent'  },
          { label: 'Unique Visitors',  values: traffic.uniques,   color: 'aura-indigo'  },
          { label: 'Bandwidth',        values: traffic.bandwidth,  color: 'aura-success' },
        ].map(({ label, values, color }) => (
          <div key={label}>
            <p className="text-[9px] text-aura-muted mb-1">{label}</p>
            <BarChart values={values} color={color} />
          </div>
        ))}
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
  cx:    number   // center-x percentage in the diagram container
  cy:    number   // center-y percentage in the diagram container
}

const NODE_META: Record<NodeId, NodeMeta> = {
  vercel:     { label: 'Vercel',     sub: 'Control Panel',  icon: Globe,      cx: 21, cy: 13 },
  cloudflare: { label: 'Cloudflare', sub: 'Website',        icon: Globe,      cx: 79, cy: 13 },
  railway:    { label: 'Railway',    sub: 'Backend',        icon: Server,     cx: 50, cy: 48 },
  supabase:   { label: 'Supabase',  sub: 'PostgreSQL',      icon: Database,   cx: 15, cy: 84 },
  r2:         { label: 'R2',        sub: 'Storage',         icon: HardDrive,  cx: 50, cy: 84 },
  neo4j:      { label: 'Neo4j',     sub: 'Graph DB',        icon: GitBranch,  cx: 85, cy: 84 },
}

// Per-node brand color palette
const NODE_COLORS: Record<NodeId, {
  stripe: string; iconBg: string; iconColor: string; glow: string; border: string
}> = {
  vercel:     { stripe: 'linear-gradient(90deg,#6366f1,#8b5cf6)', iconBg: 'rgba(99,102,241,0.18)',  iconColor: '#a5b4fc', glow: 'rgba(99,102,241,0.25)',  border: 'rgba(99,102,241,0.35)'  },
  cloudflare: { stripe: 'linear-gradient(90deg,#f97316,#fb923c)', iconBg: 'rgba(249,115,22,0.18)',  iconColor: '#fdba74', glow: 'rgba(249,115,22,0.25)',  border: 'rgba(249,115,22,0.35)'  },
  railway:    { stripe: 'linear-gradient(90deg,#8b5cf6,#a78bfa)', iconBg: 'rgba(139,92,246,0.18)',  iconColor: '#c4b5fd', glow: 'rgba(139,92,246,0.25)',  border: 'rgba(139,92,246,0.35)'  },
  supabase:   { stripe: 'linear-gradient(90deg,#10b981,#34d399)', iconBg: 'rgba(16,185,129,0.18)',  iconColor: '#6ee7b7', glow: 'rgba(16,185,129,0.30)',  border: 'rgba(16,185,129,0.40)'  },
  r2:         { stripe: 'linear-gradient(90deg,#3b82f6,#60a5fa)', iconBg: 'rgba(59,130,246,0.18)',  iconColor: '#93c5fd', glow: 'rgba(59,130,246,0.25)',  border: 'rgba(59,130,246,0.35)'  },
  neo4j:      { stripe: 'linear-gradient(90deg,#06b6d4,#22d3ee)', iconBg: 'rgba(6,182,212,0.18)',   iconColor: '#67e8f9', glow: 'rgba(6,182,212,0.25)',   border: 'rgba(6,182,212,0.35)'   },
}

interface EdgeDef { a: NodeId; b: NodeId; label: string; stroke: string; labelFill: string }

const EDGES: EdgeDef[] = [
  { a: 'vercel',     b: 'supabase', label: 'SQL',  stroke: 'rgba(52,211,153,0.55)',  labelFill: 'rgba(52,211,153,0.85)'  },
  { a: 'vercel',     b: 'r2',       label: 'S3',   stroke: 'rgba(96,165,250,0.55)',  labelFill: 'rgba(96,165,250,0.85)'  },
  { a: 'cloudflare', b: 'railway',  label: 'HTTP', stroke: 'rgba(167,139,250,0.55)', labelFill: 'rgba(167,139,250,0.85)' },
  { a: 'railway',    b: 'supabase', label: 'JDBC', stroke: 'rgba(52,211,153,0.55)',  labelFill: 'rgba(52,211,153,0.85)'  },
  { a: 'railway',    b: 'r2',       label: 'S3',   stroke: 'rgba(96,165,250,0.55)',  labelFill: 'rgba(96,165,250,0.85)'  },
  { a: 'railway',    b: 'neo4j',    label: 'Bolt', stroke: 'rgba(34,211,238,0.55)',  labelFill: 'rgba(34,211,238,0.85)'  },
]

function getNodeStatus(id: NodeId, s: Stats): boolean | null {
  switch (id) {
    case 'vercel':     return s.vercel.configured     ? deployState(s.vercel.state) === 'ok'                             : null
    case 'cloudflare': return s.cloudflare.configured && s.cloudflare.pages ? deployState(s.cloudflare.pages.state) === 'ok' : null
    case 'railway':    {
      if (!s.railway.configured) return null
      const states = s.railway.deployments?.map(d => deployState(d.status)) ?? []
      return states.length ? states.every(st => st === 'ok') : null
    }
    case 'supabase':   return s.supabase.ok
    case 'r2':         return s.r2.ok
    case 'neo4j':      return s.neo4j.configured ? (s.neo4j.ok ?? false) : null
  }
}

function getNodeMiniStat(id: NodeId, s: Stats): string | null {
  switch (id) {
    case 'supabase':   return s.supabase.ok ? `${fmtNum(s.supabase.counts?.lectures ?? 0)} lectures` : null
    case 'r2':         return s.r2.ok ? `${fmtNum(s.r2.imageObjects)}${s.r2.imagesTruncated ? '+' : ''} files` : null
    case 'neo4j':      return s.neo4j.ok ? `${fmtNum(s.neo4j.nodeCount ?? 0)} nodes` : (s.neo4j.configured ? 'unreachable' : null)
    case 'vercel':     return s.vercel.configured     ? (deployState(s.vercel.state) === 'ok'                    ? 'live' : 'error') : null
    case 'cloudflare': return s.cloudflare.configured ? (s.cloudflare.pages ? (deployState(s.cloudflare.pages.state) === 'ok' ? 'live' : 'error') : null) : null
    case 'railway':    {
      if (!s.railway.configured || !s.railway.deployments?.length) return null
      const ok = s.railway.deployments.filter(d => deployState(d.status) === 'ok').length
      return `${ok}/${s.railway.deployments.length} live`
    }
  }
}

// ── Architecture diagram ──────────────────────────────────────────────────────

function ArchDiagram({ stats, onNodeClick }: { stats: Stats; onNodeClick: (id: NodeId) => void }) {
  const [hovered, setHovered] = useState<NodeId | null>(null)

  const connectedNodes = (id: NodeId): Set<NodeId> => new Set([
    ...EDGES.filter(e => e.a === id).map(e => e.b),
    ...EDGES.filter(e => e.b === id).map(e => e.a),
  ])

  return (
    <div className="relative w-full select-none" style={{ height: 348 }}>

      {/* ── SVG connection lines ── */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <defs>
          <style>{`
            @keyframes flowDash { to { stroke-dashoffset: -14; } }
            .edge-flow { stroke-dasharray: 5 4; animation: flowDash 2s linear infinite; }
          `}</style>
          {EDGES.map((edge, i) => (
            <marker
              key={i}
              id={`arr-${edge.a}-${edge.b}`}
              markerWidth="5" markerHeight="5"
              refX="4" refY="2.5" orient="auto"
            >
              <polygon points="0 0, 5 2.5, 0 5" fill={edge.stroke} />
            </marker>
          ))}
        </defs>

        {EDGES.map((edge, i) => {
          const a    = NODE_META[edge.a]
          const b    = NODE_META[edge.b]
          // Cubic bezier: control points create an S-curve
          const midY = (a.cy + b.cy) / 2
          const path = `M ${a.cx} ${a.cy} C ${a.cx} ${midY} ${b.cx} ${midY} ${b.cx} ${b.cy}`
          const isActive = hovered === null || hovered === edge.a || hovered === edge.b

          return (
            <g
              key={i}
              style={{ opacity: isActive ? 1 : 0.08, transition: 'opacity 0.25s' }}
            >
              {/* Wide glow underneath */}
              <path d={path} fill="none" stroke={edge.stroke} strokeWidth="2.5" strokeLinecap="round" opacity="0.2" />
              {/* Animated dashed line */}
              <path
                d={path} fill="none" stroke={edge.stroke} strokeWidth="0.75"
                strokeLinecap="round" className="edge-flow"
                markerEnd={`url(#arr-${edge.a}-${edge.b})`}
                style={{ animationDelay: `${i * 0.28}s` }}
              />
              {/* Protocol label — perpendicular offset from midpoint */}
              <text
                x={(a.cx + b.cx) / 2 + (b.cx > a.cx ? 3 : -3)}
                y={(a.cy + b.cy) / 2 - 1.5}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="2.6" fontFamily="ui-monospace, monospace" fontWeight="700"
                fill={edge.labelFill}
              >
                {edge.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* ── Node cards ── */}
      {(Object.entries(NODE_META) as [NodeId, NodeMeta][]).map(([id, meta]) => {
        const status    = getNodeStatus(id, stats)
        const miniStat  = getNodeMiniStat(id, stats)
        const color     = NODE_COLORS[id]
        const Icon      = meta.icon
        const isDimmed  = hovered !== null && hovered !== id && !connectedNodes(hovered).has(id)
        const isHighlit = hovered === id

        return (
          <button
            key={id}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onNodeClick(id)}
            style={{
              left:       `${meta.cx}%`,
              top:        `${meta.cy}%`,
              opacity:    isDimmed ? 0.25 : 1,
              transition: 'opacity 0.25s, transform 0.18s, box-shadow 0.18s',
              transform:  isHighlit
                ? 'translate(-50%, -50%) scale(1.10)'
                : 'translate(-50%, -50%) scale(1)',
              boxShadow:  status === true
                ? `0 0 0 1px ${color.border}, 0 0 20px ${color.glow}`
                : isHighlit
                ? `0 0 0 1px ${color.border}`
                : `0 0 0 1px rgba(255,255,255,0.08)`,
            }}
            className="absolute z-10 w-[88px] rounded-2xl overflow-hidden cursor-pointer
                       bg-[rgba(10,10,24,0.75)] backdrop-blur-md active:scale-95"
          >
            {/* Colored brand stripe */}
            <div className="h-[3px] w-full" style={{ background: color.stripe }} />

            <div className="px-2 pt-2.5 pb-2.5 flex flex-col items-center gap-2">
              {/* Icon in colored circle */}
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: color.iconBg }}
              >
                <Icon size={18} style={{ color: color.iconColor }} />
              </div>

              {/* Service name */}
              <div className="text-center leading-none">
                <p className="text-[10.5px] font-bold tracking-wide" style={{ color: color.iconColor }}>
                  {meta.label}
                </p>
                <p className="text-[8px] text-aura-muted mt-0.5">{meta.sub}</p>
              </div>

              {/* Status + quick stat */}
              <div className="flex flex-col items-center gap-0.5 w-full">
                <div className="flex items-center gap-1.5">
                  {/* Status dot */}
                  <span className="relative flex h-2 w-2 shrink-0">
                    {status === true && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-aura-success opacity-50" />
                    )}
                    <span className={clsx(
                      'relative inline-flex rounded-full h-2 w-2',
                      status === true  ? 'bg-aura-success' :
                      status === false ? 'bg-aura-error'   : 'bg-white/20',
                    )} />
                  </span>
                  {miniStat && (
                    <span className="text-[8px] text-aura-muted tabular-nums truncate max-w-[58px]">
                      {miniStat}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Modal detail content per node ─────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
  courses: 'Courses', lectures: 'Lectures',
  directors: 'Directors', films: 'Films', writers: 'Writers',
  books: 'Books', painters: 'Painters', paintings: 'Paintings',
  philosophers: 'Philosophers', themes: 'Themes',
}

function SupabaseModalContent({ stats }: { stats: SupabaseStats }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={clsx('w-2 h-2 rounded-full', stats.ok ? 'bg-aura-success' : 'bg-aura-error')} />
        <span className="text-xs font-medium text-aura-text">{stats.ok ? 'Connected' : 'Unreachable'}</span>
        {stats.error && <span className="text-[10px] text-aura-error truncate">{stats.error}</span>}
      </div>
      {stats.ok && stats.counts && (
        <>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
            {Object.entries(ENTITY_LABELS).map(([key, label]) => (
              <Row key={key} label={label} value={
                <span className="tabular-nums">{fmtNum(stats.counts[key] ?? 0)}</span>
              } />
            ))}
          </div>
          <div className="border-t border-white/[0.06] pt-2 space-y-1.5">
            <Row label="Pending jobs" value={stats.pendingJobs ?? 0} />
            <Row label="Jobs (24h)"   value={stats.recentJobs ?? 0} />
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
        <span className={clsx('w-2 h-2 rounded-full', stats.ok ? 'bg-aura-success' : 'bg-aura-error')} />
        <span className="text-xs font-medium text-aura-text">{stats.ok ? 'Connected' : 'Unreachable'}</span>
      </div>
      {stats.ok && (
        <div className="space-y-1.5">
          <Row label="Objects" value={`${fmtNum(stats.imageObjects)}${stats.imagesTruncated ? '+' : ''}`} />
          <Row label="Prefix"  value={<span className="font-mono text-[10px] text-aura-muted">images/</span>} />
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
        <span className={clsx('w-2 h-2 rounded-full', stats.ok ? 'bg-aura-success' : 'bg-aura-error')} />
        <span className="text-xs font-medium text-aura-text">{stats.ok ? 'Connected' : 'Unreachable'}</span>
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
      {stats.name      && <Row label="Project"     value={stats.name} />}
      {stats.createdAt && <Row label="Last deploy" value={fmtAgo(stats.createdAt)} />}
      {stats.url && (
        <a href={stats.url.startsWith('http') ? stats.url : `https://${stats.url}`}
           target="_blank" rel="noreferrer"
           className="block text-[10px] text-aura-accent/70 hover:text-aura-accent truncate transition-colors">
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
            <a href={d.url.startsWith('http') ? d.url : `https://${d.url}`}
               target="_blank" rel="noreferrer"
               className="block text-[10px] text-aura-accent/70 hover:text-aura-accent truncate transition-colors">
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
            <a href={stats.pages.url.startsWith('http') ? stats.pages.url : `https://${stats.pages.url}`}
               target="_blank" rel="noreferrer"
               className="block text-[10px] text-aura-accent/70 hover:text-aura-accent truncate transition-colors">
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

// ── Node detail modal ─────────────────────────────────────────────────────────

function NodeModal({ id, stats, onClose }: { id: NodeId; stats: Stats; onClose: () => void }) {
  const meta   = NODE_META[id]
  const color  = NODE_COLORS[id]
  const status = getNodeStatus(id, stats)
  const Icon   = meta.icon

  // Edges connected to this node
  const myEdges = EDGES.filter(e => e.a === id || e.b === id)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm px-3 pb-5"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 56, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{    y: 56, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'rgba(8,8,20,0.92)', border: `1px solid ${color.border}`, backdropFilter: 'blur(20px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Colored top stripe */}
        <div className="h-1 w-full" style={{ background: color.stripe }} />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                 style={{ background: color.iconBg }}>
              <Icon size={18} style={{ color: color.iconColor }} />
            </div>
            <div>
              <p className="text-sm font-bold leading-none" style={{ color: color.iconColor }}>
                {meta.label}
              </p>
              <p className="text-[10px] text-aura-muted mt-0.5">{meta.sub}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Status pill */}
            <span className={clsx(
              'text-[9px] font-bold px-2 py-0.5 rounded-full',
              status === true  ? 'bg-aura-success/15 text-aura-success' :
              status === false ? 'bg-aura-error/15 text-aura-error'     : 'bg-white/5 text-aura-muted',
            )}>
              {status === true ? '● Online' : status === false ? '● Error' : '○ N/A'}
            </span>
            <button onClick={onClose}
                    className="p-1.5 rounded-lg text-aura-muted hover:text-aura-text hover:bg-white/[0.07] transition-all">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Connections strip */}
        {myEdges.length > 0 && (
          <div className="flex gap-1.5 px-4 pb-2 flex-wrap">
            {myEdges.map((e, i) => {
              const other = e.a === id ? e.b : e.a
              const dir   = e.a === id ? '→' : '←'
              return (
                <span key={i} className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] text-aura-muted">
                  {dir} {NODE_META[other].label}
                  <span className="ml-1 opacity-60">{e.label}</span>
                </span>
              )
            })}
          </div>
        )}

        <div className="border-t border-white/[0.06] mx-4" />

        {/* Node-specific content */}
        <div className="px-4 py-3">
          {id === 'supabase'   && <SupabaseModalContent   stats={stats.supabase}   />}
          {id === 'r2'         && <R2ModalContent         stats={stats.r2}         />}
          {id === 'neo4j'      && <Neo4jModalContent      stats={stats.neo4j}      />}
          {id === 'vercel'     && <VercelModalContent     stats={stats.vercel}     />}
          {id === 'railway'    && <RailwayModalContent    stats={stats.railway}    />}
          {id === 'cloudflare' && <CloudflareModalContent stats={stats.cloudflare} />}
        </div>
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
          <button onClick={() => load()} className="mt-2 text-xs text-aura-accent underline">Retry</button>
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
            <span className="text-xs font-semibold text-aura-text">System Architecture</span>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-[10px] text-aura-muted">{fmtAgo(lastUpdated.getTime())}</span>
            )}
            <button
              onClick={() => load(true)} disabled={refreshing}
              className="flex items-center gap-1 text-[10px] text-aura-muted hover:text-aura-accent
                         transition-colors px-1.5 py-1 rounded border border-white/[0.06] hover:border-aura-accent/30"
            >
              <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Diagram */}
        <ArchDiagram stats={s} onNodeClick={setActiveNode} />

        {/* Edge legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-0.5">
          {[
            { color: 'rgba(52,211,153,0.7)',  label: 'SQL / JDBC' },
            { color: 'rgba(96,165,250,0.7)',  label: 'S3 / R2'    },
            { color: 'rgba(167,139,250,0.7)', label: 'HTTP REST'   },
            { color: 'rgba(34,211,238,0.7)',  label: 'Neo4j Bolt'  },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="inline-block h-px w-5 rounded" style={{ background: color }} />
              <span className="text-[9px] text-aura-muted">{label}</span>
            </div>
          ))}
          <p className="text-[9px] text-aura-muted/35 ml-auto">tap node for details</p>
        </div>

        <p className="text-center text-[10px] text-aura-muted/30 pt-1">Auto-refreshes every 60s</p>
      </motion.div>

      <AnimatePresence>
        {activeNode && (
          <NodeModal id={activeNode} stats={s} onClose={() => setActiveNode(null)} />
        )}
      </AnimatePresence>
    </>
  )
}
