'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GitMerge, Loader2, RefreshCw, CheckCircle2, ArrowRight,
  ImageIcon, Link2, X, RotateCcw, Plus, Search, ChevronDown,
} from 'lucide-react'
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

interface HistoryRow {
  group_sig: string
  action:    'approved' | 'declined'
  keep_type: string | null
}

// Signature based on name + sorted entity types
function groupSig(group: DuplicateGroup): string {
  return `${group.name.toLowerCase()}|${group.entities.map(e => e.type).sort().join(',')}`
}

function groupKey(section: string, group: DuplicateGroup): string {
  return `${section}:${group.entities.map(e => `${e.type}:${e.id}`).sort().join('|')}`
}

async function fetchHistory(): Promise<HistoryRow[]> {
  const res = await fetch('/api/entities/merge-history')
  if (!res.ok) return []
  return res.json()
}

async function saveHistoryEntry(group_sig: string, action: 'approved' | 'declined', keep_type?: string) {
  await fetch('/api/entities/merge-history', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ group_sig, action, keep_type: keep_type ?? null }),
  })
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
  const keepEntity   = keepIdx !== null ? group.entities[keepIdx] : null
  const toDelete     = keepIdx !== null ? group.entities.filter((_, i) => i !== keepIdx) : []

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="glass rounded-xl border border-white/[0.07] p-3 space-y-2.5"
    >
      {/* Name + similarity badge */}
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-aura-text flex-1 truncate">{group.name}</p>
        {group.matchType === 'similar' && (
          <span className="text-[10px] text-aura-muted bg-white/[0.05] px-1.5 py-0.5 rounded-full border border-white/[0.06] shrink-0 font-mono">
            {Math.round(group.similarity * 100)}%
          </span>
        )}
        <button
          onClick={onDecline}
          className="text-aura-muted/40 hover:text-aura-muted transition-colors shrink-0"
          title="Decline (not duplicates)"
        >
          <X size={12} />
        </button>
      </div>

      {/* Entity buttons */}
      <div className="flex flex-wrap gap-1.5">
        {group.entities.map((entity, idx) => (
          <button
            key={`${entity.type}:${entity.id}`}
            onClick={() => onSelect(idx)}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all duration-150',
              keepIdx === idx
                ? 'bg-aura-accent/10 text-aura-accent border-aura-accent/20'
                : 'text-aura-muted border-white/[0.07] hover:border-white/[0.14] hover:text-aura-text',
            )}
          >
            <span className="text-[11px]">{ENTITY_TYPES[entity.type].icon}</span>
            <span className="font-medium">{entity.displayName}</span>
            <span className="opacity-50 text-[10px]">{ENTITY_TYPES[entity.type].label}</span>
            {entity.connectionCount > 0 && (
              <span className="flex items-center gap-0.5 opacity-60">
                <Link2 size={9} />
                {entity.connectionCount}
              </span>
            )}
            {entity.hasImage && <ImageIcon size={9} className="opacity-40" />}
            {keepIdx === idx && <CheckCircle2 size={10} className="text-aura-accent" />}
          </button>
        ))}
      </div>

      {/* Merge button */}
      <AnimatePresence>
        {keepIdx !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <button
              onClick={onMerge}
              disabled={merging}
              className={clsx(
                'w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold',
                'bg-aura-accent/10 text-aura-accent border border-aura-accent/20',
                'hover:bg-aura-accent/20 transition-colors disabled:opacity-40',
              )}
            >
              {merging
                ? <Loader2 size={13} className="animate-spin" />
                : <GitMerge size={13} />}
              Keep {keepEntity && ENTITY_TYPES[keepEntity.type].label}
              <ArrowRight size={11} className="opacity-60" />
              {toDelete.map(d => `delete ${ENTITY_TYPES[d.type].label} #${d.id}`).join(', ')}
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
// Custom merge panel
// ---------------------------------------------------------------------------
const MERGEABLE_TYPES = Object.keys(ENTITY_TYPES).filter(
  t => t !== 'courses',
) as EntityType[]

interface EntitySearchResult {
  id:          number
  displayName: string
  type:        EntityType
}

function CustomMergePanel({ onMerged }: { onMerged: () => void }) {
  const { success, error: toastError } = useToast()

  const [keepType,    setKeepType]    = useState<EntityType>('directors')
  const [deleteType,  setDeleteType]  = useState<EntityType>('directors')
  const [keepQuery,   setKeepQuery]   = useState('')
  const [deleteQuery, setDeleteQuery] = useState('')
  const [keepResults,   setKeepResults]   = useState<EntitySearchResult[]>([])
  const [deleteResults, setDeleteResults] = useState<EntitySearchResult[]>([])
  const [keepEntity,   setKeepEntity]   = useState<EntitySearchResult | null>(null)
  const [deleteEntity, setDeleteEntity] = useState<EntitySearchResult | null>(null)
  const [merging, setMerging] = useState(false)
  const [open, setOpen] = useState(false)

  async function searchEntities(type: EntityType, query: string): Promise<EntitySearchResult[]> {
    if (!query.trim()) return []
    const res  = await fetch(`/api/entities/${type}?all=true&search=${encodeURIComponent(query)}`)
    const data = await res.json()
    return (data.entities ?? []).map((e: { id: number; displayName: string }) => ({
      id:          e.id,
      displayName: e.displayName,
      type,
    }))
  }

  useEffect(() => {
    const t = setTimeout(async () => {
      setKeepResults(await searchEntities(keepType, keepQuery))
    }, 300)
    return () => clearTimeout(t)
  }, [keepType, keepQuery])

  useEffect(() => {
    const t = setTimeout(async () => {
      setDeleteResults(await searchEntities(deleteType, deleteQuery))
    }, 300)
    return () => clearTimeout(t)
  }, [deleteType, deleteQuery])

  async function handleCustomMerge() {
    if (!keepEntity || !deleteEntity) return
    if (keepEntity.type === deleteEntity.type && keepEntity.id === deleteEntity.id) {
      toastError('Invalid', 'Cannot merge an entity with itself.')
      return
    }
    setMerging(true)
    try {
      const res = await fetch('/api/entities/merge', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keepId:     keepEntity.id,
          keepType:   keepEntity.type,
          deleteId:   deleteEntity.id,
          deleteType: deleteEntity.type,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Merge failed')
      }

      // Save to history DB
      const fakeSig = `custom:${keepEntity.type}:${keepEntity.id}:${deleteEntity.type}:${deleteEntity.id}`
      await saveHistoryEntry(fakeSig, 'approved', keepEntity.type)

      success('Merged', `"${deleteEntity.displayName}" merged into "${keepEntity.displayName}".`)
      setKeepEntity(null)
      setDeleteEntity(null)
      setKeepQuery('')
      setDeleteQuery('')
      setKeepResults([])
      setDeleteResults([])
      onMerged()
    } catch (e) {
      toastError('Merge failed', e instanceof Error ? e.message : String(e))
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="glass rounded-2xl border border-white/[0.07] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Plus size={13} className="text-aura-accent" />
          <p className="text-xs font-semibold text-aura-text">Custom Merge</p>
          <span className="text-[10px] text-aura-muted">Manually merge any two entities</span>
        </div>
        <ChevronDown
          size={13}
          className={clsx('text-aura-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 bg-white/[0.01]">
              <div className="grid grid-cols-2 gap-3">
                {/* Keep side */}
                <EntityPicker
                  label="Keep"
                  type={keepType}
                  onTypeChange={t => { setKeepType(t); setKeepEntity(null); setKeepQuery('') }}
                  query={keepQuery}
                  onQueryChange={setKeepQuery}
                  results={keepResults}
                  selected={keepEntity}
                  onSelect={setKeepEntity}
                  accentColor="text-aura-success"
                />

                {/* Delete side */}
                <EntityPicker
                  label="Delete (merge into Keep)"
                  type={deleteType}
                  onTypeChange={t => { setDeleteType(t); setDeleteEntity(null); setDeleteQuery('') }}
                  query={deleteQuery}
                  onQueryChange={setDeleteQuery}
                  results={deleteResults}
                  selected={deleteEntity}
                  onSelect={setDeleteEntity}
                  accentColor="text-aura-error"
                />
              </div>

              {/* Preview */}
              {keepEntity && deleteEntity && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-xs text-aura-success font-medium">{keepEntity.displayName}</span>
                  <span className="text-[10px] text-aura-muted">({ENTITY_TYPES[keepEntity.type].label})</span>
                  <ArrowRight size={11} className="text-aura-muted" />
                  <span className="text-xs text-aura-error line-through opacity-60">{deleteEntity.displayName}</span>
                  <span className="text-[10px] text-aura-muted">({ENTITY_TYPES[deleteEntity.type].label})</span>
                </div>
              )}

              <button
                onClick={handleCustomMerge}
                disabled={!keepEntity || !deleteEntity || merging}
                className={clsx(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold',
                  'bg-gradient-to-r from-aura-accent to-aura-indigo text-aura-base',
                  'hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed',
                )}
              >
                {merging ? <Loader2 size={13} className="animate-spin" /> : <GitMerge size={13} />}
                Merge & Save to History
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Small helper: entity type + search picker
function EntityPicker({
  label, type, onTypeChange, query, onQueryChange, results, selected, onSelect, accentColor,
}: {
  label:          string
  type:           EntityType
  onTypeChange:   (t: EntityType) => void
  query:          string
  onQueryChange:  (q: string) => void
  results:        EntitySearchResult[]
  selected:       EntitySearchResult | null
  onSelect:       (e: EntitySearchResult) => void
  accentColor:    string
}) {
  return (
    <div className="space-y-1.5">
      <p className={clsx('text-[10px] font-semibold uppercase tracking-wider', accentColor)}>{label}</p>

      {/* Type selector */}
      <select
        value={type}
        onChange={e => onTypeChange(e.target.value as EntityType)}
        className="w-full appearance-none bg-black/30 border border-white/[0.08] rounded-lg
                   px-2.5 py-1.5 text-xs text-aura-text focus:outline-none focus:border-aura-accent/40"
      >
        {MERGEABLE_TYPES.map(t => (
          <option key={t} value={t}>{ENTITY_TYPES[t].icon} {ENTITY_TYPES[t].label}</option>
        ))}
      </select>

      {/* Search input */}
      <div className="relative">
        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
        <input
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Search…"
          className="w-full pl-7 pr-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]
                     text-xs text-aura-text placeholder-aura-muted/50 focus:outline-none
                     focus:border-aura-accent/40 transition-colors"
        />
      </div>

      {/* Results or selected */}
      {selected ? (
        <div className={clsx(
          'flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs',
          'bg-aura-accent/5 border-aura-accent/20',
        )}>
          <span className="text-aura-text font-medium truncate">{selected.displayName}</span>
          <button
            onClick={() => { onSelect(null as unknown as EntitySearchResult); onQueryChange('') }}
            className="text-aura-muted/60 hover:text-aura-muted ml-1 shrink-0"
          >
            <X size={10} />
          </button>
        </div>
      ) : results.length > 0 ? (
        <div className="rounded-lg border border-white/[0.07] overflow-hidden max-h-32 overflow-y-auto divide-y divide-white/[0.03]">
          {results.slice(0, 8).map(e => (
            <button
              key={e.id}
              onClick={() => { onSelect(e); onQueryChange(e.displayName) }}
              className="w-full text-left px-2.5 py-1.5 text-xs text-aura-text hover:bg-white/[0.04] transition-colors truncate"
            >
              {e.displayName}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main MergeEntities
// ---------------------------------------------------------------------------
export function MergeEntities() {
  const { success, error: toastError } = useToast()

  const [exact,      setExact]      = useState<DuplicateGroup[]>([])
  const [similar,    setSimilar]    = useState<DuplicateGroup[]>([])
  const [loading,    setLoading]    = useState(false)
  const [keepMap,    setKeepMap]    = useState<Record<string, number>>({})
  const [merging,    setMerging]    = useState<string | null>(null)
  const [hasHistory, setHasHistory] = useState(false)

  const doMerge = useCallback(async (
    section: 'exact' | 'similar',
    group:   DuplicateGroup,
    keepIdx: number,
  ): Promise<boolean> => {
    const key        = groupKey(section, group)
    const keepEntity = group.entities[keepIdx]
    const toDelete   = group.entities.filter((_, i) => i !== keepIdx)

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

      await saveHistoryEntry(groupSig(group), 'approved', keepEntity.type)
      setHasHistory(true)

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
  }, [toastError])

  const handleMerge = useCallback(async (section: 'exact' | 'similar', group: DuplicateGroup) => {
    const key     = groupKey(section, group)
    const keepIdx = keepMap[key]
    if (keepIdx === undefined) return
    const keepEntity = group.entities[keepIdx]
    const ok = await doMerge(section, group, keepIdx)
    if (ok) success('Merged', `"${group.name}" → ${ENTITY_TYPES[keepEntity.type].label} #${keepEntity.id}.`)
  }, [keepMap, doMerge, success])

  const handleDecline = useCallback(async (section: 'exact' | 'similar', group: DuplicateGroup) => {
    await saveHistoryEntry(groupSig(group), 'declined')
    setHasHistory(true)
    const sig    = groupSig(group)
    const remove = (prev: DuplicateGroup[]) => prev.filter(g => groupSig(g) !== sig)
    if (section === 'exact') setExact(remove)
    else setSimilar(remove)
  }, [])

  const resetHistory = useCallback(async () => {
    await fetch('/api/entities/merge-history', { method: 'DELETE' })
    setHasHistory(false)
    success('Reset', 'Merge history cleared. Refresh to see all suggestions.')
  }, [success])

  const fetchDuplicates = useCallback(async () => {
    setLoading(true)
    setKeepMap({})
    try {
      const [dupRes, history] = await Promise.all([
        fetch('/api/entities/duplicates').then(r => r.json()),
        fetchHistory(),
      ])

      if (!dupRes || dupRes.error) throw new Error(dupRes?.error ?? 'Failed to load duplicates')

      const approvedMap = new Map<string, string>()
      const declinedSet = new Set<string>()
      for (const row of history) {
        if (row.action === 'approved' && row.keep_type) approvedMap.set(row.group_sig, row.keep_type)
        if (row.action === 'declined') declinedSet.add(row.group_sig)
      }
      setHasHistory(history.length > 0)

      const exactAll:   DuplicateGroup[] = (dupRes.exact   ?? []).filter((g: DuplicateGroup) => !declinedSet.has(groupSig(g)))
      const similarAll: DuplicateGroup[] = (dupRes.similar ?? []).filter((g: DuplicateGroup) => !declinedSet.has(groupSig(g)))

      const toAutoMerge = [...exactAll, ...similarAll].filter(g => approvedMap.has(groupSig(g)))
      setExact(exactAll.filter(g => !approvedMap.has(groupSig(g))))
      setSimilar(similarAll.filter(g => !approvedMap.has(groupSig(g))))

      let autoCount = 0
      for (const group of toAutoMerge) {
        const keepType = approvedMap.get(groupSig(group))!
        const keepIdx  = group.entities.findIndex(e => e.type === keepType)
        const section  = exactAll.includes(group) ? 'exact' : 'similar'
        if (keepIdx !== -1) {
          const ok = await doMerge(section, group, keepIdx)
          if (ok) autoCount++
        }
      }
      if (autoCount > 0) {
        success('Auto-merged', `${autoCount} previously approved merge${autoCount > 1 ? 's' : ''} applied automatically.`)
      }
    } catch (e: unknown) {
      toastError('Load failed', e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [doMerge, success, toastError])

  useEffect(() => { fetchDuplicates() }, [fetchDuplicates])

  const totalCount = exact.length + similar.length

  return (
    <div className="space-y-4">

      {/* Header card */}
      <div className="glass rounded-2xl p-4 border border-white/[0.07] flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-aura-text">Merge Entities</p>
          <p className="text-[11px] text-aura-muted mt-0.5">
            {loading
              ? 'Scanning all entity types…'
              : totalCount > 0
                ? `${exact.length} exact · ${similar.length} similar`
                : 'No duplicates or similar names found'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasHistory && (
            <button
              onClick={resetHistory}
              title="Reset merge history (approved + declined)"
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

      {/* Custom merge panel */}
      <CustomMergePanel onMerged={fetchDuplicates} />

      {/* Duplicate suggestions */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-aura-accent" />
        </div>
      ) : (
        <div className="space-y-3">
          {exact.length > 0 && (
            <>
              <SectionHeader label="Exact Matches" count={exact.length} />
              <AnimatePresence mode="popLayout">
                {exact.map(group => {
                  const key     = groupKey('exact', group)
                  const keepIdx = keepMap[key] ?? null
                  return (
                    <DuplicateCard
                      key={key}
                      group={group}
                      keepIdx={keepIdx}
                      onSelect={idx => setKeepMap(prev => ({ ...prev, [key]: idx }))}
                      onMerge={() => handleMerge('exact', group)}
                      onDecline={() => handleDecline('exact', group)}
                      merging={merging === key}
                    />
                  )
                })}
              </AnimatePresence>
            </>
          )}

          {similar.length > 0 && (
            <>
              <SectionHeader label="Similar Names" count={similar.length} />
              <AnimatePresence mode="popLayout">
                {similar.map(group => {
                  const key     = groupKey('similar', group)
                  const keepIdx = keepMap[key] ?? null
                  return (
                    <DuplicateCard
                      key={key}
                      group={group}
                      keepIdx={keepIdx}
                      onSelect={idx => setKeepMap(prev => ({ ...prev, [key]: idx }))}
                      onMerge={() => handleMerge('similar', group)}
                      onDecline={() => handleDecline('similar', group)}
                      merging={merging === key}
                    />
                  )
                })}
              </AnimatePresence>
            </>
          )}
        </div>
      )}
    </div>
  )
}