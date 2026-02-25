'use client'

/**
 * EditPanel.tsx
 *
 * Merged Upload + Edit panel.
 * • Upload tab   — image upload (hidden for lectures & themes)
 * • Edit tab     — inline field editing per entity type
 *
 * Schema-accurate editable fields:
 *   directors / writers / philosophers / painters : name, hebrew_name, description
 *   films / books / paintings                      : title, hebrew_name, description
 *   themes                                         : name, hebrew_name  (no description, no image)
 *   courses     : title, description, course_r2_url, subject_id, r2_dir
 *   lectures    : title, synopsis, duration, date, order_in_course, transcribed (no image)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Edit3, ImageIcon, Save, X, Check,
  Loader2, Trash2, FileImage, RefreshCw,
  ChevronDown, ToggleLeft, ToggleRight,
  AlertCircle, CheckCircle2,
} from 'lucide-react'
import { EntityType, ENTITY_TYPES } from '@/lib/constants'
import { useEntityStore } from '@/stores/entityStore'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

// ─────────────────────────────────────────────────────────────────────────────
// Constants & types
// ─────────────────────────────────────────────────────────────────────────────

/** Entity types that NEVER have an image */
const NO_IMAGE_TYPES: EntityType[] = ['lectures', 'themes']

/** Field definitions per entity type, in display order */
type FieldDef = {
  key:          string
  label:        string
  type:         'text' | 'textarea' | 'number' | 'boolean' | 'select'
  placeholder?: string
  options?:     { value: string | number; label: string }[]
  required?:    boolean
  hint?:        string
}

