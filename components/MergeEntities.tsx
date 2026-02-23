'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitMerge, Loader2, RefreshCw, CheckCircle2, ArrowRight, ImageIcon, Link2, X, RotateCcw } from 'lucide-react'
import { EntityType, ENTITY_TYPES, JUNCTION_MAP } from '@/lib/constants'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

interface DuplicateEntity {
  id:              number
  type:            EntityType
  displayName:     string
  hebrewName:      string | null
  connectionCount: number
  hasImage:        boolean
}

interface DuplicateGroup {
  name:       string
  entities:   DuplicateEntity[]
  matchType:  'exact' | 'similar'
  similarity: number
}

// ---------------------------------------------------------------------------
// Merge history (localStorage)
// ---------------------------------------------------------------------------
const HISTORY_KEY = 'merge-history-v1'

interface MergeHistoryEntry { keepType: EntityType }
interface MergeHistory {
  approved: Record<string, MergeHistoryEntry>  // groupSig → which type to keep
  declined: string[]                           // groupSigs never to show
}

function loadHistory(): MergeHistory {
  if (typeof window === 'undefined') return { approved: {}, declined: [] }
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as MergeHistory) : { approved: {}, declined: [] }
  } catch {
    return { approved: {}, declined: [] }
  }
}

function saveHistory(h: MergeHistory) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)) } catch { /* ignore */ }
}

// Signature based on name + sorted entity types (survives entity ID changes)
function groupSig(group: DuplicateGroup): string {
  return `${group.name.toLowerCase()}|${group.entities.map(e => e.type).sort().join(',')}`
}

// Stable unique key per group for keepMap/merging state (order-independent IDs)
function groupKey(section: string, group: DuplicateGroup): string {
  return `${section}:${group.entities.map(e => `${e.type}:${e.id}`).sort().join('|')}`
}

