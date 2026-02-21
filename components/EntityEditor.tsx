'use client'

import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Trash2, Check, X, Loader2, RefreshCw, Search, AlertTriangle } from 'lucide-react'
import { Entity, EntityType, ENTITY_TYPES, JUNCTION_MAP } from '@/lib/constants'
import { EntitySelector } from './EntitySelector'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Edit modal — bottom sheet on phone
// ---------------------------------------------------------------------------
function EditModal({
  entity,
  entityType,
  onSave,
  onCancel,
}: {
  entity:     Entity
  entityType: EntityType
  onSave:     (updated: Partial<Entity>) => void
  onCancel:   () => void
}) {
  const [name,        setName]        = useState(entity.displayName ?? '')
  const [hebrewName,  setHebrewName]  = useState(entity.hebrewName ?? '')
  const [description, setDescription] = useState(entity.description ?? '')
  const [saving,      setSaving]      = useState(false)
  const { error: toastError } = useToast()

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/entities/${entityType}/${entity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        name.trim(),
          hebrewName:  hebrewName.trim() || null,
          description: description.trim() || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Save failed')
      }
      onSave({ displayName: name.trim(), hebrewName: hebrewName.trim() || null, description: description.trim() || null })
    } catch (e: unknown) {
      toastError('Save failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col justify-end"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative glass rounded-t-3xl border-t border-x border-white/[0.10] p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto -mt-1 mb-2" />

        {/* Title row */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-aura-text">Edit entity</p>
            <p className="text-xs text-aura-muted mt-0.5 truncate max-w-[220px]">
              #{entity.id} · {entity.displayName}
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            className="p-2 rounded-xl bg-white/[0.04] text-aura-muted disabled:opacity-40"
          >
            <X size={15} />
          </button>
        </div>

        {/* Name */}
        <div>
          <p className="text-xs text-aura-muted mb-1.5">Name</p>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl px-3 py-2.5
                       text-sm text-aura-text outline-none focus:border-aura-accent/50"
          />
        </div>

        {/* Hebrew name */}
        <div>
          <p className="text-xs text-aura-muted mb-1.5">Hebrew name</p>
          <input
            value={hebrewName}
            onChange={e => setHebrewName(e.target.value)}
            placeholder="—"
            dir="rtl"
            className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl px-3 py-2.5
                       text-sm text-aura-text outline-none focus:border-aura-accent/50 font-hebrew"
          />
        </div>

        {/* Description */}
        <div>
          <p className="text-xs text-aura-muted mb-1.5">Description</p>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="—"
            rows={3}
            dir="rtl"
            className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl px-3 py-2.5
                       text-sm text-aura-text outline-none focus:border-aura-accent/50
                       font-hebrew resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-3 rounded-xl border border-white/[0.08] text-aura-muted
                       text-sm font-medium disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl
                       bg-aura-accent/10 border border-aura-accent/20 text-aura-accent
                       text-sm font-semibold disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------
function DeleteConfirm({
  entity,
  entityType,
  onConfirm,
  onCancel,
  deleting,
}: {
  entity:     Entity
  entityType: EntityType
  onConfirm:  () => void
  onCancel:   () => void
  deleting:   boolean
}) {
  const hasJunction = entityType in JUNCTION_MAP

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
            <p className="font-semibold text-aura-text text-sm">Delete entity?</p>
            <p className="text-xs text-aura-muted mt-0.5 truncate max-w-[200px]">
              {entity.displayName}
            </p>
          </div>
        </div>

        {hasJunction && (
          <p className="text-xs text-aura-muted mb-4 leading-relaxed">
            This will also unlink this entity from all lectures (the lectures themselves are NOT deleted).
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-aura-error/10 text-aura-error border border-aura-error/20
                       text-sm font-medium disabled:opacity-40"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
          <button
            onClick={onCancel}
            disabled={deleting}
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
// Entity card row
// ---------------------------------------------------------------------------
function EntityCard({
  entity,
  onEdit,
  onDelete,
}: {
  entity:   Entity
  onEdit:   () => void
  onDelete: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]
                 active:bg-white/[0.03] transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-aura-text truncate">{entity.displayName}</p>
        {entity.hebrewName
          ? <p className="text-xs text-aura-muted font-hebrew truncate mt-0.5" dir="rtl">{entity.hebrewName}</p>
          : <p className="text-xs text-aura-muted/30 mt-0.5">—</p>
        }
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-2 rounded-xl hover:bg-aura-accent/10 text-aura-muted hover:text-aura-accent transition-colors"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-xl hover:bg-aura-error/10 text-aura-muted hover:text-aura-error transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main EntityEditor
// ---------------------------------------------------------------------------
export function EntityEditor() {
  const { success, error: toastError } = useToast()

  const [entityType,    setEntityType]    = useState<EntityType | null>(null)
  const [entities,      setEntities]      = useState<Entity[]>([])
  const [loading,       setLoading]       = useState(false)
  const [query,         setQuery]         = useState('')
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<Entity | null>(null)
  const [deleting,      setDeleting]      = useState(false)

  const fetchEntities = useCallback(async (type: EntityType) => {
    setLoading(true)
    setEntities([])
    setEditingEntity(null)
    setQuery('')
    try {
      const res  = await fetch(`/api/entities/${type}?all=true`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setEntities(data.entities ?? [])
    } catch (e: unknown) {
      toastError('Load failed', e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [toastError])

  function handleTypeChange(type: EntityType) {
    setEntityType(type)
    fetchEntities(type)
  }

  function handleSaved(id: number, updated: Partial<Entity>) {
    setEntities(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e))
    setEditingEntity(null)
    success('Saved', 'Entity updated successfully.')
  }

  async function handleDelete() {
    if (!deleteTarget || !entityType) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/entities/${entityType}/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Delete failed')
      }
      setEntities(prev => prev.filter(e => e.id !== deleteTarget.id))
      success('Deleted', `"${deleteTarget.displayName}" removed.`)
    } catch (e: unknown) {
      toastError('Delete failed', e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const filtered = entities.filter(e => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      e.displayName.toLowerCase().includes(q) ||
      (e.hebrewName ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">

      {/* Category selector */}
      <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-aura-text">Select category</p>
          {entityType && !loading && (
            <button
              onClick={() => fetchEntities(entityType)}
              className="text-aura-muted"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>
        <EntitySelector selected={entityType} onChange={handleTypeChange} />
      </div>

      {/* Entity list */}
      <AnimatePresence>
        {entityType && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl border border-white/[0.07] overflow-hidden"
          >
            {/* Search bar */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white/[0.04] rounded-xl px-3 py-2 flex-1">
                <Search size={13} className="text-aura-muted shrink-0" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="flex-1 bg-transparent text-sm text-aura-text
                             placeholder:text-aura-muted outline-none"
                />
              </div>
              <span className="text-xs text-aura-muted shrink-0">
                {loading ? '…' : `${filtered.length}/${entities.length}`}
              </span>
            </div>

            {/* List body */}
            {loading ? (
              <div className="flex items-center justify-center py-14 gap-2 text-aura-muted">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-aura-muted text-sm py-14">No records found</p>
            ) : (
              <div>
                {filtered.map(entity => (
                  <EntityCard
                    key={entity.id}
                    entity={entity}
                    onEdit={() => setEditingEntity(entity)}
                    onDelete={() => setDeleteTarget(entity)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit modal (bottom sheet) */}
      <AnimatePresence>
        {editingEntity && entityType && (
          <EditModal
            entity={editingEntity}
            entityType={entityType}
            onSave={(updated) => handleSaved(editingEntity.id, updated)}
            onCancel={() => setEditingEntity(null)}
          />
        )}
      </AnimatePresence>

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteTarget && entityType && (
          <DeleteConfirm
            entity={deleteTarget}
            entityType={entityType}
            onConfirm={handleDelete}
            onCancel={() => !deleting && setDeleteTarget(null)}
            deleting={deleting}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