const FIELD_MAP: Record<EntityType, FieldDef[]> = {
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
    { key: 'description', label: 'Description',  type: 'textarea', placeholder: 'Painting notes…' },
  ],
  themes: [
    { key: 'name',        label: 'Name',        type: 'text',     required: true, placeholder: 'Theme name' },
    { key: 'hebrew_name', label: 'Hebrew Name',  type: 'text',     placeholder: 'שם בעברית' },
    // no description column in themes table
  ],
  courses: [
    { key: 'title',          label: 'Title',         type: 'text',     required: true, placeholder: 'Course title' },
    { key: 'description',    label: 'Description',   type: 'textarea', placeholder: 'Course overview…' },
    { key: 'course_r2_url',  label: 'R2 URL',        type: 'text',     placeholder: 'https://…', hint: 'Public URL of the course folder in R2' },
    { key: 'r2_dir',         label: 'R2 Directory',  type: 'text',     placeholder: 'courses/my-course', hint: 'Unique R2 directory key (slug)' },
  ],
  lectures: [
    { key: 'title',           label: 'Title',           type: 'text',    required: true, placeholder: 'Lecture title' },
    { key: 'synopsis',        label: 'Synopsis',        type: 'textarea', placeholder: 'Brief summary…' },
    { key: 'date',            label: 'Date',            type: 'text',    placeholder: 'YYYY-MM-DD' },
    { key: 'duration',        label: 'Duration (min)',  type: 'number',  placeholder: '90' },
    { key: 'order_in_course', label: 'Order in Course', type: 'number',  placeholder: '1' },
    { key: 'transcribed',     label: 'Transcribed',     type: 'boolean' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function displayName(entity: Record<string, unknown>, type: EntityType): string {
  const cfg = ENTITY_TYPES[type]
  return (entity[cfg.nameField] as string) ?? `#${entity.id}`
}

function hasImage(type: EntityType) {
  return !NO_IMAGE_TYPES.includes(type)
}

// ─────────────────────────────────────────────────────────────────────────────
// ImageUploader sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface ImageUploaderProps {
  type:         EntityType
  entityId:     number
  entityName:   string
  currentImage: string | null
  onUploaded:   () => void
  onDeleted:    () => void
}

function ImageUploader({
  type, entityId, entityName,
  currentImage, onUploaded, onDeleted,
}: ImageUploaderProps) {
  const { error: toastError, success } = useToast()
  const inputRef   = useRef<HTMLInputElement>(null)
  const [preview,  setPreview]  = useState<string | null>(currentImage)
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

      const res = await fetch('/api/entities/upload-image', { method: 'POST', body: form })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Upload failed')
      }
      const { url } = await res.json()
      setPreview(url)
      success('Uploaded', `Image set for "${entityName}".`)
      onUploaded()
    } catch (e) {
      toastError('Upload failed', e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (!preview) return
    setDeleting(true)
    try {
      const res = await fetch('/api/entities/upload-image', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ entityType: type, entityId }),
      })
      if (!res.ok) throw new Error('Delete failed')
      setPreview(null)
      success('Deleted', `Image removed for "${entityName}".`)
      onDeleted()
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

  return (
    <div className="space-y-3">
      {/* Drop zone / preview */}
      <div
        onClick={() => !preview && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={clsx(
          'relative rounded-xl border-2 border-dashed transition-all duration-200 overflow-hidden',
          preview
            ? 'border-transparent cursor-default'
            : dragOver
            ? 'border-aura-accent/60 bg-aura-accent/[0.06] cursor-copy'
            : 'border-white/[0.10] hover:border-aura-accent/30 hover:bg-white/[0.02] cursor-pointer',
          preview ? 'aspect-[4/3]' : 'aspect-[4/3] flex flex-col items-center justify-center gap-3',
        )}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={entityName}
              className="w-full h-full object-cover"
            />
            {/* Overlay actions */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/50 transition-colors flex items-center justify-center gap-3 opacity-0 hover:opacity-100">
              <button
                onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/90 text-black text-xs font-semibold hover:bg-white transition-colors"
              >
                <Upload size={12} /> Replace
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleDelete() }}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-aura-error/90 text-white text-xs font-semibold hover:bg-aura-error transition-colors"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Loading bar */}
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
// FieldEditor — renders one editable field
// ─────────────────────────────────────────────────────────────────────────────

interface FieldEditorProps {
  field:    FieldDef
  value:    unknown
  onChange: (val: unknown) => void
  saving:   boolean
}

function FieldEditor({ field, value, onChange, saving }: FieldEditorProps) {
  const base = clsx(
    'w-full bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text',
    'placeholder-aura-muted/40 focus:outline-none focus:border-aura-accent/40 transition-colors',
    'disabled:opacity-40',
  )

  if (field.type === 'boolean') {
    const on = Boolean(value)
    return (
      <button
        onClick={() => onChange(!on)}
        disabled={saving}
        className={clsx(
          'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all',
          on
            ? 'bg-aura-success/10 border-aura-success/30 text-aura-success'
            : 'bg-white/[0.02] border-white/[0.08] text-aura-muted',
        )}
      >
        {on
          ? <ToggleRight size={18} className="text-aura-success" />
          : <ToggleLeft  size={18} />
        }
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

  if (field.type === 'select' && field.options) {
    return (
      <select
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        disabled={saving}
        className={clsx(base, 'appearance-none')}
      >
        <option value="">— select —</option>
        {field.options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }

  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={e => onChange(e.target.value)}
      disabled={saving}
      placeholder={field.placeholder}
      className={clsx(base, field.key === 'hebrew_name' ? 'text-right font-hebrew' : '')}
      dir={field.key === 'hebrew_name' ? 'rtl' : 'ltr'}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EntityEditForm — edit all fields of one entity
// ─────────────────────────────────────────────────────────────────────────────

interface EntityEditFormProps {
  type:     EntityType
  entity:   Record<string, unknown>
  onSaved:  () => void
}

function EntityEditForm({ type, entity, onSaved }: EntityEditFormProps) {
  const { error: toastError, success } = useToast()
  const fields = FIELD_MAP[type] ?? []

  // Build initial state from entity
  const initialValues = () =>
    Object.fromEntries(fields.map(f => [f.key, entity[f.key] ?? null]))

  const [values,   setValues]   = useState<Record<string, unknown>>(initialValues)
  const [saving,   setSaving]   = useState(false)
  const [dirty,    setDirty]    = useState(false)
  const [imgUrl,   setImgUrl]   = useState<string | null>((entity.image_url as string | null) ?? null)

  // Reset when entity changes
  useEffect(() => {
    setValues(initialValues())
    setImgUrl((entity.image_url as string | null) ?? null)
    setDirty(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id, type])

  function handleChange(key: string, val: unknown) {
    setValues(prev => ({ ...prev, [key]: val }))
    setDirty(true)
  }

  async function handleSave() {
    // Validate required fields
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
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Save failed')
      }
      setDirty(false)
      success('Saved', `${ENTITY_TYPES[type].label.replace(/s$/, '')} updated.`)
      onSaved()
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setValues(initialValues())
    setDirty(false)
  }

  const showImage = hasImage(type)

  return (
    <div className="space-y-4">
      {/* Image section */}
      {showImage && (
        <div>
          <p className="text-[10px] font-bold text-aura-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ImageIcon size={10} /> Image
          </p>
          <ImageUploader
            type={type}
            entityId={entity.id as number}
            entityName={displayName(entity, type)}
            currentImage={imgUrl}
            onUploaded={() => {}}
            onDeleted={() => setImgUrl(null)}
          />
        </div>
      )}

      {/* Fields */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-aura-muted uppercase tracking-wider flex items-center gap-1.5">
          <Edit3 size={10} /> Fields
        </p>
        {fields.map(field => (
          <div key={field.key}>
            <label className="flex items-center gap-1.5 mb-1.5">
              <span className="text-xs font-medium text-aura-text">{field.label}</span>
              {field.required && <span className="text-[9px] text-aura-error">*</span>}
              {field.hint && (
                <span className="text-[9px] text-aura-muted/60 italic">{field.hint}</span>
              )}
            </label>
            <FieldEditor
              field={field}
              value={values[field.key]}
              onChange={val => handleChange(field.key, val)}
              saving={saving}
            />
          </div>
        ))}
      </div>

      {/* Save / Reset actions */}
      <div className="flex items-center gap-2 pt-1">
        {dirty && (
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-aura-muted
                       border border-white/[0.07] hover:bg-white/[0.04] transition-colors disabled:opacity-40"
          >
            <RefreshCw size={11} /> Reset
          </button>
        )}
        <button
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
// EntitySelector — pick type + entity
// ─────────────────────────────────────────────────────────────────────────────

interface EntitySelectorProps {
  selectedType:   EntityType
  selectedId:     number | null
  onTypeChange:   (t: EntityType) => void
  onEntityChange: (id: number | null) => void
}

function EntitySelector({
  selectedType, selectedId,
  onTypeChange, onEntityChange,
}: EntitySelectorProps) {
  const { entities, loading, fetchEntities } = useEntityStore()

  useEffect(() => {
    if (!entities[selectedType]) fetchEntities(selectedType)
  }, [selectedType, entities, fetchEntities])

  const list = entities[selectedType] ?? []
  const cfg  = ENTITY_TYPES[selectedType]

  const ALL_TYPES = Object.keys(ENTITY_TYPES) as EntityType[]

  return (
    <div className="space-y-3">
      {/* Type selector */}
      <div>
        <label className="text-[10px] font-bold text-aura-muted uppercase tracking-wider mb-1.5 block">
          Entity Type
        </label>
        <div className="grid grid-cols-4 gap-1">
          {ALL_TYPES.map(t => {
            const tc = ENTITY_TYPES[t]
            return (
              <button
                key={t}
                onClick={() => { onTypeChange(t); onEntityChange(null) }}
                className={clsx(
                  'flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-[10px] transition-all',
                  selectedType === t
                    ? 'bg-aura-indigo/10 border-aura-indigo/30 text-aura-indigo'
                    : 'bg-white/[0.02] border-white/[0.06] text-aura-muted hover:border-white/[0.12] hover:bg-white/[0.04]',
                )}
              >
                <span className="text-base leading-none">{tc.icon}</span>
                <span className="font-medium truncate w-full text-center">{tc.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Entity selector */}
      <div>
        <label className="text-[10px] font-bold text-aura-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <span>{cfg.icon}</span> {cfg.label}
        </label>
        <div className="relative">
          {loading[selectedType] ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-black/20 border border-white/[0.08]">
              <Loader2 size={12} className="animate-spin text-aura-muted" />
              <span className="text-xs text-aura-muted">Loading…</span>
            </div>
          ) : (
            <>
              <select
                value={selectedId ?? ''}
                onChange={e => onEntityChange(e.target.value ? Number(e.target.value) : null)}
                className={clsx(
                  'w-full appearance-none bg-black/20 border border-white/[0.08] rounded-xl',
                  'px-3 py-2.5 text-sm text-aura-text pr-8',
                  'focus:outline-none focus:border-aura-accent/40 transition-colors',
                )}
              >
                <option value="">— select {cfg.label.toLowerCase().replace(/s$/, '')} —</option>
                {list.map((e: Record<string, unknown>) => (
                  <option key={e.id as number} value={e.id as number}>
                    {displayName(e, selectedType)} {e.hebrew_name ? `(${e.hebrew_name})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab button
// ─────────────────────────────────────────────────────────────────────────────

function TabBtn({
  active, icon: Icon, label, onClick,
}: {
  active:  boolean
  icon:    React.ElementType
  label:   string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200',
        active
          ? 'bg-gradient-to-r from-aura-indigo to-aura-accent text-white shadow-[0_0_12px_rgba(129,140,248,0.18)]'
          : 'text-aura-muted hover:text-aura-text hover:bg-white/[0.04]',
      )}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main EditPanel
// ─────────────────────────────────────────────────────────────────────────────

export function EditPanel() {
  const { entities, fetchEntities, refreshEntity } = useEntityStore()

  const [selectedType,   setSelectedType]   = useState<EntityType>('directors')
  const [selectedId,     setSelectedId]     = useState<number | null>(null)
  const [innerTab,       setInnerTab]       = useState<'image' | 'fields'>('image')

  const selectedEntity = selectedId != null
    ? (entities[selectedType] ?? []).find((e: Record<string, unknown>) => e.id === selectedId) ?? null
    : null

  // Auto-switch to fields tab when type has no image
  useEffect(() => {
    if (!hasImage(selectedType) && innerTab === 'image') {
      setInnerTab('fields')
    }
  }, [selectedType, innerTab])

  function handleTypeChange(t: EntityType) {
    setSelectedType(t)
    setSelectedId(null)
  }

  function handleSaved() {
    if (selectedId != null) refreshEntity(selectedType, selectedId)
    fetchEntities(selectedType)
  }

  const showImageTab = hasImage(selectedType)

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="glass rounded-2xl p-4 border border-white/[0.07]">
        <div className="flex items-center gap-2 mb-0.5">
          <Edit3 size={15} className="text-aura-indigo" />
          <h2 className="text-sm font-bold text-aura-text">Edit Entities</h2>
        </div>
        <p className="text-xs text-aura-muted">
          Select a type and entity to edit its fields{showImageTab ? ' or upload an image' : ''}.
        </p>
      </div>

      {/* Entity selector */}
      <div className="glass rounded-2xl p-4 border border-white/[0.07]">
        <EntitySelector
          selectedType={selectedType}
          selectedId={selectedId}
          onTypeChange={handleTypeChange}
          onEntityChange={setSelectedId}
        />
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
            className="glass rounded-2xl border border-white/[0.07] overflow-hidden"
          >
            {/* Entity title bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] bg-white/[0.01]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">{ENTITY_TYPES[selectedType].icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-aura-text truncate">
                    {displayName(selectedEntity as Record<string, unknown>, selectedType)}
                  </p>
                  <p className="text-[10px] text-aura-muted">
                    {ENTITY_TYPES[selectedType].label.replace(/s$/, '')} · ID {selectedId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="text-aura-muted/40 hover:text-aura-muted p-1 rounded-lg hover:bg-white/[0.05] transition-colors shrink-0"
              >
                <X size={13} />
              </button>
            </div>

            {/* Sub-tabs: Image | Fields */}
            {showImageTab && (
              <div className="flex items-center gap-1 p-2 border-b border-white/[0.05]">
                <TabBtn
                  active={innerTab === 'image'}
                  icon={ImageIcon}
                  label="Image"
                  onClick={() => setInnerTab('image')}
                />
                <TabBtn
                  active={innerTab === 'fields'}
                  icon={Edit3}
                  label="Edit Fields"
                  onClick={() => setInnerTab('fields')}
                />
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
                      entityName={displayName(selectedEntity as Record<string, unknown>, selectedType)}
                      currentImage={(selectedEntity as Record<string, unknown>).image_url as string | null ?? null}
                      onUploaded={handleSaved}
                      onDeleted={handleSaved}
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
                      entity={selectedEntity as Record<string, unknown>}
                      onSaved={handleSaved}
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
            className="glass rounded-2xl border border-white/[0.07] p-10 flex flex-col items-center gap-3 text-center"
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
// CourseEditor — kept as a separate convenience component for the course tab
// ─────────────────────────────────────────────────────────────────────────────

export function CourseEditor() {
  const { entities, loading, fetchEntities } = useEntityStore()
  const { error: toastError, success } = useToast()

  useEffect(() => {
    if (!entities.courses) fetchEntities('courses')
  }, [entities.courses, fetchEntities])

  const [courseId,  setCourseId]  = useState<number | null>(null)
  const [values,    setValues]    = useState<Record<string, unknown>>({})
  const [dirty,     setDirty]     = useState(false)
  const [saving,    setSaving]    = useState(false)

  const courses = (entities.courses ?? []) as Record<string, unknown>[]
  const course  = courseId != null ? courses.find(c => c.id === courseId) ?? null : null

  useEffect(() => {
    if (course) {
      setValues(
        Object.fromEntries(FIELD_MAP.courses.map(f => [f.key, course[f.key] ?? null])),
      )
      setDirty(false)
    }
  }, [course])

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
      fetchEntities('courses')
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="glass rounded-2xl p-4 border border-white/[0.07]">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">{ENTITY_TYPES.courses.icon}</span>
          <h3 className="text-sm font-bold text-aura-text">Course Editor</h3>
        </div>

        {/* Course picker */}
        <div className="relative mb-4">
          <select
            value={courseId ?? ''}
            onChange={e => setCourseId(e.target.value ? Number(e.target.value) : null)}
            className="w-full appearance-none bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text pr-8 focus:outline-none focus:border-aura-accent/40"
          >
            <option value="">— select course —</option>
            {courses.map(c => (
              <option key={c.id as number} value={c.id as number}>{c.title as string}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
        </div>

        {course && (
          <>
            {FIELD_MAP.courses.map(field => (
              <div key={field.key} className="mb-3">
                <label className="text-xs font-medium text-aura-text mb-1.5 block">
                  {field.label}
                  {field.hint && <span className="text-[9px] text-aura-muted/60 italic ml-1.5">{field.hint}</span>}
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
              onClick={handleSave}
              disabled={!dirty || saving}
              className={clsx(
                'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all',
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
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LectureMetaEditor — kept as convenience component
// ─────────────────────────────────────────────────────────────────────────────

export function LectureMetaEditor() {
  const { entities, fetchEntities } = useEntityStore()
  const { error: toastError, success } = useToast()

  useEffect(() => {
    if (!entities.courses)  fetchEntities('courses')
    if (!entities.lectures) fetchEntities('lectures')
  }, [entities.courses, entities.lectures, fetchEntities])

  const [courseId,   setCourseId]   = useState<number | null>(null)
  const [lectureId,  setLectureId]  = useState<number | null>(null)
  const [values,     setValues]     = useState<Record<string, unknown>>({})
  const [dirty,      setDirty]      = useState(false)
  const [saving,     setSaving]     = useState(false)

  const courses  = (entities.courses  ?? []) as Record<string, unknown>[]
  const lectures = (entities.lectures ?? []) as Record<string, unknown>[]
  const courseLectures = courseId != null
    ? lectures.filter(l => l.course_id === courseId)
    : []
  const lecture = lectureId != null
    ? lectures.find(l => l.id === lectureId) ?? null
    : null

  useEffect(() => {
    if (lecture) {
      setValues(Object.fromEntries(FIELD_MAP.lectures.map(f => [f.key, lecture[f.key] ?? null])))
      setDirty(false)
    }
  }, [lecture])

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
      fetchEntities('lectures')
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="glass rounded-2xl p-4 border border-white/[0.07]">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">{ENTITY_TYPES.lectures.icon}</span>
          <h3 className="text-sm font-bold text-aura-text">Lecture Editor</h3>
          <span className="text-[9px] text-aura-muted bg-white/[0.05] px-1.5 py-0.5 rounded-full border border-white/[0.07] ml-auto">
            No image
          </span>
        </div>

        {/* Course picker */}
        <div className="relative mb-3">
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
        </div>

        {/* Lecture picker */}
        {courseId != null && (
          <div className="relative mb-4">
            <select
              value={lectureId ?? ''}
              onChange={e => setLectureId(e.target.value ? Number(e.target.value) : null)}
              className="w-full appearance-none bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text pr-8 focus:outline-none focus:border-aura-accent/40"
            >
              <option value="">— select lecture —</option>
              {courseLectures.map(l => (
                <option key={l.id as number} value={l.id as number}>
                  {l.order_in_course != null ? `#${l.order_in_course} ` : ''}{l.title as string}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
          </div>
        )}

        {lecture && (
          <>
            {FIELD_MAP.lectures.map(field => (
              <div key={field.key} className="mb-3">
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
              onClick={handleSave}
              disabled={!dirty || saving}
              className={clsx(
                'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all',
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
    </div>
  )
}