// ---------------------------------------------------------------------------
// Single duplicate group card
// ---------------------------------------------------------------------------
function DuplicateCard({
  group,
  keepIdx,
  onSelect,
  onMerge,
  onDecline,
  merging,
}: {
  group:     DuplicateGroup
  keepIdx:   number | null
  onSelect:  (idx: number) => void
  onMerge:   () => void
  onDecline: () => void
  merging:   boolean
}) {
  const keepEntity     = keepIdx !== null ? group.entities[keepIdx] : null
  const deleteEntities = keepIdx !== null ? group.entities.filter((_, i) => i !== keepIdx) : []

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="glass rounded-2xl border border-white/[0.07] overflow-hidden"
    >
      {/* Name header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-aura-text">{group.name}</p>
          <p className="text-[11px] text-aura-muted mt-0.5">Tap the version to keep</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={clsx(
            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
            group.matchType === 'exact'
              ? 'text-aura-error border-aura-error/30 bg-aura-error/10'
              : 'text-aura-accent border-aura-accent/30 bg-aura-accent/10',
          )}>
            {group.matchType === 'exact' ? 'exact' : `${Math.round(group.similarity * 100)}% similar`}
          </span>
          <button
            onClick={onDecline}
            title="Decline — never show again"
            className="text-aura-muted/40 hover:text-aura-error transition-colors p-0.5"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Entity options */}
      <div className="p-3 space-y-2">
        {group.entities.map((entity, idx) => {
          const cfg         = ENTITY_TYPES[entity.type]
          const isSelected  = keepIdx === idx
          const hasJunction = entity.type in JUNCTION_MAP

          return (
            <button
              key={`${entity.type}-${entity.id}`}
              onClick={() => onSelect(idx)}
              className={clsx(
                'w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200 text-left',
                isSelected
                  ? 'bg-aura-accent/10 border-aura-accent/30'
                  : 'border-white/[0.08] hover:border-white/[0.16]',
              )}
            >
              <span className="text-xl shrink-0 leading-none mt-0.5">{cfg.icon}</span>

              <div className="flex-1 min-w-0">
                <p className={clsx('text-xs font-semibold', isSelected ? 'text-aura-accent' : 'text-aura-text')}>
                  {cfg.label}
                  {!hasJunction && (
                    <span className="ml-1.5 text-[10px] text-aura-muted font-normal">(no connections)</span>
                  )}
                </p>
                {entity.hebrewName
                  ? <p className="text-xs text-aura-muted font-hebrew truncate mt-0.5" dir="rtl">{entity.hebrewName}</p>
                  : <p className="text-[10px] text-aura-muted/40 mt-0.5">no Hebrew name</p>
                }
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={clsx(
                    'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                    entity.connectionCount > 0
                      ? 'text-aura-success border-aura-success/30 bg-aura-success/10'
                      : 'text-aura-muted/50 border-white/[0.06]',
                  )}>
                    <Link2 size={9} />
                    {entity.connectionCount} lecture{entity.connectionCount !== 1 ? 's' : ''}
                  </span>
                  <span className={clsx(
                    'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                    entity.hasImage
                      ? 'text-aura-accent border-aura-accent/30 bg-aura-accent/10'
                      : 'text-aura-muted/50 border-white/[0.06]',
                  )}>
                    <ImageIcon size={9} />
                    {entity.hasImage ? 'has image' : 'no image'}
                  </span>
                </div>
              </div>

              <span className="text-[10px] text-aura-muted/50 shrink-0 mt-0.5">#{entity.id}</span>
              {isSelected && <CheckCircle2 size={14} className="text-aura-accent shrink-0 mt-0.5" />}
            </button>
          )
        })}
      </div>

      {/* Merge action */}
      <AnimatePresence>
        {keepIdx !== null && keepEntity && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 pb-3 overflow-hidden"
          >
            <button
              onClick={onMerge}
              disabled={merging}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                         bg-aura-accent/10 border border-aura-accent/20 text-aura-accent
                         text-xs font-semibold disabled:opacity-40 transition-colors"
            >
              {merging
                ? <Loader2 size={13} className="animate-spin" />
                : <GitMerge size={13} />}
              Keep {ENTITY_TYPES[keepEntity.type].label}
              <ArrowRight size={11} className="opacity-60" />
              {deleteEntities.map(d => `delete ${ENTITY_TYPES[d.type].label} #${d.id}`).join(', ')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------
function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-1">
      <p className="text-xs font-bold text-aura-muted uppercase tracking-wider">{label}</p>
      <span className="text-[10px] text-aura-muted/60 bg-white/[0.05] px-1.5 py-0.5 rounded-full border border-white/[0.06]">
        {count}
      </span>
      <div className="flex-1 h-px bg-white/[0.05]" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main MergeEntities
// ---------------------------------------------------------------------------
export function MergeEntities() {
  const { success, error: toastError } = useToast()

  const [exact,   setExact]   = useState<DuplicateGroup[]>([])
  const [similar, setSimilar] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [keepMap, setKeepMap] = useState<Record<string, number>>({})
  const [merging, setMerging] = useState<string | null>(null)
  const [historySize, setHistorySize] = useState<{ approved: number; declined: number }>({ approved: 0, declined: 0 })

  // Sync history size display
  const refreshHistorySize = useCallback(() => {
    const h = loadHistory()
    setHistorySize({ approved: Object.keys(h.approved).length, declined: h.declined.length })
  }, [])

  // Core merge executor — used for both manual and auto merges
  const doMerge = useCallback(async (
    section: 'exact' | 'similar',
    group: DuplicateGroup,
    keepIdx: number,
  ): Promise<boolean> => {
    const key          = groupKey(section, group)
    const keepEntity   = group.entities[keepIdx]
    const toDelete     = group.entities.filter((_, i) => i !== keepIdx)

    setMerging(key)
    try {
      for (const del of toDelete) {
        const res = await fetch('/api/entities/merge', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keepId:     keepEntity.id,
            keepType:   keepEntity.type,
            deleteId:   del.id,
            deleteType: del.type,
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error ?? 'Merge failed')
        }
      }

      // Persist approval: remember which type to keep for this name+types combo
      const h = loadHistory()
      h.approved[groupSig(group)] = { keepType: keepEntity.type }
      saveHistory(h)
      refreshHistorySize()

      // Remove from display
      const remove = (prev: DuplicateGroup[]) => prev.filter(g => groupKey(section, g) !== key)
      if (section === 'exact') setExact(remove)
      else setSimilar(remove)
      setKeepMap(prev => { const n = { ...prev }; delete n[key]; return n })

      return true
    } catch (e: unknown) {
      toastError('Merge failed', e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setMerging(null)
    }
  }, [toastError, refreshHistorySize])

  const handleMerge = useCallback(async (section: 'exact' | 'similar', group: DuplicateGroup) => {
    const key     = groupKey(section, group)
    const keepIdx = keepMap[key]
    if (keepIdx === undefined) return
    const keepEntity = group.entities[keepIdx]
    const ok = await doMerge(section, group, keepIdx)
    if (ok) success('Merged', `"${group.name}" → ${ENTITY_TYPES[keepEntity.type].label} #${keepEntity.id}.`)
  }, [keepMap, doMerge, success])

  const handleDecline = useCallback((section: 'exact' | 'similar', group: DuplicateGroup) => {
    const sig = groupSig(group)
    const h   = loadHistory()
    if (!h.declined.includes(sig)) {
      h.declined.push(sig)
      saveHistory(h)
    }
    refreshHistorySize()
    const remove = (prev: DuplicateGroup[]) => prev.filter(g => groupSig(g) !== sig)
    if (section === 'exact') setExact(remove)
    else setSimilar(remove)
  }, [refreshHistorySize])

  const resetHistory = useCallback(() => {
    saveHistory({ approved: {}, declined: [] })
    refreshHistorySize()
    success('Reset', 'Merge history cleared. Refresh to see all suggestions.')
  }, [refreshHistorySize, success])

  const fetchDuplicates = useCallback(async () => {
    setLoading(true)
    setKeepMap({})
    try {
      const res  = await fetch('/api/entities/duplicates')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')

      const h          = loadHistory()
      const declinedSet = new Set(h.declined)

      // Filter out declined groups
      const exactGroups:   DuplicateGroup[] = (data.exact   ?? []).filter((g: DuplicateGroup) => !declinedSet.has(groupSig(g)))
      const similarGroups: DuplicateGroup[] = (data.similar ?? []).filter((g: DuplicateGroup) => !declinedSet.has(groupSig(g)))

      // Split: approved (auto-merge) vs new
      const autoExact   = exactGroups.filter(g =>  h.approved[groupSig(g)])
      const autoSimilar = similarGroups.filter(g => h.approved[groupSig(g)])
      setExact(exactGroups.filter(g =>   !h.approved[groupSig(g)]))
      setSimilar(similarGroups.filter(g => !h.approved[groupSig(g)]))

      // Auto-merge approved groups silently
      let autoCount = 0
      for (const group of [...autoExact, ...autoSimilar]) {
        const section   = autoExact.includes(group) ? 'exact' : 'similar'
        const entry     = h.approved[groupSig(group)]
        const keepIdx   = group.entities.findIndex(e => e.type === entry.keepType)
        if (keepIdx !== -1) {
          const ok = await doMerge(section, group, keepIdx)
          if (ok) autoCount++
        }
      }
      if (autoCount > 0) {
        success('Auto-merged', `${autoCount} previously approved merge${autoCount > 1 ? 's' : ''} applied automatically.`)
      }

      refreshHistorySize()
    } catch (e: unknown) {
      toastError('Load failed', e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [doMerge, success, toastError, refreshHistorySize])

  useEffect(() => { fetchDuplicates() }, [fetchDuplicates])

  const totalCount = exact.length + similar.length
  const hasHistory = historySize.approved > 0 || historySize.declined > 0

  return (
    <div className="space-y-4">

      {/* Header card */}
      <div className="glass rounded-2xl p-4 border border-white/[0.07] flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-aura-text">Merge Entities</p>
          <p className="text-[11px] text-aura-muted mt-0.5">
            {loading
              ? 'Scanning Directors, Writers & Philosophers…'
              : totalCount > 0
                ? `${exact.length} exact · ${similar.length} similar`
                : 'No duplicates or similar names found'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasHistory && (
            <button
              onClick={resetHistory}
              title={`Reset merge history (${historySize.approved} approved, ${historySize.declined} declined)`}
              className="flex items-center gap-1.5 text-[11px] text-aura-muted/60 hover:text-aura-muted
                         border border-white/[0.06] hover:border-white/[0.12] rounded-lg px-2 py-1 transition-colors"
            >
              <RotateCcw size={11} />
              Reset history
            </button>
          )}
          <button
            onClick={fetchDuplicates}
            disabled={loading}
            className="text-aura-muted disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-14 gap-2 text-aura-muted">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Scanning…</span>
        </div>
      )}

      {/* Empty */}
      {!loading && totalCount === 0 && (
        <div className="glass rounded-2xl p-8 border border-white/[0.07] text-center">
          <CheckCircle2 size={28} className="text-aura-success mx-auto mb-3" />
          <p className="text-sm font-semibold text-aura-text">All clear</p>
          <p className="text-xs text-aura-muted mt-1">No duplicate or similar names found</p>
        </div>
      )}

      {/* Exact duplicates */}
      {!loading && exact.length > 0 && (
        <div className="space-y-3">
          <SectionHeader label="Exact Duplicates" count={exact.length} />
          <AnimatePresence>
            {exact.map(group => {
              const key = groupKey('exact', group)
              return (
                <DuplicateCard
                  key={key}
                  group={group}
                  keepIdx={keepMap[key] ?? null}
                  onSelect={idx => setKeepMap(prev => ({ ...prev, [key]: idx }))}
                  onMerge={() => handleMerge('exact', group)}
                  onDecline={() => handleDecline('exact', group)}
                  merging={merging === key}
                />
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Similar names */}
      {!loading && similar.length > 0 && (
        <div className="space-y-3">
          <SectionHeader label="Similar Names" count={similar.length} />
          <AnimatePresence>
            {similar.map(group => {
              const key = groupKey('similar', group)
              return (
                <DuplicateCard
                  key={key}
                  group={group}
                  keepIdx={keepMap[key] ?? null}
                  onSelect={idx => setKeepMap(prev => ({ ...prev, [key]: idx }))}
                  onMerge={() => handleMerge('similar', group)}
                  onDecline={() => handleDecline('similar', group)}
                  merging={merging === key}
                />
              )
            })}
          </AnimatePresence>
        </div>
      )}

    </div>
  )
}
