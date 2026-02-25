'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

interface Course  { id: number; title: string }
interface Lecture { id: number; title: string; orderInCourse: number }

export function LectureMetaEditor() {
  const { success, error: toastError } = useToast()

  const [courses,        setCourses]        = useState<Course[]>([])
  const [lectures,       setLectures]       = useState<Lecture[]>([])
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null)
  const [selectedLec,    setSelectedLec]    = useState<number | null>(null)

  const [date,        setDate]        = useState('')
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
    } catch { /* silent */ } finally {
      setLoadingMeta(false)
    }
  }, [])

  useEffect(() => {
    if (selectedLec) loadMeta(selectedLec)
    else setDate('')
  }, [selectedLec, loadMeta])

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!selectedLec) return
    setSaving(true)
    try {
      const res = await fetch('/api/lectures/meta', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lectureId: selectedLec, date: date.trim() || null }),
      })
      if (!res.ok) throw new Error('Save failed')
      success('Saved', 'Lecture date updated successfully.')
    } catch (e) {
      toastError('Failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-4">
      <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
        Lecture Date
      </p>

      {/* Course selector */}
      <div>
        <label className="block text-[11px] text-aura-muted uppercase tracking-wider mb-1.5">Course</label>
        <select
          value={selectedCourse ?? ''}
          onChange={e => setSelectedCourse(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]
                     text-sm text-aura-text focus:outline-none focus:border-aura-accent/40 transition-colors"
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
                       text-sm text-aura-text focus:outline-none focus:border-aura-accent/40 transition-colors"
          >
            <option value="">— select lecture —</option>
            {lectures.map(l => (
              <option key={l.id} value={l.id}>{l.orderInCourse}. {l.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* Date field */}
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

            <button
              onClick={handleSave}
              disabled={saving}
              className={clsx(
                'w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2',
                'bg-gradient-to-r from-aura-accent to-aura-indigo text-aura-base',
                'hover:opacity-90 active:scale-[0.98] transition-all duration-200',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {saving
                ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
                : <><Check size={12} /> Save Date</>
              }
            </button>
          </div>
        )
      )}
    </div>
  )
}