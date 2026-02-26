'use client'

/**
 * EditPanel.tsx — Merged Upload + Edit panel
 *
 * Self-contained: fetches entities via /api/entities/[type]
 * No external store dependency.
 *
 * Schema-accurate editable fields:
 *   directors / writers / philosophers / painters : name, hebrew_name, description
 *   films / books / paintings                      : title, hebrew_name, description
 *   themes                                         : name, hebrew_name  (no description, no image)
 *   courses     : title, description, course_r2_url, r2_dir
 *   lectures    : title, synopsis, duration, date, order_in_course, transcribed (no image)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Edit3, ImageIcon, Save, X, Check,
  Loader2, Trash2, FileImage, RefreshCw,
  ChevronDown, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { EntityType, ENTITY_TYPES } from '@/lib/constants'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Extended type that includes entity types + lectures + themes (which are editable but not in ENTITY_TYPES) */
type EditableType = EntityType | 'lectures' | 'themes'

/** Entity types that NEVER have an image */
const NO_IMAGE_TYPES: EditableType[] = ['lectures', 'themes']

type FieldDef = {
  key:          string
  label:        string
  type:         'text' | 'textarea' | 'number' | 'boolean'
  placeholder?: string
  required?:    boolean
  hint?:        string
}

const FIELD_MAP: Record<EditableType, FieldDef[]> = {
  directors: [
    { key: 'name',        label: 'Name',        type: 'text',     required: true, placeholder: 'Full name' },
    { key: 'hebrew_name', label: 'Hebrew Name',  type: 'text',     placeholder: 'שם בעברית' },
    { key: 'description', label: 'Description',  type: 'textarea', placeholder: 'Bio / notes…' },
  ],
  writers: [
    { key: 'name',        label: 'Name',        type: 'text',     required: true, placeholder: 'Full name' },
    { key: 'hebrew_name', label: 'Hebrew Name',  type: 'text',     placeholder: 'שם בעברית' },
    { key: 'description', label: 'Description',  type: 'textarea', placeholder: 'Bio / notes…' },
  ],
  philosophers: [
    { key: 'name',        label: 'Name',        type: 'text',     required: true, placeholder: 'Full name' },
    { key: 'hebrew_name', label: 'Hebrew Name',  type: 'text',     placeholder: 'שם בעברית' },
    { key: 'description', label: 'Description',  type: 'textarea', placeholder: 'Bio / notes…' },
  ],
  painters: [
    { key: 'name',        label: 'Name',        type: 'text',     required: true, placeholder: 'Full name' },
    { key: 'hebrew_name', label: 'Hebrew Name',  type: 'text',     placeholder: 'שם בעברית' },
    { key: 'description', label: 'Description',  type: 'textarea', placeholder: 'Bio / notes…' },
  ],
  films: [
    { key: 'title',       label: 'Title',       type: 'text',     required: true, placeholder: 'Film title' },
    { key: 'hebrew_name', label: 'Hebrew Name',  type: 'text',     placeholder: 'שם בעברית' },
    { key: 'description', label: 'Description',  type: 'textarea', placeholder: 'Film notes…' },
  ],
  books: [
    { key: 'title',       label: 'Title',       type: 'text',     required: true, placeholder: 'Book title' },
    { key: 'hebrew_name', label: 'Hebrew Name',  type: 'text',     placeholder: 'שם בעברית' },
    { key: 'description', label: 'Description',  type: 'textarea', placeholder: 'Book notes…' },
  ],
  paintings: [
    { key: 'title',       label: 'Title',       type: 'text',     required: true, placeholder: 'Painting title' },
    { key: 'hebrew_name', label: 'Hebrew Name',  type: 'text',     placeholder: 'שם בעברית' },
    { key: 'description', label: 'Description',  type: 'textarea', placeholder: 'Notes…' },
  ],
  themes: [
    // No description column in themes table, no image
    { key: 'name',        label: 'Name',        type: 'text',     required: true, placeholder: 'Theme name' },
    { key: 'hebrew_name', label: 'Hebrew Name',  type: 'text',     placeholder: 'שם בעברית' },
  ],
  courses: [
    { key: 'title',         label: 'Title',         type: 'text',     required: true, placeholder: 'Course title' },
    { key: 'description',   label: 'Description',   type: 'textarea', placeholder: 'Course overview…' },
    { key: 'course_r2_url', label: 'R2 URL',        type: 'text',     placeholder: 'https://…',         hint: 'Public URL of the course folder in R2' },
    { key: 'r2_dir',        label: 'R2 Directory',  type: 'text',     placeholder: 'courses/my-course', hint: 'Unique R2 directory key (slug)' },
  ],
  lectures: [
    // No image
    { key: 'title',           label: 'Title',           type: 'text',     required: true, placeholder: 'Lecture title' },
    { key: 'synopsis',        label: 'Synopsis',        type: 'textarea', placeholder: 'Brief summary…' },
    { key: 'date',            label: 'Date',            type: 'text',     placeholder: 'YYYY-MM-DD' },
    { key: 'duration',        label: 'Duration (min)',  type: 'number',   placeholder: '90' },
    { key: 'order_in_course', label: 'Order in Course', type: 'number',   placeholder: '1' },
    { key: 'transcribed',     label: 'Transcribed',     type: 'boolean' },
  ],
}

