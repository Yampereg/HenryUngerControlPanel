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
  Edit3, ImageIcon, Save, X, Check, Plus,
  Loader2, Trash2, FileImage, RefreshCw,
  ChevronDown, ToggleLeft, ToggleRight, Search, Link,
} from 'lucide-react'
import { EntityType, ENTITY_TYPES, JUNCTION_MAP } from '@/lib/constants'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Extended type that includes entity types + themes (lectures is now in ENTITY_TYPES) */
type EditableType = EntityType | 'themes'

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
    { key: 'date',            label: 'Date',            type: 'text',     placeholder: 'DD.MM.YYYY' },
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

function useEntities(type: EntityType, courseId?: number | null) {
  const [entities,   setEntities]   = useState<EntityRow[]>([])
  const [loading,    setLoading]    = useState(false)
  const [total,      setTotal]      = useState(0)
  const [withImages, setWithImages] = useState(0)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ all: 'true' })
      if (courseId != null) params.set('courseId', String(courseId))
      const res  = await fetch(`/api/entities/${type}?${params}`)
      const data = await res.json()
      setEntities(Array.isArray(data) ? data : (data.entities ?? []))
      setTotal(data.total ?? 0)
      setWithImages(data.withImages ?? 0)
    } finally {
      setLoading(false)
    }
  }, [type, courseId])

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
  const [urlInput,  setUrlInput]  = useState('')
  const [fetchingUrl, setFetchingUrl] = useState(false)

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

  async function fetchFromUrl() {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    setFetchingUrl(true)
    try {
      const proxyRes = await fetch(`/api/fetch-image?url=${encodeURIComponent(trimmed)}`)
      if (!proxyRes.ok) throw new Error((await proxyRes.json()).error ?? 'Fetch failed')
      const contentType = proxyRes.headers.get('content-type') ?? 'image/jpeg'
      const buffer      = await proxyRes.arrayBuffer()
      const ext         = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
      const file        = new File([buffer], `image.${ext}`, { type: contentType })
      setUrlInput('')
      await upload(file)
    } catch (e) {
      toastError('URL fetch failed', e instanceof Error ? e.message : String(e))
    } finally {
      setFetchingUrl(false)
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

      {/* URL input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchFromUrl()}
            placeholder="Paste image URL…"
            disabled={uploading || fetchingUrl}
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-black/20 border border-white/[0.08] text-xs text-aura-text
                       placeholder-aura-muted/40 focus:outline-none focus:border-aura-accent/40 transition-colors disabled:opacity-40"
          />
        </div>
        <button
          type="button"
          onClick={fetchFromUrl}
          disabled={!urlInput.trim() || uploading || fetchingUrl}
          className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.05] border border-white/[0.08]
                     text-aura-muted hover:text-aura-text hover:bg-white/[0.08] transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {fetchingUrl ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          Fetch
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PlacesEditor — chips + add-new for course places
// ─────────────────────────────────────────────────────────────────────────────

function PlacesEditor({ places, onChange, saving }: {
  places:   string[]
  onChange: (places: string[]) => void
  saving:   boolean
}) {
  const [globalPlaces, setGlobalPlaces] = useState<string[]>([])
  const [showInput,    setShowInput]    = useState(false)
  const [inputVal,     setInputVal]     = useState('')

  useEffect(() => {
    fetch('/api/courses/meta?allPlaces=true')
      .then(r => r.json())
      .then(d => setGlobalPlaces(d.places ?? []))
      .catch(() => {})
  }, [])

  const placesLower = places.map(x => x.toLowerCase())
  const suggestions = globalPlaces.filter(p => !placesLower.includes(p.toLowerCase()))

  function addPlace(p: string) {
    const t = p.trim()
    if (!t || placesLower.includes(t.toLowerCase())) return
    onChange([...places, t])
    setInputVal('')
    setShowInput(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px] items-center">
        {places.map(p => (
          <span key={p} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-aura-indigo/10 border border-aura-indigo/20 text-aura-indigo">
            {p}
            <button
              type="button"
              onClick={() => onChange(places.filter(x => x !== p))}
              disabled={saving}
              className="hover:text-aura-error transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        {places.length === 0 && !showInput && (
          <span className="text-[11px] text-aura-muted/40">No places added</span>
        )}
      </div>

      {showInput ? (
        <div className="flex gap-2">
          <input
            autoFocus
            type="text"
            value={inputVal}
            list="place-suggestions"
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); addPlace(inputVal) }
              if (e.key === 'Escape') { setShowInput(false); setInputVal('') }
            }}
            placeholder="Place name…"
            className="flex-1 bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-aura-text placeholder-aura-muted/40 focus:outline-none focus:border-aura-accent/40"
          />
          <datalist id="place-suggestions">
            {suggestions.map(p => <option key={p} value={p} />)}
          </datalist>
          <button
            type="button"
            onClick={() => addPlace(inputVal)}
            disabled={!inputVal.trim()}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-aura-indigo/10 border border-aura-indigo/20 text-aura-indigo hover:bg-aura-indigo/20 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setShowInput(false); setInputVal('') }}
            className="px-2 py-2 rounded-xl text-aura-muted hover:text-aura-text border border-white/[0.07] hover:bg-white/[0.04] transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowInput(true)}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-aura-muted border border-white/[0.07] hover:border-white/[0.14] hover:text-aura-text hover:bg-white/[0.03] transition-colors disabled:opacity-40"
        >
          <Plus size={11} /> Add place
        </button>
      )}
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
// InlineCourseEditor — full course editor inside EntityEditor's fields tab
// ─────────────────────────────────────────────────────────────────────────────

interface SubjectOption { id: number; name_en: string; name_he: string }

function InlineCourseEditor({ entity, onSaved }: { entity: EntityRow; onSaved: () => void }) {
  const courseId = entity.id as number
  const { error: toastError, success } = useToast()
  const [subjects,  setSubjects]  = useState<SubjectOption[]>([])
  const [values,    setValues]    = useState<Record<string, unknown>>(
    () => Object.fromEntries(FIELD_MAP.courses.map(f => [f.key, entity[f.key] ?? null]))
  )
  const [subjectId, setSubjectId] = useState<number | null>((entity.subject_id as number | null) ?? null)
  const [yearText,  setYearText]  = useState('')
  const [places,    setPlaces]    = useState<string[]>([])
  const [saving,    setSaving]    = useState(false)
  const [dirty,     setDirty]     = useState(false)
  const [metaDirty, setMetaDirty] = useState(false)

  useEffect(() => {
    fetch('/api/subjects').then(r => r.json()).then(d => setSubjects(d.subjects ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    setValues(Object.fromEntries(FIELD_MAP.courses.map(f => [f.key, entity[f.key] ?? null])))
    setSubjectId((entity.subject_id as number | null) ?? null)
    setDirty(false)
    setMetaDirty(false)
    fetch(`/api/courses/meta?courseId=${courseId}`)
      .then(r => r.json())
      .then(d => {
        setYearText((d.years  ?? []).map((y: { value: number }) => String(y.value)).join(', '))
        setPlaces((d.places ?? []).map((p: { value: string }) => p.value))
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  async function handleSave() {
    setSaving(true)
    try {
      const r1 = await fetch(`/api/courses/${courseId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:         values.title,
          description:   values.description,
          course_r2_url: values.course_r2_url,
          r2_dir:        values.r2_dir,
          subjectId:     subjectId,
        }),
      })
      if (!r1.ok) throw new Error((await r1.json()).error ?? 'Save failed')

      if (metaDirty) {
        const years = yearText.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
        const r2 = await fetch('/api/courses/meta', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ courseId, years, places }),
        })
        if (!r2.ok) throw new Error((await r2.json()).error ?? 'Meta save failed')
      }

      setDirty(false)
      setMetaDirty(false)
      success('Saved', 'Course updated.')
      onSaved()
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const isAnythingDirty = dirty || metaDirty

  return (
    <div className="space-y-3">
      {FIELD_MAP.courses.map(field => (
        <div key={field.key}>
          <label className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs font-medium text-aura-text">{field.label}</span>
            {field.required && <span className="text-[9px] text-aura-error">*</span>}
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

      {/* Subject */}
      <div>
        <label className="text-xs font-medium text-aura-text mb-1.5 block">Subject</label>
        <div className="relative">
          <select
            value={String(subjectId ?? '')}
            onChange={e => { setSubjectId(e.target.value ? Number(e.target.value) : null); setDirty(true) }}
            disabled={saving}
            className="w-full appearance-none bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text pr-8 focus:outline-none focus:border-aura-accent/40 disabled:opacity-40"
          >
            <option value="">— no subject —</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name_en}{s.name_he ? ` / ${s.name_he}` : ''}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
        </div>
      </div>

      {/* Year(s) */}
      <div>
        <label className="text-xs font-medium text-aura-text mb-1.5 block">Year(s)</label>
        <input
          type="text"
          value={yearText}
          onChange={e => { setYearText(e.target.value); setMetaDirty(true) }}
          disabled={saving}
          placeholder="e.g. 2019 or 2018, 2019"
          className="w-full bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text placeholder-aura-muted/40 focus:outline-none focus:border-aura-accent/40 disabled:opacity-40"
        />
      </div>

      {/* Place(s) */}
      <div>
        <label className="text-xs font-medium text-aura-text mb-1.5 block">Place(s)</label>
        <PlacesEditor
          places={places}
          onChange={newPlaces => { setPlaces(newPlaces); setMetaDirty(true) }}
          saving={saving}
        />
      </div>

      <div className="pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isAnythingDirty || saving}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all',
            isAnythingDirty && !saving
              ? 'bg-gradient-to-r from-aura-indigo to-aura-accent text-white shadow-[0_0_16px_rgba(129,140,248,0.2)] hover:opacity-90'
              : 'bg-white/[0.04] text-aura-muted/40 cursor-not-allowed border border-white/[0.05]',
          )}
        >
          {saving
            ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
            : isAnythingDirty
            ? <><Save size={12} /> Save Course</>
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
  const [searchQuery,    setSearchQuery]    = useState('')
  const [filterCourseId, setFilterCourseId] = useState<number | null>(null)
  const { entities: allCourses } = useEntities('courses')
  const { entities, loading, refresh, total, withImages } = useEntities(
    selectedType,
    selectedType === 'lectures' ? filterCourseId : undefined,
  )

  const selectedEntity = selectedId != null
    ? entities.find(e => e.id === selectedId) ?? null
    : null

  useEffect(() => {
    if (!supportsImage(selectedType) || selectedType === 'courses') setInnerTab('fields')
  }, [selectedType])

  function handleTypeChange(t: EntityType) {
    setSelectedType(t)
    setSelectedId(null)
    setImageFilter(null)
    setSearchQuery('')
    setFilterCourseId(null)
  }

  function toggleFilter(f: 'missing') {
    const next = imageFilter === f ? null : f
    setImageFilter(next)
    if (next === 'missing' && selectedId != null) {
      const selected = entities.find(e => e.id === selectedId)
      if (selected?.hasImage) setSelectedId(null)
    }
  }

  const showImageTab  = supportsImage(selectedType)
  const missingImages = showImageTab ? total - withImages : 0
  const coveragePct   = showImageTab && total > 0 ? Math.round((withImages / total) * 100) : null

  const filteredByImage = imageFilter === 'missing'
    ? entities.filter(e => !e.hasImage)
    : entities
  const displayEntities = searchQuery.trim()
    ? filteredByImage.filter(e => {
        const q    = searchQuery.toLowerCase()
        const name = entityDisplayName(e, selectedType).toLowerCase()
        const heb  = String(e.hebrewName ?? e.hebrew_name ?? '').toLowerCase()
        return name.includes(q) || heb.includes(q)
      })
    : filteredByImage

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

      {/* Search bar */}
      <div className="relative">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setSelectedId(null) }}
          placeholder={`Search ${ENTITY_TYPES[selectedType].label.toLowerCase()}…`}
          className="w-full pl-8 pr-8 py-2 rounded-xl bg-black/20 border border-white/[0.08] text-sm text-aura-text
                     placeholder-aura-muted/40 focus:outline-none focus:border-aura-accent/40 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setSelectedId(null) }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-aura-muted hover:text-aura-text"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Course filter (lectures only) */}
      {selectedType === 'lectures' && (
        <div className="relative">
          <select
            value={filterCourseId ?? ''}
            onChange={e => { setFilterCourseId(e.target.value ? Number(e.target.value) : null); setSelectedId(null) }}
            className="w-full appearance-none bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text pr-8 focus:outline-none focus:border-aura-accent/40"
          >
            <option value="">— all courses —</option>
            {allCourses.map(c => (
              <option key={c.id as number} value={c.id as number}>{c.title as string}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
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
          {searchQuery && (
            <span className="ml-1 text-[9px] font-semibold text-aura-accent bg-aura-accent/10 px-1.5 py-0.5 rounded-full border border-aura-accent/20">
              {displayEntities.length} result{displayEntities.length !== 1 ? 's' : ''}
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
                    {selectedType === 'courses' ? (
                      <InlineCourseEditor entity={selectedEntity} onSaved={refresh} />
                    ) : (
                      <EntityEditForm
                        type={selectedType}
                        entity={selectedEntity}
                        onSaved={refresh}
                      />
                    )}
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
  const [courseId,  setCourseId]  = useState<number | null>(null)
  const [values,    setValues]    = useState<Record<string, unknown>>({})
  const [dirty,     setDirty]     = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [subjects,  setSubjects]  = useState<SubjectOption[]>([])
  const [yearText,  setYearText]  = useState('')
  const [placeText, setPlaceText] = useState('')
  const [metaDirty, setMetaDirty] = useState(false)

  const course = courseId != null ? entities.find(c => c.id === courseId) ?? null : null

  // Load subjects once
  useEffect(() => {
    fetch('/api/subjects')
      .then(r => r.json())
      .then(d => setSubjects(d.subjects ?? []))
      .catch(console.error)
  }, [])

  // Load course fields + meta when course changes
  useEffect(() => {
    if (!course) return
    setValues(Object.fromEntries(FIELD_MAP.courses.map(f => [f.key, course[f.key] ?? null])))
    setDirty(false)
    setMetaDirty(false)
    fetch(`/api/courses/meta?courseId=${course.id as number}`)
      .then(r => r.json())
      .then(d => {
        setYearText((d.years  ?? []).map((y: { value: number }) => String(y.value)).join(', '))
        setPlaceText((d.places ?? []).map((p: { value: string }) => p.value).join(', '))
      })
      .catch(console.error)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id])

  async function handleSave() {
    if (!courseId) return
    setSaving(true)
    try {
      const courseBody: Record<string, unknown> = {
        title:         values.title,
        description:   values.description,
        course_r2_url: values.course_r2_url,
        r2_dir:        values.r2_dir,
        subjectId:     values.subject_id != null ? Number(values.subject_id) : null,
      }
      const r1 = await fetch(`/api/courses/${courseId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(courseBody),
      })
      if (!r1.ok) throw new Error((await r1.json()).error ?? 'Save failed')

      if (metaDirty) {
        const years  = yearText.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
        const places = placeText.split(',').map(s => s.trim()).filter(Boolean)
        const r2 = await fetch('/api/courses/meta', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ courseId, years, places }),
        })
        if (!r2.ok) throw new Error((await r2.json()).error ?? 'Meta save failed')
      }

      setDirty(false)
      setMetaDirty(false)
      success('Saved', 'Course updated.')
      refresh()
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const isAnythingDirty = dirty || metaDirty

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

          {/* Subject */}
          <div>
            <label className="text-xs font-medium text-aura-text mb-1.5 block">Subject</label>
            <div className="relative">
              <select
                value={String(values.subject_id ?? '')}
                onChange={e => {
                  setValues(p => ({ ...p, subject_id: e.target.value ? Number(e.target.value) : null }))
                  setDirty(true)
                }}
                disabled={saving}
                className="w-full appearance-none bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text pr-8 focus:outline-none focus:border-aura-accent/40 disabled:opacity-40"
              >
                <option value="">— no subject —</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name_en}{s.name_he ? ` / ${s.name_he}` : ''}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
            </div>
          </div>

          {/* Year */}
          <div>
            <label className="text-xs font-medium text-aura-text mb-1.5 block">Year(s)</label>
            <input
              type="text"
              value={yearText}
              onChange={e => { setYearText(e.target.value); setMetaDirty(true) }}
              disabled={saving}
              placeholder="e.g. 2019 or 2018, 2019"
              className="w-full bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text placeholder-aura-muted/40 focus:outline-none focus:border-aura-accent/40 disabled:opacity-40"
            />
          </div>

          {/* Place */}
          <div>
            <label className="text-xs font-medium text-aura-text mb-1.5 block">Place(s)</label>
            <input
              type="text"
              value={placeText}
              onChange={e => { setPlaceText(e.target.value); setMetaDirty(true) }}
              disabled={saving}
              placeholder="e.g. Tel Aviv or Tel Aviv, Jerusalem"
              className="w-full bg-black/20 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-aura-text placeholder-aura-muted/40 focus:outline-none focus:border-aura-accent/40 disabled:opacity-40"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={!isAnythingDirty || saving}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all mt-1',
              isAnythingDirty && !saving
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
      const vals = Object.fromEntries(FIELD_MAP.lectures.map(f => [f.key, lecture[f.key] ?? null]))
      // Normalize date to DD.MM.YYYY (handles stored DD/MM/YYYY or ISO YYYY-MM-DD)
      if (typeof vals.date === 'string' && vals.date) {
        const iso = (vals.date as string).match(/^(\d{4})-(\d{2})-(\d{2})$/)
        vals.date = iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : (vals.date as string).replace(/\//g, '.')
      }
      setValues(vals)
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
// LectureEntityEditor — toggle discussed/mentioned for lecture entity links
// ─────────────────────────────────────────────────────────────────────────────

const LECTURE_ENTITY_CATEGORIES = Object.keys(JUNCTION_MAP) as EntityType[]

interface LectureEntityRow {
  junctionId:       number
  entityId:         number
  displayName:      string
  hebrewName:       string | null
  relationshipType: 'discussed' | 'mentioned'
}

type CategoryState = { rows: LectureEntityRow[]; loading: boolean }

function emptyCategories(): Record<EntityType, CategoryState> {
  return Object.fromEntries(
    LECTURE_ENTITY_CATEGORIES.map(cat => [cat, { rows: [], loading: false }])
  ) as unknown as Record<EntityType, CategoryState>
}

export function LectureEntityEditor() {
  const { entities: courses, loading: coursesLoading } = useEntities('courses')
  const { error: toastError }                          = useToast()

  const [courseId,        setCourseId]        = useState<number | null>(null)
  const [lectureId,       setLectureId]       = useState<number | null>(null)
  const [lectures,        setLectures]        = useState<EntityRow[]>([])
  const [lecturesLoading, setLecturesLoading] = useState(false)
  const [catData,         setCatData]         = useState<Record<EntityType, CategoryState>>(emptyCategories)

  // Load lectures when course changes
  useEffect(() => {
    if (courseId == null) { setLectures([]); setLectureId(null); return }
    setLecturesLoading(true)
    fetch(`/api/entities/lectures?courseId=${courseId}&all=true`)
      .then(r => r.json())
      .then(d => setLectures(Array.isArray(d) ? d : (d.entities ?? [])))
      .finally(() => setLecturesLoading(false))
  }, [courseId])

  // Fetch all categories when lecture changes
  useEffect(() => {
    if (lectureId == null) { setCatData(emptyCategories()); return }
    setCatData(Object.fromEntries(
      LECTURE_ENTITY_CATEGORIES.map(cat => [cat, { rows: [], loading: true }])
    ) as unknown as Record<EntityType, CategoryState>)
    for (const cat of LECTURE_ENTITY_CATEGORIES) {
      fetch(`/api/lecture-entities?lectureId=${lectureId}&category=${cat}`)
        .then(r => r.json())
        .then(d => setCatData(prev => ({ ...prev, [cat]: { rows: d.entities ?? [], loading: false } })))
        .catch(()  => setCatData(prev => ({ ...prev, [cat]: { rows: [],            loading: false } })))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId])

  async function toggleRel(cat: EntityType, row: LectureEntityRow) {
    const newRel = row.relationshipType === 'discussed' ? 'mentioned' : 'discussed'
    // Optimistic update
    setCatData(prev => ({
      ...prev,
      [cat]: { ...prev[cat], rows: prev[cat].rows.map(r => r.junctionId === row.junctionId ? { ...r, relationshipType: newRel } : r) },
    }))
    try {
      const res = await fetch('/api/lecture-entities', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ junctionId: row.junctionId, category: cat, relationshipType: newRel }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Update failed')
    } catch (e) {
      // Revert on error
      setCatData(prev => ({
        ...prev,
        [cat]: { ...prev[cat], rows: prev[cat].rows.map(r => r.junctionId === row.junctionId ? { ...r, relationshipType: row.relationshipType } : r) },
      }))
      toastError('Update failed', e instanceof Error ? e.message : String(e))
    }
  }

  const anyLoading  = LECTURE_ENTITY_CATEGORIES.some(cat => catData[cat].loading)
  const anyEntities = LECTURE_ENTITY_CATEGORIES.some(cat => catData[cat].rows.length > 0)

  return (
    <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">🔗</span>
        <h3 className="text-sm font-bold text-aura-text">Lecture Entities</h3>
      </div>

      {/* Course picker */}
      <div className="relative">
        {coursesLoading ? (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-black/20 border border-white/[0.08]">
            <Loader2 size={12} className="animate-spin text-aura-muted" />
            <span className="text-xs text-aura-muted">Loading courses…</span>
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
              <Loader2 size={12} className="animate-spin text-aura-muted" />
              <span className="text-xs text-aura-muted">Loading lectures…</span>
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

      {/* Entity category sections */}
      {lectureId != null && (
        <div className="space-y-2">
          {LECTURE_ENTITY_CATEGORIES.map(cat => {
            const { rows, loading } = catData[cat]
            if (!loading && rows.length === 0) return null
            const tc        = ENTITY_TYPES[cat]
            const discussed = rows.filter(r => r.relationshipType === 'discussed').length
            return (
              <div key={cat} className="rounded-xl border border-white/[0.07] overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] border-b border-white/[0.05]">
                  <span className="text-sm">{tc.icon}</span>
                  <span className="text-xs font-semibold text-aura-text">{tc.label}</span>
                  {!loading && (
                    <span className="ml-auto text-[10px] text-aura-muted">
                      {discussed}/{rows.length} discussed
                    </span>
                  )}
                </div>
                {loading ? (
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <Loader2 size={11} className="animate-spin text-aura-muted" />
                    <span className="text-xs text-aura-muted">Loading…</span>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {rows.map(row => (
                      <div
                        key={row.junctionId}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-aura-text truncate">{row.displayName}</p>
                          {row.hebrewName && (
                            <p className="text-[10px] text-aura-muted truncate" dir="rtl">{row.hebrewName}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleRel(cat, row)}
                          className={clsx(
                            'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all',
                            row.relationshipType === 'discussed'
                              ? 'bg-aura-success/10 border-aura-success/30 text-aura-success hover:bg-aura-success/20'
                              : 'bg-white/[0.03] border-white/[0.10] text-aura-muted hover:border-white/[0.20] hover:text-aura-text',
                          )}
                        >
                          {row.relationshipType}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {!anyLoading && !anyEntities && (
            <div className="rounded-xl border border-white/[0.06] py-6 flex items-center justify-center">
              <p className="text-xs text-aura-muted">No entities linked to this lecture</p>
            </div>
          )}
        </div>
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
      <LectureEntityEditor />
    </div>
  )
}