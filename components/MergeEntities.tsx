'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GitMerge, Loader2, RefreshCw, CheckCircle2,
  ArrowRight, ImageIcon, Link2, X, RotateCcw,
  Plus, Search, ChevronDown, Trash2, Shield,
  AlertTriangle,
} from 'lucide-react'
import { EntityType, ENTITY_TYPES, JUNCTION_MAP } from '@/lib/constants'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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

interface MergeSelection {
  keepIdx:   number  // index in group.entities to keep
  deleteIdx: number  // index in group.entities to delete
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
// EntityChip — compact display of one entity
// ---------------------------------------------------------------------------
function EntityChip({
  entity,
  role,
  selected,
  onClick,
  disabled,
}: {
  entity:   DuplicateEntity
  role?:    'keep' | 'delete' | null
  selected: boolean
  onClick:  () => void
  disabled?: boolean
}) {
  const cfg = ENTITY_TYPES[entity.type]

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'relative flex flex-col gap-1.5 p-3 rounded-xl border transition-all duration-200 text-left w-full',
        'disabled:cursor-not-allowed',
        role === 'keep'
          ? 'bg-aura-success/[0.08] border-aura-success/30 shadow-[0_0_12px_rgba(52,211,153,0.1)]'
          : role === 'delete'
          ? 'bg-aura-error/[0.08] border-aura-error/30 shadow-[0_0_12px_rgba(248,113,113,0.1)]'
          : selected
          ? 'bg-white/[0.06] border-white/[0.18]'
          : 'bg-white/[0.02] border-white/[0.07] hover:border-white/[0.15] hover:bg-white/[0.04]',
      )}
    >
      {/* Role badge */}
      {role && (
        <div className={clsx(
          'absolute -top-2 left-3 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider',
          role === 'keep'
            ? 'bg-aura-success text-black'
            : 'bg-aura-error text-white',
        )}>
          {role === 'keep' ? '✓ Keep' : '✕ Delete'}
        </div>
      )}

      {/* Type badge */}
      <div className="flex items-center gap-1.5">
        <span className="text-base leading-none">{cfg.icon}</span>
        <span className={clsx(
          'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md',
          role === 'keep'   ? 'text-aura-success bg-aura-success/15'
          : role === 'delete' ? 'text-aura-error bg-aura-error/15'
          : 'text-aura-muted bg-white/[0.05]',
        )}>
          {cfg.label.replace(/s$/, '')}
        </span>
      </div>

      {/* Name */}
      <div>
        <p className={clsx(
          'text-sm font-semibold leading-snug',
          role === 'keep'   ? 'text-aura-success'
          : role === 'delete' ? 'text-aura-error/80 line-through'
          : 'text-aura-text',
        )}>
          {entity.displayName}
        </p>
        {entity.hebrewName && (
          <p className="text-[11px] text-aura-muted mt-0.5" dir="rtl">{entity.hebrewName}</p>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2.5 mt-0.5">
        <span className={clsx(
          'flex items-center gap-1 text-[10px]',
          entity.connectionCount > 0 ? 'text-aura-accent' : 'text-aura-muted/40',
        )}>
          <Link2 size={9} />
          {entity.connectionCount} lecture{entity.connectionCount !== 1 ? 's' : ''}
        </span>
        <span className={clsx(
          'flex items-center gap-1 text-[10px]',
          entity.hasImage ? 'text-aura-success' : 'text-aura-muted/40',
        )}>
          <ImageIcon size={9} />
          {entity.hasImage ? 'has image' : 'no image'}
        </span>
        <span className="text-[10px] text-aura-muted/40 font-mono ml-auto">#{entity.id}</span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// MergeArrow — visual connector between keep and delete
// ---------------------------------------------------------------------------
function MergeArrow() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 shrink-0 px-1">
      <div className="w-px h-4 bg-gradient-to-b from-transparent to-aura-muted/30" />
      <div className="w-7 h-7 rounded-full bg-aura-indigo/10 border border-aura-indigo/20 flex items-center justify-center">
        <ArrowRight size={12} className="text-aura-indigo" />
      </div>
      <div className="w-px h-4 bg-gradient-to-b from-aura-muted/30 to-transparent" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// DuplicateCard — redesigned with clear keep/delete selection
// ---------------------------------------------------------------------------
function DuplicateCard({
  group,
  selection,
  onSelect,
  onMerge,
  onDecline,
  merging,
}: {
  group:     DuplicateGroup
  selection: MergeSelection | null
  onSelect:  (keepIdx: number, deleteIdx: number) => void
  onMerge:   () => void
  onDecline: () => void
  merging:   boolean
}) {
  const [step, setStep] = useState<'choose-keep' | 'choose-delete' | 'confirm'>('choose-keep')

  // Reset step when selection changes externally
  useEffect(() => {
    if (!selection) setStep('choose-keep')
  }, [selection])

  function handleEntityClick(idx: number) {
    if (step === 'choose-keep') {
      // First click: mark as "keep", move to choose-delete
      setStep('choose-delete')
      // Don't call onSelect yet — wait for second pick
      // Store partial selection via a local approach:
      // We'll use the parent's selection but pass keepIdx with deleteIdx=-1 as sentinel
      onSelect(idx, -1)
    } else if (step === 'choose-delete') {
      const keepIdx = selection?.keepIdx ?? -1
      if (idx === keepIdx) {
        // Clicked keep again — reset
        setStep('choose-keep')
        onSelect(-1, -1)
        return
      }
      // Second click: mark as delete, confirm
      onSelect(keepIdx, idx)
      setStep('confirm')
    } else {
      // In confirm mode: clicking any entity resets
      setStep('choose-keep')
      onSelect(-1, -1)
    }
  }

  const keepEntity   = selection && selection.keepIdx   >= 0 ? group.entities[selection.keepIdx]   : null
  const deleteEntity = selection && selection.deleteIdx >= 0 ? group.entities[selection.deleteIdx] : null
  const isReady      = !!(keepEntity && deleteEntity)

  const stepLabel = step === 'choose-keep'
    ? 'Tap the entity to KEEP →'
    : step === 'choose-delete'
    ? 'Now tap the entity to DELETE →'
    : 'Ready to merge'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={clsx(
        'rounded-2xl border overflow-hidden transition-all duration-300',
        isReady
          ? 'border-aura-indigo/30 shadow-[0_0_20px_rgba(129,140,248,0.08)]'
          : group.matchType === 'exact'
          ? 'border-aura-error/20'
          : 'border-white/[0.08]',
      )}
    >
      {/* Header */}
      <div className={clsx(
        'flex items-center justify-between px-4 py-3 border-b border-white/[0.05]',
        group.matchType === 'exact' ? 'bg-aura-error/[0.04]' : 'bg-white/[0.02]',
      )}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={clsx(
            'w-1.5 h-1.5 rounded-full shrink-0',
            group.matchType === 'exact' ? 'bg-aura-error' : 'bg-aura-warning',
          )} />
          <p className="text-sm font-semibold text-aura-text truncate">{group.name}</p>
          {group.matchType === 'similar' && (
            <span className="text-[10px] text-aura-muted bg-white/[0.05] px-1.5 py-0.5 rounded-full border border-white/[0.06] shrink-0 font-mono">
              {Math.round(group.similarity * 100)}% match
            </span>
          )}
          {group.matchType === 'exact' && (
            <span className="text-[10px] text-aura-error bg-aura-error/10 px-1.5 py-0.5 rounded-full border border-aura-error/20 shrink-0 font-bold uppercase tracking-wider">
              Exact
            </span>
          )}
        </div>
        <button
          onClick={onDecline}
          className="text-aura-muted/40 hover:text-aura-muted transition-colors shrink-0 ml-2 p-1 rounded-lg hover:bg-white/[0.05]"
          title="Not duplicates — dismiss"
        >
          <X size={13} />
        </button>
      </div>

      {/* Step instruction */}
      <div className={clsx(
        'px-4 py-2 text-[11px] font-medium flex items-center gap-2 border-b border-white/[0.04]',
        step === 'confirm' ? 'text-aura-indigo bg-aura-indigo/[0.05]' : 'text-aura-muted',
      )}>
        {step === 'confirm'
          ? <CheckCircle2 size={11} className="text-aura-indigo shrink-0" />
          : <span className="w-2 h-2 rounded-full bg-current shrink-0 opacity-60" />
        }
        {stepLabel}
      </div>

      {/* Entities grid */}
      <div className="p-3 space-y-2">
        {group.entities.length === 2 ? (
          /* Two entities: side by side with arrow */
          <div className="flex items-center gap-1">
            <div className="flex-1">
              <EntityChip
                entity={group.entities[0]}
                role={
                  selection?.keepIdx   === 0 ? 'keep'
                  : selection?.deleteIdx === 0 ? 'delete'
                  : null
                }
                selected={selection?.keepIdx === 0 || selection?.deleteIdx === 0}
                onClick={() => handleEntityClick(0)}
              />
            </div>
            <MergeArrow />
            <div className="flex-1">
              <EntityChip
                entity={group.entities[1]}
                role={
                  selection?.keepIdx   === 1 ? 'keep'
                  : selection?.deleteIdx === 1 ? 'delete'
                  : null
                }
                selected={selection?.keepIdx === 1 || selection?.deleteIdx === 1}
                onClick={() => handleEntityClick(1)}
              />
            </div>
          </div>
        ) : (
          /* 3+ entities: vertical list */
          <div className="space-y-2">
            {group.entities.map((entity, idx) => (
              <EntityChip
                key={`${entity.type}:${entity.id}`}
                entity={entity}
                role={
                  selection?.keepIdx   === idx ? 'keep'
                  : selection?.deleteIdx === idx ? 'delete'
                  : null
                }
                selected={selection?.keepIdx === idx || selection?.deleteIdx === idx}
                onClick={() => handleEntityClick(idx)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Merge summary + action */}
      <AnimatePresence>
        {isReady && keepEntity && deleteEntity && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {/* Summary bar */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-aura-indigo/[0.06] border border-aura-indigo/15">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-aura-success uppercase tracking-wider shrink-0">Keep</span>
                  <span className="text-xs text-aura-text truncate font-medium">{keepEntity.displayName}</span>
                  <span className="text-[10px] text-aura-muted shrink-0">({ENTITY_TYPES[keepEntity.type].label.replace(/s$/, '')})</span>
                </div>
                <ArrowRight size={11} className="text-aura-indigo shrink-0" />
                <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                  <span className="text-[10px] font-bold text-aura-error uppercase tracking-wider shrink-0">Delete</span>
                  <span className="text-xs text-aura-muted line-through truncate">{deleteEntity.displayName}</span>
                </div>
              </div>

              {/* Merge warnings */}
              {keepEntity.type !== deleteEntity.type && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-aura-warning/[0.05] border border-aura-warning/15">
                  <AlertTriangle size={11} className="text-aura-warning shrink-0 mt-0.5" />
                  <p className="text-[10px] text-aura-warning/80 leading-relaxed">
                    Cross-type merge: {deleteEntity.displayName}&apos;s lecture links will move to
                    the <strong>{ENTITY_TYPES[keepEntity.type].label.toLowerCase()}</strong> table.
                  </p>
                </div>
              )}
              {deleteEntity.hasImage && !keepEntity.hasImage && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-aura-accent/[0.05] border border-aura-accent/15">
                  <ImageIcon size={11} className="text-aura-accent shrink-0" />
                  <p className="text-[10px] text-aura-accent/80">
                    Image will be copied from deleted entity to kept entity.
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setStep('choose-keep'); onSelect(-1, -1) }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-aura-muted
                             border border-white/[0.07] hover:bg-white/[0.04] transition-colors"
                >
                  <RotateCcw size={11} /> Reset
                </button>
                <button
                  onClick={onMerge}
                  disabled={merging}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold',
                    'bg-gradient-to-r from-aura-indigo to-aura-accent text-white',
                    'shadow-[0_0_16px_rgba(129,140,248,0.25)] hover:opacity-90',
                    'transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed',
                  )}
                >
                  {merging
                    ? <><Loader2 size={12} className="animate-spin" /> Merging…</>
                    : <><GitMerge size={12} /> Merge &amp; Delete</>
                  }
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------
function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1 pt-2">
      <div className={clsx('w-1.5 h-1.5 rounded-full shrink-0', color)} />
      <p className="text-xs font-bold text-aura-text uppercase tracking-wider">{label}</p>
      <span className={clsx(
        'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
        color === 'bg-aura-error'
          ? 'text-aura-error bg-aura-error/10 border-aura-error/20'
          : 'text-aura-warning bg-aura-warning/10 border-aura-warning/20',
      )}>
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
  t => !['courses'].includes(t),
) as EntityType[]

interface EntitySearchResult {
  id:          number
  displayName: string
  type:        EntityType
}

function CustomMergePanel({ onMerged }: { onMerged: () => void }) {
  const { success, error: toastError } = useToast()

  const [keepType,      setKeepType]      = useState<EntityType>('directors')
  const [deleteType,    setDeleteType]    = useState<EntityType>('directors')
  const [keepQuery,     setKeepQuery]     = useState('')
  const [deleteQuery,   setDeleteQuery]   = useState('')
  const [keepResults,   setKeepResults]   = useState<EntitySearchResult[]>([])
  const [deleteResults, setDeleteResults] = useState<EntitySearchResult[]>([])
  const [keepEntity,    setKeepEntity]    = useState<EntitySearchResult | null>(null)
  const [deleteEntity,  setDeleteEntity]  = useState<EntitySearchResult | null>(null)
  const [merging,       setMerging]       = useState(false)
  const [open,          setOpen]          = useState(false)

  async function searchEntities(type: EntityType, query: string): Promise<EntitySearchResult[]> {
    if (!query.trim()) return []
    const res  = await fetch(`/api/entities/${type}?all=true&search=${encodeURIComponent(query)}`)
    const data = await res.json()
    return (data.entities ?? []).map((e: { id: number; displayName: string }) => ({
      id: e.id, displayName: e.displayName, type,
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

      const fakeSig = `custom:${keepEntity.type}:${keepEntity.id}:${deleteEntity.type}:${deleteEntity.id}`
      await saveHistoryEntry(fakeSig, 'approved', keepEntity.type)

      success('Merged', `"${deleteEntity.displayName}" merged into "${keepEntity.displayName}".`)
      setKeepEntity(null); setDeleteEntity(null)
      setKeepQuery('');    setDeleteQuery('')
      setKeepResults([]);  setDeleteResults([])
      onMerged()
    } catch (e) {
      toastError('Merge failed', e instanceof Error ? e.message : String(e))
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-white/[0.01]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-aura-indigo/10 border border-aura-indigo/20 flex items-center justify-center shrink-0">
            <Plus size={12} className="text-aura-indigo" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-aura-text">Manual Merge</p>
            <p className="text-[10px] text-aura-muted">Merge any two entities across any category</p>
          </div>
        </div>
        <ChevronDown
          size={13}
          className={clsx('text-aura-muted transition-transform duration-200 shrink-0', open && 'rotate-180')}
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
            <div className="px-4 pb-4 space-y-4 border-t border-white/[0.05]">
              {/* Two-column picker */}
              <div className="grid grid-cols-2 gap-3 pt-4">
                <EntityPicker
                  label="KEEP"
                  labelColor="text-aura-success"
                  borderColor="border-aura-success/20"
                  bgColor="bg-aura-success/[0.03]"
                  type={keepType}
                  onTypeChange={t => { setKeepType(t); setKeepEntity(null); setKeepQuery('') }}
                  query={keepQuery}
                  onQueryChange={setKeepQuery}
                  results={keepResults}
                  selected={keepEntity}
                  onSelect={setKeepEntity}
                />
                <EntityPicker
                  label="DELETE"
                  labelColor="text-aura-error"
                  borderColor="border-aura-error/20"
                  bgColor="bg-aura-error/[0.03]"
                  type={deleteType}
                  onTypeChange={t => { setDeleteType(t); setDeleteEntity(null); setDeleteQuery('') }}
                  query={deleteQuery}
                  onQueryChange={setDeleteQuery}
                  results={deleteResults}
                  selected={deleteEntity}
                  onSelect={setDeleteEntity}
                />
              </div>

              {/* Preview row */}
              {keepEntity && deleteEntity && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-aura-indigo/[0.06] border border-aura-indigo/15"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-aura-success font-bold uppercase tracking-wider mb-0.5">Keep</p>
                    <p className="text-xs text-aura-text font-medium truncate">{keepEntity.displayName}</p>
                    <p className="text-[10px] text-aura-muted">{ENTITY_TYPES[keepEntity.type].label}</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <GitMerge size={14} className="text-aura-indigo" />
                    <ArrowRight size={10} className="text-aura-indigo/50" />
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-[10px] text-aura-error font-bold uppercase tracking-wider mb-0.5">Delete</p>
                    <p className="text-xs text-aura-muted line-through truncate">{deleteEntity.displayName}</p>
                    <p className="text-[10px] text-aura-muted">{ENTITY_TYPES[deleteEntity.type].label}</p>
                  </div>
                </motion.div>
              )}

              <button
                onClick={handleCustomMerge}
                disabled={!keepEntity || !deleteEntity || merging}
                className={clsx(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold',
                  'bg-gradient-to-r from-aura-indigo to-aura-accent text-white',
                  'shadow-[0_0_16px_rgba(129,140,248,0.2)] hover:opacity-90 transition-opacity',
                  'disabled:opacity-30 disabled:cursor-not-allowed',
                )}
              >
                {merging
                  ? <><Loader2 size={13} className="animate-spin" /> Merging…</>
                  : <><GitMerge size={13} /> Merge & Delete</>
                }
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Small entity picker sub-component
function EntityPicker({
  label, labelColor, borderColor, bgColor,
  type, onTypeChange,
  query, onQueryChange,
  results, selected, onSelect,
}: {
  label:         string
  labelColor:    string
  borderColor:   string
  bgColor:       string
  type:          EntityType
  onTypeChange:  (t: EntityType) => void
  query:         string
  onQueryChange: (q: string) => void
  results:       EntitySearchResult[]
  selected:      EntitySearchResult | null
  onSelect:      (e: EntitySearchResult | null) => void
}) {
  return (
    <div className={clsx('rounded-xl border p-3 space-y-2', borderColor, bgColor)}>
      <p className={clsx('text-[10px] font-black uppercase tracking-widest', labelColor)}>{label}</p>

      <select
        value={type}
        onChange={e => onTypeChange(e.target.value as EntityType)}
        className="w-full appearance-none bg-black/30 border border-white/[0.08] rounded-lg
                   px-2 py-1.5 text-xs text-aura-text focus:outline-none focus:border-aura-accent/40"
      >
        {MERGEABLE_TYPES.map(t => (
          <option key={t} value={t}>{ENTITY_TYPES[t].icon} {ENTITY_TYPES[t].label}</option>
        ))}
      </select>

      <div className="relative">
        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
        <input
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Search…"
          className="w-full pl-7 pr-2.5 py-1.5 rounded-lg bg-black/20 border border-white/[0.08]
                     text-xs text-aura-text placeholder-aura-muted/50
                     focus:outline-none focus:border-aura-accent/40 transition-colors"
        />
      </div>

      {selected ? (
        <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-black/20 border border-white/[0.10]">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-aura-text font-medium truncate">{selected.displayName}</p>
            <p className="text-[10px] text-aura-muted">{ENTITY_TYPES[selected.type].label}</p>
          </div>
          <button
            onClick={() => { onSelect(null); onQueryChange('') }}
            className="text-aura-muted/60 hover:text-aura-muted ml-1.5 shrink-0"
          >
            <X size={10} />
          </button>
        </div>
      ) : results.length > 0 ? (
        <div className="rounded-lg border border-white/[0.07] overflow-hidden max-h-28 overflow-y-auto">
          {results.slice(0, 6).map(e => (
            <button
              key={e.id}
              onClick={() => { onSelect(e); onQueryChange(e.displayName) }}
              className="w-full text-left px-2.5 py-1.5 text-xs text-aura-text hover:bg-white/[0.05] transition-colors truncate border-b border-white/[0.03] last:border-0"
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

  const [exact,       setExact]       = useState<DuplicateGroup[]>([])
  const [similar,     setSimilar]     = useState<DuplicateGroup[]>([])
  const [loading,     setLoading]     = useState(false)
  const [selections,  setSelections]  = useState<Record<string, MergeSelection>>({})
  const [merging,     setMerging]     = useState<string | null>(null)
  const [hasHistory,  setHasHistory]  = useState(false)

  function setSelection(key: string, keepIdx: number, deleteIdx: number) {
    if (keepIdx < 0) {
      setSelections(prev => { const n = { ...prev }; delete n[key]; return n })
    } else {
      setSelections(prev => ({ ...prev, [key]: { keepIdx, deleteIdx } }))
    }
  }

  const doMerge = useCallback(async (
    section:  'exact' | 'similar',
    group:    DuplicateGroup,
    sel:      MergeSelection,
  ): Promise<boolean> => {
    const key        = groupKey(section, group)
    const keepEntity = group.entities[sel.keepIdx]
    const delEntity  = group.entities[sel.deleteIdx]

    setMerging(key)
    try {
      const res = await fetch('/api/entities/merge', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keepId:     keepEntity.id,
          keepType:   keepEntity.type,
          deleteId:   delEntity.id,
          deleteType: delEntity.type,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Merge failed')
      }

      await saveHistoryEntry(groupSig(group), 'approved', keepEntity.type)
      setHasHistory(true)

      const remove = (prev: DuplicateGroup[]) => prev.filter(g => groupKey(section, g) !== key)
      if (section === 'exact') setExact(remove)
      else setSimilar(remove)
      setSelections(prev => { const n = { ...prev }; delete n[key]; return n })

      return true
    } catch (e: unknown) {
      toastError('Merge failed', e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setMerging(null)
    }
  }, [toastError])

  const handleMerge = useCallback(async (section: 'exact' | 'similar', group: DuplicateGroup) => {
    const key = groupKey(section, group)
    const sel = selections[key]
    if (!sel || sel.deleteIdx < 0) return

    const keepEntity = group.entities[sel.keepIdx]
    const delEntity  = group.entities[sel.deleteIdx]
    const ok = await doMerge(section, group, sel)
    if (ok) {
      success('Merged!', `"${delEntity.displayName}" → "${keepEntity.displayName}" (${ENTITY_TYPES[keepEntity.type].label.replace(/s$/, '')})`)
    }
  }, [selections, doMerge, success])

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
    success('Reset', 'Merge history cleared.')
  }, [success])

  const fetchDuplicates = useCallback(async () => {
    setLoading(true)
    setSelections({})
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
          // Auto-merge: pick first non-keep entity as delete target
          const deleteIdx = group.entities.findIndex((_, i) => i !== keepIdx)
          if (deleteIdx !== -1) {
            const ok = await doMerge(section, group, { keepIdx, deleteIdx })
            if (ok) autoCount++
          }
        }
      }
      if (autoCount > 0) {
        success('Auto-merged', `${autoCount} previously approved merge${autoCount > 1 ? 's' : ''} applied.`)
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

      {/* Header */}
      <div className="glass rounded-2xl p-4 border border-white/[0.07]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GitMerge size={15} className="text-aura-indigo" />
              <h2 className="text-sm font-bold text-aura-text">Merge Entities</h2>
            </div>
            <p className="text-xs text-aura-muted leading-relaxed">
              {loading
                ? 'Scanning all entity types for duplicates…'
                : totalCount > 0
                ? <>
                    Found <span className="text-aura-error font-semibold">{exact.length}</span> exact
                    {' '}and <span className="text-aura-warning font-semibold">{similar.length}</span> similar matches.
                    <br />
                    Tap <strong>Keep</strong> first, then <strong>Delete</strong> to merge.
                  </>
                : 'No duplicates or similar names found across all entity types.'
              }
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasHistory && (
              <button
                onClick={resetHistory}
                title="Reset merge history"
                className="flex items-center gap-1 text-[10px] text-aura-muted/60 hover:text-aura-muted
                           border border-white/[0.05] hover:border-white/[0.10] rounded-lg px-2 py-1.5 transition-colors"
              >
                <Trash2 size={10} /> History
              </button>
            )}
            <button
              onClick={fetchDuplicates}
              disabled={loading}
              className="text-aura-muted disabled:opacity-40 p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Legend */}
        {totalCount > 0 && !loading && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/[0.05]">
            <div className="flex items-center gap-1.5 text-[10px] text-aura-muted">
              <Shield size={10} className="text-aura-success" />
              Tap first = <span className="text-aura-success font-semibold">KEEP</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-aura-muted">
              <X size={10} className="text-aura-error" />
              Tap second = <span className="text-aura-error font-semibold">DELETE</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-aura-muted ml-auto">
              <ArrowRight size={10} className="text-aura-indigo" />
              Links transfer to kept entity
            </div>
          </div>
        )}
      </div>

      {/* Manual merge panel */}
      <CustomMergePanel onMerged={fetchDuplicates} />

      {/* Duplicate list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-14">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-aura-indigo/20 border-t-aura-indigo animate-spin" />
          </div>
          <p className="text-sm text-aura-muted">Scanning all entity types…</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exact.length > 0 && (
            <>
              <SectionHeader label="Exact Duplicates" count={exact.length} color="bg-aura-error" />
              <AnimatePresence mode="popLayout">
                {exact.map(group => {
                  const key = groupKey('exact', group)
                  return (
                    <DuplicateCard
                      key={key}
                      group={group}
                      selection={selections[key] ?? null}
                      onSelect={(keepIdx, deleteIdx) => setSelection(key, keepIdx, deleteIdx)}
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
              <SectionHeader label="Similar Names" count={similar.length} color="bg-aura-warning" />
              <AnimatePresence mode="popLayout">
                {similar.map(group => {
                  const key = groupKey('similar', group)
                  return (
                    <DuplicateCard
                      key={key}
                      group={group}
                      selection={selections[key] ?? null}
                      onSelect={(keepIdx, deleteIdx) => setSelection(key, keepIdx, deleteIdx)}
                      onMerge={() => handleMerge('similar', group)}
                      onDecline={() => handleDecline('similar', group)}
                      merging={merging === key}
                    />
                  )
                })}
              </AnimatePresence>
            </>
          )}

          {!loading && totalCount === 0 && (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-aura-success/10 border border-aura-success/20 flex items-center justify-center">
                <CheckCircle2 size={22} className="text-aura-success" />
              </div>
              <div>
                <p className="text-sm font-semibold text-aura-text">All clean!</p>
                <p className="text-xs text-aura-muted mt-1">No duplicate or similar entities detected.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}