type EntityRow = Record<string, unknown>

function entityDisplayName(entity: EntityRow, type: EntityType): string {
  // API always returns displayName; fall back to nameField or id
  if (entity.displayName) return entity.displayName as string
  const cfg = ENTITY_TYPES[type]
  return (entity[cfg.nameField] as string) ?? `#${entity.id}`
}

function supportsImage(type: EditableType): boolean {
  return !NO_IMAGE_TYPES.includes(type)
}

// ─────────────────────────────────────────────────────────────────────────────
// useEntities — lightweight local hook, no global store needed
// ─────────────────────────────────────────────────────────────────────────────

function useEntities(type: EntityType) {
  const [entities,   setEntities]   = useState<EntityRow[]>([])
  const [loading,    setLoading]    = useState(false)
  const [total,      setTotal]      = useState(0)
  const [withImages, setWithImages] = useState(0)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/entities/${type}?all=true`)
      const data = await res.json()
      setEntities(Array.isArray(data) ? data : (data.entities ?? []))
      setTotal(data.total ?? 0)
      setWithImages(data.withImages ?? 0)
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => { refresh() }, [refresh])

  return { entities, loading, refresh, total, withImages }
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldEditor
// ─────────────────────────────────────────────────────────────────────────────

function FieldEditor({
  field, value, onChange, saving,
}: {
  field:    FieldDef
  value:    unknown
  onChange: (val: unknown) => void
  saving:   boolean
}) {
  const base = clsx(
    'w-full bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text',
    'placeholder-aura-muted/40 focus:outline-none focus:border-aura-accent/40 transition-colors',
    'disabled:opacity-40',
  )

  if (field.type === 'boolean') {
    const on = Boolean(value)
    return (
      <button
        type="button"
        onClick={() => onChange(!on)}
        disabled={saving}
        className={clsx(
          'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all',
          on
            ? 'bg-aura-success/10 border-aura-success/30 text-aura-success'
            : 'bg-white/[0.02] border-white/[0.08] text-aura-muted',
        )}
      >
        {on ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
        {on ? 'Yes' : 'No'}
      </button>
    )
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        disabled={saving}
        placeholder={field.placeholder}
        rows={3}
        className={clsx(base, 'resize-none leading-relaxed')}
      />
    )
  }

  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={value === null || value === undefined ? '' : String(value)}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        disabled={saving}
        placeholder={field.placeholder}
        className={base}
      />
    )
  }

  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={e => onChange(e.target.value)}
      disabled={saving}
      placeholder={field.placeholder}
      className={clsx(base, field.key === 'hebrew_name' ? 'text-right' : '')}
      dir={field.key === 'hebrew_name' ? 'rtl' : 'ltr'}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ImageUploader
// ─────────────────────────────────────────────────────────────────────────────

function ImageUploader({
  type, entityId, entityName, currentImage, onDone,
}: {
  type:         EntityType
  entityId:     number
  entityName:   string
  currentImage: string | null
  onDone:       () => void
}) {
  const { error: toastError, success } = useToast()
  const inputRef    = useRef<HTMLInputElement>(null)
  const [preview,   setPreview]   = useState<string | null>(currentImage)
  const [uploading, setUploading] = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [dragOver,  setDragOver]  = useState(false)

  useEffect(() => { setPreview(currentImage) }, [currentImage])

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) {
      toastError('Invalid file', 'Please upload an image file.')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file',       file)
      form.append('entityType', type)
      form.append('entityId',   String(entityId))
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Upload failed')
      const { publicUrl } = await res.json()
      setPreview(publicUrl)
      success('Uploaded', `Image set for "${entityName}".`)
      onDone()
    } catch (e) {
      toastError('Upload failed', e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch('/api/upload', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ entityType: type, entityId }),
      })
      if (!res.ok) throw new Error('Delete failed')
      setPreview(null)
      success('Deleted', 'Image removed.')
      onDone()
    } catch (e) {
      toastError('Delete failed', e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) upload(file)
  }

  const emptyClasses = clsx(
    'relative rounded-xl border-2 border-dashed transition-all duration-200 overflow-hidden',
    'aspect-[4/3] flex flex-col items-center justify-center gap-3',
    dragOver
      ? 'border-aura-accent/60 bg-aura-accent/[0.06] cursor-copy'
      : 'border-white/[0.10] hover:border-aura-accent/30 hover:bg-white/[0.02] cursor-pointer',
  )

  return (
    <div className="space-y-3">
      {preview ? (
        <div className="relative rounded-xl overflow-hidden aspect-[4/3]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={entityName} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 hover:bg-black/50 transition-colors flex items-center justify-center gap-3 opacity-0 hover:opacity-100">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/90 text-black text-xs font-semibold hover:bg-white transition-colors"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-aura-error/90 text-white text-xs font-semibold hover:bg-aura-error transition-colors"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={emptyClasses}
        >
          <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
            {uploading
              ? <Loader2 size={20} className="animate-spin text-aura-accent" />
              : <FileImage size={20} className="text-aura-muted/50" />
            }
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-aura-text">
              {uploading ? 'Uploading…' : dragOver ? 'Drop to upload' : 'Click or drag image'}
            </p>
            <p className="text-[10px] text-aura-muted mt-0.5">JPG, PNG, WebP · max 5 MB</p>
          </div>
        </div>
      )}

      {uploading && (
        <div className="h-0.5 rounded-full bg-white/[0.05] overflow-hidden">
          <div className="h-full bg-gradient-to-r from-aura-indigo to-aura-accent animate-pulse w-2/3" />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => e.target.files?.[0] && upload(e.target.files[0])}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EntityEditForm
// ─────────────────────────────────────────────────────────────────────────────

function EntityEditForm({
  type, entity, onSaved,
}: {
  type:    EntityType
  entity:  EntityRow
  onSaved: () => void
}) {
  const { error: toastError, success } = useToast()
  const fields = FIELD_MAP[type] ?? []

  function initValues() {
    return Object.fromEntries(fields.map(f => [f.key, entity[f.key] ?? null]))
  }

  const [values, setValues] = useState<Record<string, unknown>>(initValues)
  const [saving, setSaving] = useState(false)
  const [dirty,  setDirty]  = useState(false)

  useEffect(() => {
    setValues(initValues())
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id, type])

  function handleChange(key: string, val: unknown) {
    setValues(prev => ({ ...prev, [key]: val }))
    setDirty(true)
  }

  async function handleSave() {
    for (const f of fields) {
      if (f.required && !values[f.key]) {
        toastError('Validation', `"${f.label}" is required.`)
        return
      }
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/entities/${type}/${entity.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(values),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed')
      setDirty(false)
      success('Saved', `${ENTITY_TYPES[type].label.replace(/s$/, '')} updated.`)
      onSaved()
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {fields.map(field => (
        <div key={field.key}>
          <label className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs font-medium text-aura-text">{field.label}</span>
            {field.required && <span className="text-[9px] text-aura-error">*</span>}
            {field.hint && <span className="text-[9px] text-aura-muted/60 italic">{field.hint}</span>}
          </label>
          <FieldEditor
            field={field}
            value={values[field.key]}
            onChange={val => handleChange(field.key, val)}
            saving={saving}
          />
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        {dirty && (
          <button
            type="button"
            onClick={() => { setValues(initValues()); setDirty(false) }}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-aura-muted
                       border border-white/[0.07] hover:bg-white/[0.04] transition-colors disabled:opacity-40"
          >
            <RefreshCw size={11} /> Reset
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all',
            dirty && !saving
              ? 'bg-gradient-to-r from-aura-indigo to-aura-accent text-white shadow-[0_0_16px_rgba(129,140,248,0.2)] hover:opacity-90'
              : 'bg-white/[0.04] text-aura-muted/40 cursor-not-allowed border border-white/[0.05]',
          )}
        >
          {saving
            ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
            : dirty
            ? <><Save size={12} /> Save Changes</>
            : <><Check size={12} /> Saved</>
          }
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EntityEditor (generic, used inside EditPanel)
// ─────────────────────────────────────────────────────────────────────────────

const ALL_ENTITY_TYPES = Object.keys(ENTITY_TYPES) as EntityType[]

function EntityEditor() {
  const [selectedType, setSelectedType] = useState<EntityType>('directors')
  const [selectedId,   setSelectedId]   = useState<number | null>(null)
  const [innerTab,     setInnerTab]     = useState<'image' | 'fields'>('image')
  const [imageFilter,  setImageFilter]  = useState<'missing' | null>(null)
  const { entities, loading, refresh, total, withImages } = useEntities(selectedType)

  const selectedEntity = selectedId != null
    ? entities.find(e => e.id === selectedId) ?? null
    : null

  useEffect(() => {
    if (!supportsImage(selectedType)) setInnerTab('fields')
  }, [selectedType])

  function handleTypeChange(t: EntityType) {
    setSelectedType(t)
    setSelectedId(null)
    setImageFilter(null)
  }

  function toggleFilter(f: 'missing') {
    const next = imageFilter === f ? null : f
    setImageFilter(next)
    // clear selection if selected entity not in new filtered list
    if (next === 'missing' && selectedId != null) {
      const selected = entities.find(e => e.id === selectedId)
      if (selected?.hasImage) setSelectedId(null)
    }
  }

  const showImageTab    = supportsImage(selectedType)
  const missingImages   = showImageTab ? total - withImages : 0
  const coveragePct     = showImageTab && total > 0 ? Math.round((withImages / total) * 100) : null
  const displayEntities = imageFilter === 'missing'
    ? entities.filter(e => !e.hasImage)
    : entities

  return (
    <div className="space-y-3">
      {/* Type grid */}
      <div>
        <p className="text-[10px] font-bold text-aura-muted uppercase tracking-wider mb-2">Entity Type</p>
        <div className="grid grid-cols-4 gap-1.5">
          {ALL_ENTITY_TYPES.map(t => {
            const tc = ENTITY_TYPES[t]
            return (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeChange(t)}
                className={clsx(
                  'flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-[10px] transition-all',
                  selectedType === t
                    ? 'bg-aura-indigo/10 border-aura-indigo/30 text-aura-indigo'
                    : 'bg-white/[0.02] border-white/[0.06] text-aura-muted hover:border-white/[0.12] hover:bg-white/[0.04]',
                )}
              >
                <span className="text-base leading-none">{tc.icon}</span>
                <span className="font-medium truncate w-full text-center leading-tight">{tc.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Image coverage stats (only for types that support images) */}
      {showImageTab && !loading && total > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => { setImageFilter(null); setSelectedId(null) }}
            className={clsx(
              'glass rounded-xl p-2.5 border text-center transition-all',
              imageFilter === null
                ? 'border-aura-accent/30 bg-aura-accent/[0.05]'
                : 'border-white/[0.06] hover:border-white/[0.12]',
            )}
          >
            <p className="text-sm font-bold text-aura-text">{total}</p>
            <p className="text-[10px] text-aura-muted">Total</p>
          </button>
          <button
            onClick={() => toggleFilter('missing')}
            disabled={missingImages === 0}
            className={clsx(
              'glass rounded-xl p-2.5 border text-center transition-all disabled:opacity-40 disabled:cursor-not-allowed',
              imageFilter === 'missing'
                ? 'border-aura-error/40 bg-aura-error/[0.08]'
                : missingImages > 0
                  ? 'border-aura-error/20 hover:border-aura-error/35'
                  : 'border-white/[0.06]',
            )}
          >
            <p className="text-sm font-bold text-aura-text">{missingImages}</p>
            <p className="text-[10px] text-aura-muted">Missing</p>
          </button>
          <div className={clsx('glass rounded-xl p-2.5 border text-center', coveragePct === 100 ? 'border-aura-success/20' : 'border-white/[0.06]')}>
            <p className={clsx('text-sm font-bold', coveragePct === 100 ? 'text-aura-success' : 'text-aura-text')}>{coveragePct}%</p>
            <p className="text-[10px] text-aura-muted">Coverage</p>
          </div>
        </div>
      )}

      {/* Entity dropdown */}
      <div>
        <p className="text-[10px] font-bold text-aura-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <span>{ENTITY_TYPES[selectedType].icon}</span>
          {ENTITY_TYPES[selectedType].label}
          {imageFilter === 'missing' && (
            <span className="ml-1 text-[9px] font-semibold text-aura-error bg-aura-error/10 px-1.5 py-0.5 rounded-full border border-aura-error/20">
              missing only
            </span>
          )}
          {!showImageTab && (
            <span className="ml-auto text-[9px] text-aura-muted/50 bg-white/[0.04] px-1.5 py-0.5 rounded-full border border-white/[0.06]">
              no image
            </span>
          )}
        </p>
        <div className="relative">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-black/20 border border-white/[0.08]">
              <Loader2 size={12} className="animate-spin text-aura-muted" />
              <span className="text-xs text-aura-muted">Loading…</span>
            </div>
          ) : (
            <>
              <select
                value={selectedId ?? ''}
                onChange={e => setSelectedId(e.target.value ? Number(e.target.value) : null)}
                className="w-full appearance-none bg-black/20 border border-white/[0.08] rounded-xl
                           px-3 py-2.5 text-sm text-aura-text pr-8
                           focus:outline-none focus:border-aura-accent/40 transition-colors"
              >
                <option value="">
                  — select {ENTITY_TYPES[selectedType].label.toLowerCase().replace(/s$/, '')}
                  {imageFilter === 'missing' ? ` (${displayEntities.length} missing)` : ''} —
                </option>
                {displayEntities.map(e => (
                  <option key={e.id as number} value={e.id as number}>
                    {entityDisplayName(e, selectedType)}
                    {(e.hebrewName ?? e.hebrew_name) ? ` (${e.hebrewName ?? e.hebrew_name})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
            </>
          )}
        </div>
      </div>

      {/* Editor area */}
      <AnimatePresence mode="wait">
        {selectedEntity ? (
          <motion.div
            key={`${selectedType}-${selectedId}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="rounded-2xl border border-white/[0.09] overflow-hidden"
          >
            {/* Title bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] bg-white/[0.01]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">{ENTITY_TYPES[selectedType].icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-aura-text truncate">
                    {entityDisplayName(selectedEntity, selectedType)}
                  </p>
                  <p className="text-[10px] text-aura-muted">
                    {ENTITY_TYPES[selectedType].label.replace(/s$/, '')} · ID {selectedId}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-aura-muted/40 hover:text-aura-muted p-1 rounded-lg hover:bg-white/[0.05] transition-colors shrink-0"
              >
                <X size={13} />
              </button>
            </div>

            {/* Sub-tabs: only when image is supported */}
            {showImageTab && (
              <div className="flex items-center gap-1 p-2 border-b border-white/[0.05]">
                {(
                  [
                    { id: 'image',  icon: ImageIcon, label: 'Image' },
                    { id: 'fields', icon: Edit3,      label: 'Edit Fields' },
                  ] as const
                ).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setInnerTab(tab.id)}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200',
                      innerTab === tab.id
                        ? 'bg-gradient-to-r from-aura-indigo to-aura-accent text-white shadow-[0_0_12px_rgba(129,140,248,0.18)]'
                        : 'text-aura-muted hover:text-aura-text hover:bg-white/[0.04]',
                    )}
                  >
                    <tab.icon size={13} />
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Content */}
            <div className="p-4">
              <AnimatePresence mode="wait">
                {innerTab === 'image' && showImageTab ? (
                  <motion.div
                    key="image"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ImageUploader
                      type={selectedType}
                      entityId={selectedId!}
                      entityName={entityDisplayName(selectedEntity, selectedType)}
                      currentImage={(selectedEntity.image_url as string | null) ?? null}
                      onDone={refresh}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="fields"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <EntityEditForm
                      type={selectedType}
                      entity={selectedEntity}
                      onSaved={refresh}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-white/[0.07] p-10 flex flex-col items-center gap-3 text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-center">
              <Edit3 size={20} className="text-aura-muted/40" />
            </div>
            <div>
              <p className="text-sm font-medium text-aura-text">Select an entity</p>
              <p className="text-xs text-aura-muted mt-1">
                Choose a type above, then pick an entity to edit
                {showImageTab ? ' or manage its image' : ''}.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CourseEditor (exported — used by Dashboard.tsx)
// ─────────────────────────────────────────────────────────────────────────────

export function CourseEditor() {
  const { entities, loading, refresh } = useEntities('courses')
  const { error: toastError, success } = useToast()
  const [courseId, setCourseId] = useState<number | null>(null)
  const [values,   setValues]   = useState<Record<string, unknown>>({})
  const [dirty,    setDirty]    = useState(false)
  const [saving,   setSaving]   = useState(false)

  const course = courseId != null ? entities.find(c => c.id === courseId) ?? null : null

  useEffect(() => {
    if (course) {
      setValues(Object.fromEntries(FIELD_MAP.courses.map(f => [f.key, course[f.key] ?? null])))
      setDirty(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id])

  async function handleSave() {
    if (!courseId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/entities/courses/${courseId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(values),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed')
      setDirty(false)
      success('Saved', 'Course updated.')
      refresh()
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">{ENTITY_TYPES.courses.icon}</span>
        <h3 className="text-sm font-bold text-aura-text">Course Editor</h3>
      </div>

      <div className="relative">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-black/20 border border-white/[0.08]">
            <Loader2 size={12} className="animate-spin text-aura-muted" /><span className="text-xs text-aura-muted">Loading…</span>
          </div>
        ) : (
          <>
            <select
              value={courseId ?? ''}
              onChange={e => setCourseId(e.target.value ? Number(e.target.value) : null)}
              className="w-full appearance-none bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text pr-8 focus:outline-none focus:border-aura-accent/40"
            >
              <option value="">— select course —</option>
              {entities.map(c => (
                <option key={c.id as number} value={c.id as number}>{c.title as string}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
          </>
        )}
      </div>

      {course && (
        <>
          {FIELD_MAP.courses.map(field => (
            <div key={field.key}>
              <label className="text-xs font-medium text-aura-text mb-1.5 flex items-center gap-1.5">
                {field.label}
                {field.hint && <span className="text-[9px] text-aura-muted/60 italic">{field.hint}</span>}
              </label>
              <FieldEditor
                field={field}
                value={values[field.key]}
                onChange={val => { setValues(p => ({ ...p, [field.key]: val })); setDirty(true) }}
                saving={saving}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all mt-1',
              dirty && !saving
                ? 'bg-gradient-to-r from-aura-indigo to-aura-accent text-white hover:opacity-90'
                : 'bg-white/[0.04] text-aura-muted/40 cursor-not-allowed border border-white/[0.05]',
            )}
          >
            {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : <><Save size={12} /> Save Course</>}
          </button>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LectureMetaEditor (exported — used by Dashboard.tsx)
// ─────────────────────────────────────────────────────────────────────────────

export function LectureMetaEditor() {
  const { entities: courses, loading: coursesLoading } = useEntities('courses')
  const { error: toastError, success }                 = useToast()

  const [courseId,         setCourseId]         = useState<number | null>(null)
  const [lectureId,        setLectureId]        = useState<number | null>(null)
  const [lectures,         setLectures]         = useState<EntityRow[]>([])
  const [lecturesLoading,  setLecturesLoading]  = useState(false)
  const [values,           setValues]           = useState<Record<string, unknown>>({})
  const [dirty,            setDirty]            = useState(false)
  const [saving,           setSaving]           = useState(false)

  useEffect(() => {
    if (courseId == null) { setLectures([]); setLectureId(null); return }
    setLecturesLoading(true)
    fetch(`/api/entities/lectures?courseId=${courseId}&all=true`)
      .then(r => r.json())
      .then(d => setLectures(Array.isArray(d) ? d : (d.entities ?? [])))
      .finally(() => setLecturesLoading(false))
  }, [courseId])

  const lecture = lectureId != null ? lectures.find(l => l.id === lectureId) ?? null : null

  useEffect(() => {
    if (lecture) {
      setValues(Object.fromEntries(FIELD_MAP.lectures.map(f => [f.key, lecture[f.key] ?? null])))
      setDirty(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lecture?.id])

  async function handleSave() {
    if (!lectureId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/entities/lectures/${lectureId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(values),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed')
      setDirty(false)
      success('Saved', 'Lecture updated.')
      if (courseId != null) {
        fetch(`/api/entities/lectures?courseId=${courseId}&all=true`)
          .then(r => r.json())
          .then(d => setLectures(Array.isArray(d) ? d : (d.entities ?? [])))
      }
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">🎤</span>
        <h3 className="text-sm font-bold text-aura-text">Lecture Editor</h3>
        <span className="ml-auto text-[9px] text-aura-muted/50 bg-white/[0.04] px-1.5 py-0.5 rounded-full border border-white/[0.06]">no image</span>
      </div>

      {/* Course picker */}
      <div className="relative">
        {coursesLoading ? (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-black/20 border border-white/[0.08]">
            <Loader2 size={12} className="animate-spin text-aura-muted" /><span className="text-xs text-aura-muted">Loading courses…</span>
          </div>
        ) : (
          <>
            <select
              value={courseId ?? ''}
              onChange={e => { setCourseId(e.target.value ? Number(e.target.value) : null); setLectureId(null) }}
              className="w-full appearance-none bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text pr-8 focus:outline-none focus:border-aura-accent/40"
            >
              <option value="">— select course —</option>
              {courses.map(c => (
                <option key={c.id as number} value={c.id as number}>{c.title as string}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
          </>
        )}
      </div>

      {/* Lecture picker */}
      {courseId != null && (
        <div className="relative">
          {lecturesLoading ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-black/20 border border-white/[0.08]">
              <Loader2 size={12} className="animate-spin text-aura-muted" /><span className="text-xs text-aura-muted">Loading lectures…</span>
            </div>
          ) : (
            <>
              <select
                value={lectureId ?? ''}
                onChange={e => setLectureId(e.target.value ? Number(e.target.value) : null)}
                className="w-full appearance-none bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text pr-8 focus:outline-none focus:border-aura-accent/40"
              >
                <option value="">— select lecture —</option>
                {lectures.map(l => (
                  <option key={l.id as number} value={l.id as number}>
                    {l.order_in_course != null ? `#${l.order_in_course} ` : ''}{l.title as string}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
            </>
          )}
        </div>
      )}

      {lecture && (
        <>
          {FIELD_MAP.lectures.map(field => (
            <div key={field.key}>
              <label className="text-xs font-medium text-aura-text mb-1.5 block">{field.label}</label>
              <FieldEditor
                field={field}
                value={values[field.key]}
                onChange={val => { setValues(p => ({ ...p, [field.key]: val })); setDirty(true) }}
                saving={saving}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all mt-1',
              dirty && !saving
                ? 'bg-gradient-to-r from-aura-indigo to-aura-accent text-white hover:opacity-90'
                : 'bg-white/[0.04] text-aura-muted/40 cursor-not-allowed border border-white/[0.05]',
            )}
          >
            {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : <><Save size={12} /> Save Lecture</>}
          </button>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EditPanel — main export
// ─────────────────────────────────────────────────────────────────────────────

export function EditPanel() {
  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4 border border-white/[0.07]">
        <div className="flex items-center gap-2 mb-0.5">
          <Edit3 size={15} className="text-aura-indigo" />
          <h2 className="text-sm font-bold text-aura-text">Edit Entities</h2>
        </div>
        <p className="text-xs text-aura-muted">
          Select a type and entity to edit its fields or upload an image.
        </p>
      </div>
      <div className="glass rounded-2xl p-4 border border-white/[0.07]">
        <EntityEditor />
      </div>
    </div>
  )
}