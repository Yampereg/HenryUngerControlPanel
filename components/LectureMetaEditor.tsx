'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Plus, X } from 'lucide-react'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Course   { id: number; title: string }
interface Lecture  { id: number; title: string; orderInCourse: number }

// ---------------------------------------------------------------------------
// Tag chip (reusable for places / years)
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function LectureMetaEditor() {
  const { success, error: toastError } = useToast()

  const [courses,        setCourses]        = useState<Course[]>([])
  const [lectures,       setLectures]       = useState<Lecture[]>([])
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null)
  const [selectedLec,    setSelectedLec]    = useState<number | null>(null)

  const [date,    setDate]    = useState('')
  const [places,  setPlaces]  = useState<string[]>([])
  const [years,   setYears]   = useState<string[]>([])   // kept as strings for the tag input

  const [loadingMeta, setLoadingMeta] = useState(false)
  const [saving,      setSaving]      = useState(false)

  // ── Load courses ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/courses')
      .then(r => r.json())
      .then(d => setCourses((d.courses ?? []).map((c: { id: number; title: string }) => ({ id: c.id, title: c.title }))))
      .catch(() => {})
  }, [])

  // ── Load lectures for selected course ─────────────────────────────────────
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

  // ── Load meta for selected lecture ────────────────────────────────────────
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

  // ── Save ──────────────────────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-4">
      <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
        Lecture Date · Places · Years
      </p>

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
            {/* Date */}
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

            {/* Places */}
            <div>
              <label className="block text-[11px] text-aura-muted uppercase tracking-wider mb-1.5">
                Places <span className="normal-case font-normal opacity-60">(Enter or comma to add · optional)</span>
              </label>
              <TagInput
                values={places}
                onChange={setPlaces}
                placeholder="Add a place…"
              />
            </div>

            {/* Years */}
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

            {/* Save */}
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
