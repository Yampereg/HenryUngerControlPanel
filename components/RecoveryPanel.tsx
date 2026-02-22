'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, Trash2, Loader2, ImageIcon, Link2, AlertTriangle, X } from 'lucide-react'
import { ENTITY_TYPES, EntityType } from '@/lib/constants'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DeletedEntity {
  id:            number
  original_id:   number
  entity_type:   EntityType
  name:          string
  hebrew_name:   string | null
  has_image:     boolean
  junction_data: Record<string, unknown>[]
  deleted_at:    string
}

// ---------------------------------------------------------------------------
// Discard confirmation modal
// ---------------------------------------------------------------------------
function DiscardConfirm({
  entity,
  onConfirm,
  onCancel,
  loading,
}: {
  entity:   DeletedEntity
  onConfirm: () => void
  onCancel:  () => void
  loading:   boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative glass rounded-2xl p-5 border border-aura-error/30
                   shadow-[0_0_40px_rgba(248,113,113,0.15)] w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-aura-error/10 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-aura-error" />
          </div>
          <div>
            <p className="font-semibold text-aura-text text-sm">Permanently discard?</p>
            <p className="text-xs text-aura-muted mt-0.5 truncate max-w-[200px]">{entity.name}</p>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="ml-auto p-1.5 rounded-lg bg-white/[0.04] text-aura-muted disabled:opacity-40"
          >
            <X size={13} />
          </button>
        </div>

        <p className="text-xs text-aura-muted mb-4 leading-relaxed">
          This will permanently delete the backup. The entity cannot be recovered after this.
        </p>

        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-aura-error/10 text-aura-error border border-aura-error/20
                       text-sm font-medium disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Discard
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl glass border border-white/[0.08]
                       text-aura-muted text-sm disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Single deleted entity card
// ---------------------------------------------------------------------------
function DeletedCard({
  entity,
  onRestore,
  onDiscard,
  restoring,
}: {
  entity:    DeletedEntity
  onRestore: () => void
  onDiscard: () => void
  restoring: boolean
}) {
  const cfg         = ENTITY_TYPES[entity.entity_type]
  const lectureCount = entity.junction_data?.length ?? 0
  const date         = new Date(entity.deleted_at).toLocaleDateString('en-GB', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  })

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex items-start gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0"
    >
      {/* Type icon */}
      <span className="text-lg leading-none mt-0.5 shrink-0">{cfg?.icon ?? '?'}</span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-aura-text truncate">{entity.name}</p>
        {entity.hebrew_name && (
          <p className="text-xs text-aura-muted font-hebrew truncate mt-0.5" dir="rtl">
            {entity.hebrew_name}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] text-aura-muted">{cfg?.label}</span>
          {lectureCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-aura-muted">
              <Link2 size={9} />
              {lectureCount} lecture{lectureCount !== 1 ? 's' : ''}
            </span>
          )}
          {entity.has_image && (
            <span className="flex items-center gap-1 text-[10px] text-aura-success">
              <ImageIcon size={9} />
              image
            </span>
          )}
          <span className="text-[10px] text-aura-muted/60 ml-auto">{date}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 mt-0.5">
        <button
          onClick={onRestore}
          disabled={restoring}
          title="Restore"
          className="p-2 rounded-xl hover:bg-aura-success/10 text-aura-muted hover:text-aura-success
                     transition-colors disabled:opacity-40"
        >
          {restoring
            ? <Loader2 size={14} className="animate-spin" />
            : <RotateCcw size={14} />
          }
        </button>
        <button
          onClick={onDiscard}
          disabled={restoring}
          title="Discard permanently"
          className="p-2 rounded-xl hover:bg-aura-error/10 text-aura-muted hover:text-aura-error
                     transition-colors disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main RecoveryPanel
// ---------------------------------------------------------------------------
export function RecoveryPanel() {
  const { success, error: toastError } = useToast()

  const [deleted,       setDeleted]       = useState<DeletedEntity[]>([])
  const [loading,       setLoading]       = useState(false)
  const [filterType,    setFilterType]    = useState<EntityType | null>(null)
  const [restoringId,   setRestoringId]   = useState<number | null>(null)
  const [discardTarget, setDiscardTarget] = useState<DeletedEntity | null>(null)
  const [discarding,    setDiscarding]    = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch('/api/entities/deleted')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setDeleted(data.deleted ?? [])
    } catch (e) {
      toastError('Load failed', e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRestore(entity: DeletedEntity) {
    setRestoringId(entity.id)
    try {
      const res  = await fetch('/api/entities/restore', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ deletedId: entity.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Restore failed')

      setDeleted(prev => prev.filter(e => e.id !== entity.id))
      success('Restored', `"${entity.name}" has been restored as a ${ENTITY_TYPES[entity.entity_type]?.label.toLowerCase().replace(/s$/, '')}.`)
    } catch (e) {
      toastError('Restore failed', e instanceof Error ? e.message : String(e))
    } finally {
      setRestoringId(null)
    }
  }

  async function handleDiscard() {
    if (!discardTarget) return
    setDiscarding(true)
    try {
      const res = await fetch(`/api/entities/deleted/${discardTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Discard failed')
      }
      setDeleted(prev => prev.filter(e => e.id !== discardTarget.id))
      success('Discarded', `"${discardTarget.name}" permanently removed from backup.`)
    } catch (e) {
      toastError('Discard failed', e instanceof Error ? e.message : String(e))
    } finally {
      setDiscarding(false)
      setDiscardTarget(null)
    }
  }

  // Unique types present in the backup list
  const presentTypes = Array.from(new Set(deleted.map(e => e.entity_type))) as EntityType[]

  const filtered = filterType
    ? deleted.filter(e => e.entity_type === filterType)
    : deleted

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-aura-text">Deleted entities</p>
            <p className="text-xs text-aura-muted mt-0.5">
              {loading ? '…' : `${deleted.length} backup${deleted.length !== 1 ? 's' : ''} stored`}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="text-aura-muted disabled:opacity-40"
            title="Refresh"
          >
            <RotateCcw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Type filter pills */}
        {presentTypes.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterType(null)}
              className={clsx(
                'px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-150',
                filterType === null
                  ? 'bg-aura-accent/10 text-aura-accent border-aura-accent/20'
                  : 'text-aura-muted border-white/[0.07] hover:border-white/[0.14] hover:text-aura-text',
              )}
            >
              All
            </button>
            {presentTypes.map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={clsx(
                  'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-150',
                  filterType === t
                    ? 'bg-aura-accent/10 text-aura-accent border-aura-accent/20'
                    : 'text-aura-muted border-white/[0.07] hover:border-white/[0.14] hover:text-aura-text',
                )}
              >
                <span>{ENTITY_TYPES[t]?.icon}</span>
                {ENTITY_TYPES[t]?.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="glass rounded-2xl border border-white/[0.07] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-14 gap-2 text-aura-muted">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-aura-muted text-sm py-14">
            {deleted.length === 0 ? 'No deleted entities' : 'No results for this filter'}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map(entity => (
              <DeletedCard
                key={entity.id}
                entity={entity}
                restoring={restoringId === entity.id}
                onRestore={() => handleRestore(entity)}
                onDiscard={() => setDiscardTarget(entity)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Discard confirm modal */}
      <AnimatePresence>
        {discardTarget && (
          <DiscardConfirm
            entity={discardTarget}
            onConfirm={handleDiscard}
            onCancel={() => !discarding && setDiscardTarget(null)}
            loading={discarding}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
