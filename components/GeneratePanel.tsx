'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, ChevronDown, FileText, Layers, Loader2,
  RefreshCw, Sparkles, Tag, Users, X, Check, Plus, Minus,
} from 'lucide-react'
import clsx from 'clsx'
import { useToast } from './ToastProvider'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type GenerateType =
  | 'lecture_title'
  | 'lecture_synopsis'
  | 'course_synopsis'
  | 'entities'
  | 'entity_desc'
  | 'summary_pdf'

interface Course   { id: number; title: string; r2_dir: string | null }
interface Lecture  { id: number; title: string; order_in_course: number; course_id: number }
interface EntityRow{ id: number; name: string }

type Phase = 'idle' | 'generating' | 'preview' | 'confirming' | 'done'

const ENTITY_TYPES = [
  'directors','films','writers','books',
  'painters','paintings','philosophers','themes',
] as const
type EntityType = typeof ENTITY_TYPES[number]

const ENTITY_LABELS: Record<EntityType, string> = {
  directors: 'Directors', films: 'Films', writers: 'Writers', books: 'Books',
  painters: 'Painters', paintings: 'Paintings', philosophers: 'Philosophers', themes: 'Themes',
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function Select({
  value, onChange, placeholder, disabled, children,
}: {
  value: string; onChange: (v: string) => void; placeholder: string
  disabled?: boolean; children: React.ReactNode
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={clsx(
          'w-full appearance-none bg-black/30 border border-white/[0.08] rounded-xl',
          'px-3 py-2.5 pr-8 text-sm text-aura-text focus:outline-none',
          'focus:border-aura-accent/40 transition-colors',
          disabled && 'opacity-40 cursor-not-allowed',
        )}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-aura-muted pointer-events-none" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entity diff display
// ---------------------------------------------------------------------------
interface EntityDiff {
  added:   string[]
  removed: string[]
  kept:    string[]
}

function computeDiff(
  current: Record<string, { discussed: string[]; mentioned: string[] }>,
  extracted: Record<string, { discussed: string[]; mentioned: string[] }>,
): Record<EntityType, EntityDiff> {
  const result = {} as Record<EntityType, EntityDiff>
  for (const et of ENTITY_TYPES) {
    const currentAll  = [...(current[et]?.discussed ?? []), ...(current[et]?.mentioned ?? [])]
    const extractAll  = [...(extracted[et]?.discussed ?? []), ...(extracted[et]?.mentioned ?? [])]
    const currentSet  = new Set(currentAll.map(n => n.toLowerCase()))
    const extractSet  = new Set(extractAll.map(n => n.toLowerCase()))
    result[et] = {
      added:   extractAll.filter(n => !currentSet.has(n.toLowerCase())),
      removed: currentAll.filter(n => !extractSet.has(n.toLowerCase())),
      kept:    currentAll.filter(n => extractSet.has(n.toLowerCase())),
    }
  }
  return result
}

function EntityDiffView({ diff }: { diff: Record<EntityType, EntityDiff> }) {
  const hasChanges = ENTITY_TYPES.some(et => diff[et].added.length > 0 || diff[et].removed.length > 0)
  if (!hasChanges) {
    return <p className="text-sm text-aura-muted italic">No differences found — extracted list matches current.</p>
  }
  return (
    <div className="space-y-3">
      {ENTITY_TYPES.map(et => {
        const { added, removed } = diff[et]
        if (!added.length && !removed.length) return null
        return (
          <div key={et}>
            <p className="text-[10px] uppercase tracking-widest text-aura-muted mb-1.5">
              {ENTITY_LABELS[et]}
            </p>
            <div className="space-y-1">
              {added.map(n => (
                <div key={`+${n}`} className="flex items-center gap-1.5 text-sm text-aura-success">
                  <Plus size={12} className="shrink-0" />
                  <span>{n}</span>
                </div>
              ))}
              {removed.map(n => (
                <div key={`-${n}`} className="flex items-center gap-1.5 text-sm text-aura-error">
                  <Minus size={12} className="shrink-0" />
                  <span>{n}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Before / after card
// ---------------------------------------------------------------------------
function BeforeAfter({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-aura-muted mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-black/20 border border-white/[0.05] p-3">
          <p className="text-[10px] text-aura-muted mb-1.5">Before</p>
          <p className="text-sm text-aura-text/70 leading-relaxed whitespace-pre-wrap">
            {before || <span className="italic text-aura-muted/50">empty</span>}
          </p>
        </div>
        <div className="rounded-xl bg-aura-accent/[0.04] border border-aura-accent/20 p-3">
          <p className="text-[10px] text-aura-accent mb-1.5">After</p>
          <p className="text-sm text-aura-text leading-relaxed whitespace-pre-wrap">{after}</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function GeneratePanel() {
  const { success, error: showError } = useToast()

  // ── selection state ──────────────────────────────────────────────────────
  const [genType,    setGenType]    = useState<GenerateType>('lecture_title')
  const [courses,    setCourses]    = useState<Course[]>([])
  const [courseId,   setCourseId]   = useState('')
  const [lectures,   setLectures]   = useState<Lecture[]>([])
  const [lectureId,  setLectureId]  = useState('')
  const [entityType, setEntityType] = useState<EntityType>('directors')
  const [entities,   setEntities]   = useState<EntityRow[]>([])
  const [entityId,   setEntityId]   = useState('')

  // ── result state ─────────────────────────────────────────────────────────
  const [phase,   setPhase]   = useState<Phase>('idle')
  const [result,  setResult]  = useState<Record<string, unknown> | null>(null)
  const [pdfJob,  setPdfJob]  = useState<{ id: number; status: string } | null>(null)

  // ── load courses on mount ─────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/courses/managed')
      .then(r => r.json())
      .then(d => setCourses(d.courses ?? []))
      .catch(console.error)
  }, [])

  // ── load lectures when course changes ────────────────────────────────────
  useEffect(() => {
    setLectureId('')
    setLectures([])
    if (!courseId) return
    fetch(`/api/lectures?courseId=${courseId}`)
      .then(r => r.json())
      .then(d => setLectures(d.lectures ?? []))
      .catch(console.error)
  }, [courseId])

  // ── load entities when type changes ──────────────────────────────────────
  useEffect(() => {
    setEntityId('')
    setEntities([])
    if (!needsEntity(genType)) return
    fetch(`/api/entities/${entityType}?all=true`)
      .then(r => r.json())
      .then(d => {
        const rows = (d.entities ?? []).map((e: { id: number; displayName: string }) => ({
          id: e.id, name: e.displayName,
        }))
        setEntities(rows)
      })
      .catch(console.error)
  }, [entityType, genType])

  // ── poll PDF job status ───────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfJob || pdfJob.status === 'done' || pdfJob.status === 'failed') return
    const timer = setInterval(async () => {
      const r = await fetch(`/api/generate/pdf-status?lectureId=${lectureId}`)
      const d = await r.json()
      if (d.job) setPdfJob(d.job)
    }, 4000)
    return () => clearInterval(timer)
  }, [pdfJob, lectureId])

  // ── helpers ───────────────────────────────────────────────────────────────
  function needsCourse(t: GenerateType) { return t !== 'entity_desc' }
  function needsLecture(t: GenerateType) { return !['course_synopsis', 'entity_desc'].includes(t) }
  function needsEntity(t: GenerateType)  { return t === 'entity_desc' }

  function isReady() {
    if (needsLecture(genType) && !lectureId) return false
    if (needsCourse(genType) && !needsLecture(genType) && !courseId) return false
    if (needsEntity(genType) && !entityId) return false
    return true
  }

  function resetResult() {
    setPhase('idle')
    setResult(null)
    setPdfJob(null)
  }

  // ── generate ─────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!isReady()) return
    setPhase('generating')
    setResult(null)
    setPdfJob(null)
    try {
      const body: Record<string, unknown> = { type: genType }
      if (lectureId) body.lectureId = Number(lectureId)
      if (courseId && !lectureId) body.courseId = Number(courseId)
      if (courseId && needsCourse(genType) && !needsLecture(genType)) body.courseId = Number(courseId)
      if (needsEntity(genType)) { body.entityType = entityType; body.entityId = Number(entityId) }

      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Generation failed')

      if (genType === 'summary_pdf') {
        setPdfJob({ id: data.jobId, status: 'pending' })
        setPhase('preview')
        return
      }

      setResult(data)
      setPhase('preview')
    } catch (err) {
      showError('Generation failed', err instanceof Error ? err.message : String(err))
      setPhase('idle')
    }
  }

  // ── confirm ───────────────────────────────────────────────────────────────
  async function handleConfirm(action: 'confirm' | 'accept_replace' | 'accept_new_only' | 'decline') {
    if (action === 'decline') { resetResult(); return }
    setPhase('confirming')
    try {
      const body: Record<string, unknown> = {
        type: genType, action, data: result,
      }
      if (lectureId) body.lectureId = Number(lectureId)
      if (courseId)  body.courseId  = Number(courseId)
      if (needsEntity(genType)) { body.entityType = entityType; body.entityId = Number(entityId) }

      const res = await fetch('/api/generate/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Confirm failed')

      success('Saved', 'Changes applied successfully.')
      setPhase('done')
      setTimeout(resetResult, 1500)
    } catch (err) {
      showError('Failed to save', err instanceof Error ? err.message : String(err))
      setPhase('preview')
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  const GEN_TYPES: { id: GenerateType; label: string; icon: React.ReactNode }[] = [
    { id: 'lecture_title',    label: 'Lecture Title',    icon: <Tag size={12} />      },
    { id: 'lecture_synopsis', label: 'Lecture Synopsis', icon: <FileText size={12} /> },
    { id: 'course_synopsis',  label: 'Course Synopsis',  icon: <BookOpen size={12} /> },
    { id: 'entities',         label: 'Entities',         icon: <Users size={12} />    },
    { id: 'entity_desc',      label: 'Entity Desc',      icon: <Layers size={12} />   },
    { id: 'summary_pdf',      label: 'Summary PDF',      icon: <FileText size={12} /> },
  ]

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="glass rounded-2xl p-4 border border-white/[0.07]">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-aura-accent" />
          <h2 className="text-sm font-semibold text-aura-text">Generate</h2>
        </div>

        {/* Type pills */}
        <p className="text-[10px] uppercase tracking-widest text-aura-muted mb-2">What to generate</p>
        <div className="flex flex-wrap gap-1.5">
          {GEN_TYPES.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => { setGenType(id); resetResult() }}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                genType === id
                  ? 'bg-aura-accent/15 text-aura-accent border border-aura-accent/30'
                  : 'bg-black/20 text-aura-muted border border-white/[0.05] hover:text-aura-text',
              )}
            >
              {icon}{label}
            </button>
          ))}
        </div>
      </div>

      {/* Target selection */}
      <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-aura-muted">Select target</p>

        {/* Course picker */}
        {needsCourse(genType) && (
          <Select value={courseId} onChange={v => { setCourseId(v); setCourseId(v) }} placeholder="Select course…">
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
        )}

        {/* Lecture picker */}
        {needsLecture(genType) && (
          <Select value={lectureId} onChange={setLectureId} placeholder="Select lecture…" disabled={!courseId}>
            {lectures.map(l => (
              <option key={l.id} value={l.id}>Lecture {l.order_in_course} — {l.title}</option>
            ))}
          </Select>
        )}

        {/* Entity type + entity picker */}
        {needsEntity(genType) && (
          <>
            <Select value={entityType} onChange={v => setEntityType(v as EntityType)} placeholder="Entity type…">
              {ENTITY_TYPES.map(et => <option key={et} value={et}>{ENTITY_LABELS[et]}</option>)}
            </Select>
            <Select value={entityId} onChange={setEntityId} placeholder="Select entity…" disabled={!entities.length}>
              {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!isReady() || phase === 'generating' || phase === 'confirming'}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
            isReady() && phase === 'idle'
              ? 'bg-gradient-to-r from-aura-accent to-aura-indigo text-aura-base shadow-[0_0_20px_rgba(34,211,238,0.25)]'
              : 'bg-white/[0.04] text-aura-muted border border-white/[0.05]',
          )}
        >
          {phase === 'generating' ? (
            <><Loader2 size={14} className="animate-spin" /> Generating…</>
          ) : (
            <><Sparkles size={14} /> Generate</>
          )}
        </button>
      </div>

      {/* Results */}
      <AnimatePresence>
        {phase === 'preview' && result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass rounded-2xl p-4 border border-aura-accent/20 space-y-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-aura-accent">Results</p>
              <button onClick={resetResult} className="text-aura-muted"><X size={14} /></button>
            </div>

            {/* Title / synopsis / course synopsis / entity desc — before/after */}
            {(genType === 'lecture_title' || genType === 'lecture_synopsis' ||
              genType === 'course_synopsis' || genType === 'entity_desc') && (
              <BeforeAfter
                label={genType === 'lecture_title' ? 'Title' : genType === 'lecture_synopsis' ? 'Synopsis' : genType === 'course_synopsis' ? 'Course Description' : 'Entity Description'}
                before={String(result.before ?? '')}
                after={String(result.after ?? '')}
              />
            )}

            {/* Entity diff */}
            {genType === 'entities' && (() => {
              const current   = result.current   as Record<string, { discussed: string[]; mentioned: string[] }>
              const extracted = result.extracted as Record<string, { discussed: string[]; mentioned: string[] }>
              const diff = computeDiff(current, extracted)
              return <EntityDiffView diff={diff} />
            })()}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-1 border-t border-white/[0.06]">
              {genType === 'entities' ? (
                <>
                  <button onClick={() => handleConfirm('accept_replace')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-aura-accent/10 border border-aura-accent/30 text-aura-accent text-xs font-semibold">
                    <Check size={12} /> Accept &amp; Replace
                  </button>
                  <button onClick={() => handleConfirm('accept_new_only')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-aura-text text-xs font-semibold">
                    <Plus size={12} /> Accept New Only
                  </button>
                  <button onClick={() => handleConfirm('decline')}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-aura-error/10 border border-aura-error/30 text-aura-error text-xs font-semibold">
                    <X size={12} /> Decline
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => handleConfirm('confirm')}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl',
                      'bg-aura-accent/10 border border-aura-accent/30 text-aura-accent text-xs font-semibold',
                      phase === 'confirming' && 'opacity-60 pointer-events-none',
                    )}>
                    {phase === 'confirming'
                      ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
                      : <><Check size={12} /> Confirm</>}
                  </button>
                  <button onClick={() => handleConfirm('decline')}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-aura-error/10 border border-aura-error/30 text-aura-error text-xs font-semibold">
                    <X size={12} /> Decline
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* PDF queued */}
        {phase === 'preview' && genType === 'summary_pdf' && pdfJob && (
          <motion.div
            key="pdf-status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass rounded-2xl p-4 border border-white/[0.08]"
          >
            <div className="flex items-center gap-2">
              {pdfJob.status === 'done'
                ? <Check size={14} className="text-aura-success" />
                : pdfJob.status === 'failed'
                  ? <X size={14} className="text-aura-error" />
                  : <Loader2 size={14} className="animate-spin text-aura-accent" />}
              <span className="text-sm text-aura-text">
                PDF regeneration:{' '}
                <span className={clsx(
                  'font-semibold',
                  pdfJob.status === 'done' ? 'text-aura-success' :
                  pdfJob.status === 'failed' ? 'text-aura-error' : 'text-aura-accent',
                )}>
                  {pdfJob.status}
                </span>
              </span>
              {(pdfJob.status === 'done' || pdfJob.status === 'failed') && (
                <button onClick={resetResult} className="ml-auto text-aura-muted"><X size={14} /></button>
              )}
            </div>
            {pdfJob.status !== 'done' && pdfJob.status !== 'failed' && (
              <p className="text-xs text-aura-muted mt-1.5">
                The Transcriber daemon will pick this up within a few seconds.
              </p>
            )}
          </motion.div>
        )}

        {/* Done flash */}
        {phase === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="glass rounded-2xl p-4 border border-aura-success/30 flex items-center gap-2"
          >
            <Check size={16} className="text-aura-success" />
            <span className="text-sm font-semibold text-aura-success">Changes saved!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
