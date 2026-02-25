'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle, Check, ChevronUp, Loader2,
  Pencil, RefreshCw, Search, Trash2, X, Plus,
} from 'lucide-react'
import { Entity, EntityType, ENTITY_TYPES, JUNCTION_MAP } from '@/lib/constants'
import { EntitySelector } from './EntitySelector'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

type EditSection = 'entities' | 'courses' | 'lectures'

// ===========================================================================
// Shared sub-components
// ===========================================================================

// ---------------------------------------------------------------------------
// Tag chip
// ---------------------------------------------------------------------------
function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                     bg-aura-accent/10 text-aura-accent border border-aura-accent/20 text-xs font-mono">
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 text-aura-accent/60 hover:text-aura-accent transition-colors"
        aria-label="Remove"
      >
        <X size={10} />
      </button>
    </span>
  )
}

// ---------------------------------------------------------------------------
// TagInput — text input that appends a value on Enter or comma
// ---------------------------------------------------------------------------
function TagInput({
  values,
  onChange,
  placeholder,
  validate,
}: {
  values:      string[]
  onChange:    (v: string[]) => void
  placeholder: string
  validate?:   (v: string) => boolean
}) {
  const [input, setInput] = useState('')

  function commit() {
    const v = input.trim()
    if (!v) return
    if (validate && !validate(v)) return
    if (!values.includes(v)) onChange([...values, v])
    setInput('')
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
    if (e.key === 'Backspace' && !input && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center p-2 rounded-xl
                    bg-white/[0.04] border border-white/[0.08] min-h-[40px]
                    focus-within:border-aura-accent/40 transition-colors">
      {values.map(v => (
        <Tag key={v} label={v} onRemove={() => onChange(values.filter(x => x !== v))} />
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={commit}
        placeholder={values.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] bg-transparent text-xs text-aura-text
                   placeholder-aura-muted/50 outline-none"
      />
    </div>
  )
}

// ===========================================================================
// ENTITIES section sub-components
// ===========================================================================

// ---------------------------------------------------------------------------
// Edit modal — bottom sheet
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
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto -mt-1 mb-2" />
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
        <div>
          <p className="text-xs text-aura-muted mb-1.5">Name</p>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl px-3 py-2.5
                       text-sm text-aura-text outline-none focus:border-aura-accent/50"
          />
        </div>
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

// ===========================================================================
// Section components
// ===========================================================================

// ---------------------------------------------------------------------------
// EntitiesSection (was EntityEditor)
// ---------------------------------------------------------------------------
function EntitiesSection() {
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
      <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-aura-text">Select category</p>
          {entityType && !loading && (
            <button onClick={() => fetchEntities(entityType)} className="text-aura-muted" title="Refresh">
              <RefreshCw size={14} />
            </button>
          )}
        </div>
        <EntitySelector selected={entityType} onChange={handleTypeChange} />
      </div>

      <AnimatePresence>
        {entityType && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl border border-white/[0.07] overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white/[0.04] rounded-xl px-3 py-2 flex-1">
                <Search size={13} className="text-aura-muted shrink-0" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="flex-1 bg-transparent text-sm text-aura-text placeholder:text-aura-muted outline-none"
                />
              </div>
              <span className="text-xs text-aura-muted shrink-0">
                {loading ? '…' : `${filtered.length}/${entities.length}`}
              </span>
            </div>
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

// ---------------------------------------------------------------------------
// CoursesSection (was CourseEditor)
// ---------------------------------------------------------------------------
interface CourseItem  { id: number; title: string; subjectId: number | null }
interface SubjectItem { id: number; nameEn: string; nameHe: string }

function CoursesSection() {
  const { success, error: toastError } = useToast()

  const [courses,       setCourses]       = useState<CourseItem[]>([])
  const [subjects,      setSubjects]      = useState<SubjectItem[]>([])
  const [loading,       setLoading]       = useState(true)
  const [editId,        setEditId]        = useState<number | null>(null)
  const [editTitle,     setEditTitle]     = useState('')
  const [editSubjectId, setEditSubjectId] = useState<number | null>(null)
  const [saving,        setSaving]        = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [coursesRes, subjectsRes] = await Promise.all([
        fetch('/api/courses'),
        fetch('/api/subjects'),
      ])
      const coursesData  = await coursesRes.json()
      const subjectsData = await subjectsRes.json()
      setCourses(
        ((coursesData.courses ?? []) as { id: number; title: string; subject_id: number | null }[]).map(c => ({
          id: c.id, title: c.title, subjectId: c.subject_id,
        })),
      )
      setSubjects(
        ((subjectsData.subjects ?? []) as { id: number; name_en: string; name_he: string }[]).map(s => ({
          id: s.id, nameEn: s.name_en, nameHe: s.name_he,
        })),
      )
    } catch {
      toastError('Load failed', 'Could not load courses')
    } finally {
      setLoading(false)
    }
  }, [toastError])

  useEffect(() => { load() }, [load])

  function openEdit(course: CourseItem) {
    setEditId(course.id)
    setEditTitle(course.title)
    setEditSubjectId(course.subjectId)
  }

  function closeEdit() { setEditId(null) }

  async function handleSave() {
    if (editId === null || !editTitle.trim()) return
    setSaving(true)
    try {
      const res  = await fetch(`/api/courses/${editId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: editTitle.trim(), subjectId: editSubjectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCourses(prev =>
        prev.map(c => c.id === editId ? { ...c, title: editTitle.trim(), subjectId: editSubjectId } : c),
      )
      success('Saved', 'Course updated.')
      closeEdit()
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="glass rounded-2xl p-8 border border-white/[0.07] flex justify-center">
        <Loader2 size={20} className="animate-spin text-aura-muted" />
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl border border-white/[0.07] overflow-hidden">
      <div className="divide-y divide-white/[0.03]">
        {courses.map(course => {
          const subject = subjects.find(s => s.id === course.subjectId)
          const isOpen  = editId === course.id

          return (
            <div key={course.id}>
              <button
                onClick={() => isOpen ? closeEdit() : openEdit(course)}
                className="w-full flex items-center justify-between px-4 py-3
                           hover:bg-white/[0.02] transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm text-aura-text truncate">{course.title}</p>
                  {subject && (
                    <p className="text-[10px] text-aura-muted mt-0.5">{subject.nameHe}</p>
                  )}
                </div>
                {isOpen
                  ? <ChevronUp size={13} className="text-aura-muted shrink-0 ml-2" />
                  : <Pencil    size={11} className="text-aura-muted shrink-0 ml-2" />
                }
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3 bg-white/[0.02]">
                      <div>
                        <label className="block text-[10px] text-aura-muted uppercase tracking-wider mb-1">
                          Title
                        </label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]
                                     text-sm text-aura-text placeholder-aura-muted/50
                                     focus:outline-none focus:border-aura-accent/40 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-aura-muted uppercase tracking-wider mb-1">
                          Subject
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => setEditSubjectId(null)}
                            className={clsx(
                              'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150',
                              editSubjectId === null
                                ? 'bg-white/[0.08] text-aura-text border-white/[0.14]'
                                : 'text-aura-muted border-white/[0.06] hover:border-white/[0.12]',
                            )}
                          >
                            None
                          </button>
                          {subjects.map(s => (
                            <button
                              key={s.id}
                              onClick={() => setEditSubjectId(s.id)}
                              className={clsx(
                                'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150',
                                editSubjectId === s.id
                                  ? 'bg-aura-accent/10 text-aura-accent border-aura-accent/20'
                                  : 'text-aura-muted border-white/[0.06] hover:border-white/[0.12] hover:text-aura-text',
                              )}
                            >
                              {s.nameHe}
                              <span className="ml-1 opacity-50 text-[10px]">{s.nameEn}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={handleSave}
                        disabled={saving || !editTitle.trim()}
                        className={clsx(
                          'w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2',
                          'bg-gradient-to-r from-aura-accent to-aura-indigo text-aura-base',
                          'hover:opacity-90 active:scale-[0.98] transition-all duration-200',
                          'disabled:opacity-40 disabled:cursor-not-allowed',
                        )}
                      >
                        {saving
                          ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
                          : <><Check size={12} /> Save Changes</>
                        }
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LecturesSection (was LectureMetaEditor)
// ---------------------------------------------------------------------------
interface CourseOpt   { id: number; title: string }
interface LectureOpt  { id: number; title: string; orderInCourse: number }

function LecturesSection() {
  const { success, error: toastError } = useToast()

  const [courses,        setCourses]        = useState<CourseOpt[]>([])
  const [lectures,       setLectures]       = useState<LectureOpt[]>([])
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null)
  const [selectedLec,    setSelectedLec]    = useState<number | null>(null)

  const [date,    setDate]    = useState('')
  const [places,  setPlaces]  = useState<string[]>([])
  const [years,   setYears]   = useState<string[]>([])

  const [loadingMeta, setLoadingMeta] = useState(false)
  const [saving,      setSaving]      = useState(false)

  useEffect(() => {
    fetch('/api/courses')
      .then(r => r.json())
      .then(d => setCourses((d.courses ?? []).map((c: { id: number; title: string }) => ({ id: c.id, title: c.title }))))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setSelectedLec(null)
    setLectures([])
    if (!selectedCourse) return
    fetch(`/api/lectures?courseId=${selectedCourse}`)
      .then(r => r.json())
      .then(d =>
        setLectures(
          ((d.lectures ?? []) as { id: number; title: string; order_in_course: number }[]).map(l => ({
            id: l.id, title: l.title, orderInCourse: l.order_in_course,
          })),
        ),
      )
      .catch(() => {})
  }, [selectedCourse])

  const loadMeta = useCallback(async (lectureId: number) => {
    setLoadingMeta(true)
    try {
      const res  = await fetch(`/api/lectures/meta?lectureId=${lectureId}`)
      const data = await res.json()
      setDate(data.date ?? '')
      setPlaces((data.places ?? []).map((p: { value: string }) => p.value))
      setYears((data.years  ?? []).map((y: { value: number }) => String(y.value)))
    } catch { /* silent */ } finally {
      setLoadingMeta(false)
    }
  }, [])

  useEffect(() => {
    if (selectedLec) loadMeta(selectedLec)
    else { setDate(''); setPlaces([]); setYears([]) }
  }, [selectedLec, loadMeta])

  async function handleSave() {
    if (!selectedLec) return
    setSaving(true)
    try {
      const numericYears = years
        .map(y => parseInt(y, 10))
        .filter(y => !isNaN(y) && y > 0)

      const res = await fetch('/api/lectures/meta', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lectureId: selectedLec, date: date.trim() || null, places, years: numericYears }),
      })
      if (!res.ok) throw new Error('Save failed')
      success('Saved', 'Lecture metadata updated successfully.')
    } catch (e) {
      toastError('Failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Course selector */}
      <div>
        <label className="block text-[11px] text-aura-muted uppercase tracking-wider mb-1.5">Course</label>
        <select
          value={selectedCourse ?? ''}
          onChange={e => setSelectedCourse(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]
                     text-sm text-aura-text focus:outline-none focus:border-aura-accent/40
                     transition-colors"
        >
          <option value="">— select course —</option>
          {courses.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      {/* Lecture selector */}
      {selectedCourse && (
        <div>
          <label className="block text-[11px] text-aura-muted uppercase tracking-wider mb-1.5">Lecture</label>
          <select
            value={selectedLec ?? ''}
            onChange={e => setSelectedLec(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]
                       text-sm text-aura-text focus:outline-none focus:border-aura-accent/40
                       transition-colors"
          >
            <option value="">— select lecture —</option>
            {lectures.map(l => (
              <option key={l.id} value={l.id}>{l.orderInCourse}. {l.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* Meta fields */}
      {selectedLec && (
        loadingMeta ? (
          <div className="flex justify-center py-4">
            <Loader2 size={18} className="animate-spin text-aura-accent" />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-aura-muted uppercase tracking-wider mb-1.5">
                Date <span className="normal-case font-normal opacity-60">(dd/mm/yyyy · optional)</span>
              </label>
              <input
                type="text"
                value={date}
                onChange={e => setDate(e.target.value)}
                placeholder="e.g. 15/03/2023"
                maxLength={10}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]
                           text-sm text-aura-text placeholder-aura-muted/50 font-mono
                           focus:outline-none focus:border-aura-accent/40 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] text-aura-muted uppercase tracking-wider mb-1.5">
                Places <span className="normal-case font-normal opacity-60">(Enter or comma to add · optional)</span>
              </label>
              <TagInput values={places} onChange={setPlaces} placeholder="Add a place…" />
            </div>
            <div>
              <label className="block text-[11px] text-aura-muted uppercase tracking-wider mb-1.5">
                Years <span className="normal-case font-normal opacity-60">(Enter or comma to add · optional)</span>
              </label>
              <TagInput
                values={years}
                onChange={setYears}
                placeholder="e.g. 2024"
                validate={v => /^\d{4}$/.test(v)}
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className={clsx(
                'w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2',
                'bg-gradient-to-r from-aura-accent to-aura-indigo text-aura-base',
                'hover:opacity-90 active:scale-[0.98] transition-all duration-200',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                : <><Check size={14} /> Save Metadata</>
              }
            </button>
          </div>
        )
      )}
    </div>
  )
}

// ===========================================================================
// EditPanel — top-level export
// ===========================================================================
export function EditPanel() {
  const [section, setSection] = useState<EditSection>('entities')

  const sections: { id: EditSection; label: string }[] = [
    { id: 'entities', label: 'Entities' },
    { id: 'courses',  label: 'Courses'  },
    { id: 'lectures', label: 'Lectures' },
  ]

  return (
    <div className="space-y-4">
      {/* Section switcher */}
      <div className="flex p-0.5 rounded-xl bg-black/30 border border-white/[0.06]">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={clsx(
              'flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200',
              section === s.id
                ? 'bg-aura-accent/10 text-aura-accent border border-aura-accent/20'
                : 'text-aura-muted',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Section content */}
      <AnimatePresence mode="wait">
        {section === 'entities' && (
          <motion.div
            key="entities"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <EntitiesSection />
          </motion.div>
        )}
        {section === 'courses' && (
          <motion.div
            key="courses"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <CoursesSection />
          </motion.div>
        )}
        {section === 'lectures' && (
          <motion.div
            key="lectures"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="glass rounded-2xl p-4 border border-white/[0.07]"
          >
            <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest mb-4">
              Lecture Date · Places · Years
            </p>
            <LecturesSection />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
