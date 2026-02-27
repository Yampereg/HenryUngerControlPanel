'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  FolderOpen,
  Loader2,
  RefreshCw,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface R2Dir         { dir: string; lectureCount: number; defaultTitle: string }
interface Subject       { id: number; nameEn: string; nameHe: string }
interface ManagedCourse { id: number; title: string; r2Dir: string; subjectId: number | null; lectureCount: number; r2LectureCount: number | null }
interface LectureItem   {
  lectureNumber: number
  status:        'none' | 'pending' | 'running' | 'succeeded' | 'failed'
  jobId:         number | null
}
interface ActiveJob     { courseId: number; courseTitle: string; lectureNumber: number; status: string; startedAt: string | null }
interface LastCompleted { courseId: number; courseTitle: string; lectureNumber: number; status: string; completedAt: string | null }
interface UploadStatusData {
  active:             ActiveJob[]
  lastCompleted:      LastCompleted | null
  succeededPerCourse: Record<number, number>
}

type Phase = 'loading' | 'home' | 'form' | 'manage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatRelative(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString()
}

/** Elapsed time since a given ISO string, updated every second via a live clock. */
function useElapsed(startedAt: string | null): string {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  if (!startedAt) return ''
  const secs  = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  const m     = Math.floor(secs / 60)
  const s     = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: LectureItem['status'] }) {
  if (status === 'none') return null
  const cfg = {
    pending:   { label: 'queued',      cls: 'text-aura-muted bg-white/[0.05] border-white/[0.08]' },
    running:   { label: 'in progress', cls: 'text-aura-accent bg-aura-accent/10 border-aura-accent/20' },
    succeeded: { label: 'done',        cls: 'text-aura-success bg-aura-success/10 border-aura-success/20' },
    failed:    { label: 'failed',      cls: 'text-aura-error bg-aura-error/10 border-aura-error/20' },
  }[status]
  return (
    <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Active job row with live elapsed timer
// ---------------------------------------------------------------------------
function ActiveJobRow({ job }: { job: ActiveJob }) {
  const elapsed = useElapsed(job.status === 'running' ? job.startedAt : null)

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Loader2
        size={12}
        className={clsx(
          'shrink-0',
          job.status === 'running' ? 'animate-spin text-aura-accent' : 'text-aura-muted',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-aura-text truncate">{job.courseTitle}</p>
        <p className="text-[10px] text-aura-muted">
          Lecture {job.lectureNumber} · {job.status === 'running' ? 'in progress' : 'queued'}
        </p>
      </div>
      {job.status === 'running' && elapsed && (
        <div className="flex items-center gap-1 shrink-0 text-[10px] text-aura-accent font-mono">
          <Clock size={10} />
          {elapsed}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function CourseUploader() {
  const { success, error: toastError } = useToast()

  const [phase,           setPhase]           = useState<Phase>('loading')
  const [dirs,            setDirs]            = useState<R2Dir[]>([])
  const [subjects,        setSubjects]        = useState<Subject[]>([])
  const [managedCourses,  setManagedCourses]  = useState<ManagedCourse[]>([])
  const [uploadStatus,    setUploadStatus]    = useState<UploadStatusData | null>(null)
  const [selectedDir,     setSelectedDir]     = useState<R2Dir | null>(null)
  const [title,           setTitle]           = useState('')
  const [subjectId,       setSubjectId]       = useState<number | null>(null)
  const [submitting,      setSubmitting]      = useState(false)
  const [currentCourse,   setCurrentCourse]   = useState<ManagedCourse | null>(null)
  const [lectures,        setLectures]        = useState<LectureItem[]>([])
  const [queuingLecture,    setQueuingLecture]    = useState<number | null>(null)
  const [queuingAll,        setQueuingAll]        = useState(false)
  const [cancellingLecture, setCancellingLecture] = useState<number | null>(null)
  const [loadingLectures,   setLoadingLectures]   = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // -------------------------------------------------------------------------
  // Poll upload status (global queue)
  // -------------------------------------------------------------------------
  const fetchUploadStatus = useCallback(async () => {
    try {
      const res  = await fetch('/api/upload-jobs')
      const data = await res.json()
      setUploadStatus(data)

      // Refresh managed courses so upload count stays in sync
      const mRes  = await fetch('/api/courses/managed')
      const mData = await mRes.json()
      if (mData.courses) {
        setManagedCourses(
          mData.courses.map((c: {
            id: number; title: string; r2_dir: string; subject_id: number | null
            lecture_count: number; r2_lecture_count: number | null
          }) => ({
            id: c.id, title: c.title, r2Dir: c.r2_dir, subjectId: c.subject_id,
            lectureCount: c.lecture_count, r2LectureCount: c.r2_lecture_count,
          })),
        )
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    pollRef.current = setInterval(fetchUploadStatus, 5_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchUploadStatus])

  // -------------------------------------------------------------------------
  // Load home data
  // -------------------------------------------------------------------------
  const loadHome = useCallback(async () => {
    setPhase('loading')
    try {
      const [dirsRes, subjectsRes, managedRes, statusRes] = await Promise.all([
        fetch('/api/r2-dirs').then(r => r.json()),
        fetch('/api/subjects').then(r => r.json()),
        fetch('/api/courses/managed').then(r => r.json()),
        fetch('/api/upload-jobs').then(r => r.json()),
      ])

      setDirs(
        (dirsRes.dirs ?? []).map((d: { dir: string; lectureCount: number; defaultTitle: string }) => d),
      )
      setSubjects(
        (subjectsRes.subjects ?? []).map((s: { id: number; name_en: string; name_he: string }) => ({
          id: s.id, nameEn: s.name_en, nameHe: s.name_he,
        })),
      )
      setManagedCourses(
        (managedRes.courses ?? []).map((c: {
          id: number; title: string; r2_dir: string; subject_id: number | null
          lecture_count: number; r2_lecture_count: number | null
        }) => ({
          id: c.id, title: c.title, r2Dir: c.r2_dir, subjectId: c.subject_id,
          lectureCount: c.lecture_count, r2LectureCount: c.r2_lecture_count,
        })),
      )
      setUploadStatus(statusRes)
      setPhase('home')
    } catch (e) {
      toastError('Failed', e instanceof Error ? e.message : String(e))
      setPhase('home')
    }
  }, [toastError])

  useEffect(() => { loadHome() }, [loadHome])

  // -------------------------------------------------------------------------
  // Load lectures for manage phase — uses live R2 count
  // -------------------------------------------------------------------------
  const loadLectures = useCallback(async (courseId: number) => {
    setLoadingLectures(true)
    try {
      const res  = await fetch(`/api/course-lectures?courseId=${courseId}`)
      const data = await res.json()
      setLectures(data.lectures ?? [])

      // Also refresh the r2LectureCount for this course live from the API
      const mRes  = await fetch('/api/courses/managed')
      const mData = await mRes.json()
      if (mData.courses) {
        setManagedCourses(
          mData.courses.map((c: {
            id: number; title: string; r2_dir: string; subject_id: number | null
            lecture_count: number; r2_lecture_count: number | null
          }) => ({
            id: c.id, title: c.title, r2Dir: c.r2_dir, subjectId: c.subject_id,
            lectureCount: c.lecture_count, r2LectureCount: c.r2_lecture_count,
          })),
        )
        // Update currentCourse with fresh counts
        setCurrentCourse(prev => {
          if (!prev) return prev
          const fresh = mData.courses.find((c: { id: number }) => c.id === prev.id)
          if (!fresh) return prev
          return {
            ...prev,
            lectureCount:   fresh.lecture_count,
            r2LectureCount: fresh.r2_lecture_count,
          }
        })
      }
    } catch (e) {
      toastError('Failed', e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingLectures(false)
    }
  }, [toastError])

  // -------------------------------------------------------------------------
  // Pick R2 dir → go to form
  // -------------------------------------------------------------------------
  async function handlePickDir(dir: R2Dir) {
    setSelectedDir(dir)
    setTitle(dir.defaultTitle)
    setSubjectId(null)
    setPhase('form')
  }

  // -------------------------------------------------------------------------
  // Go to manage a course
  // -------------------------------------------------------------------------
  function goToManage(course: ManagedCourse) {
    setCurrentCourse(course)
    setPhase('manage')
    loadLectures(course.id)
  }

  // -------------------------------------------------------------------------
  // Create course
  // -------------------------------------------------------------------------
  async function handleCreateCourse() {
    if (!selectedDir || !title.trim()) return
    setSubmitting(true)
    try {
      const res  = await fetch('/api/courses/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ r2Dir: selectedDir.dir, title: title.trim(), subjectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      success('Created!', `"${title.trim()}" is ready — queue lectures below.`)

      const newCourse: ManagedCourse = {
        id:             data.courseId as number,
        title:          title.trim(),
        r2Dir:          selectedDir.dir,
        subjectId,
        lectureCount:   0,
        r2LectureCount: selectedDir.lectureCount,
      }
      goToManage(newCourse)
    } catch (e) {
      toastError('Failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Queue lecture
  // -------------------------------------------------------------------------
  async function handleQueueLecture(lectureNumber: number) {
    if (!currentCourse) return
    setQueuingLecture(lectureNumber)
    try {
      const res  = await fetch('/api/upload-jobs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ courseId: currentCourse.id, lectureNumber }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setLectures(prev =>
        prev.map(l =>
          l.lectureNumber === lectureNumber
            ? { ...l, status: 'pending', jobId: data.jobId as number }
            : l,
        ),
      )
      success('Queued!', `Lecture ${lectureNumber} added to transcription queue.`)
      setTimeout(() => loadLectures(currentCourse.id), 3_000)
      setTimeout(() => loadLectures(currentCourse.id), 8_000)
    } catch (e) {
      toastError('Failed', e instanceof Error ? e.message : String(e))
    } finally {
      setQueuingLecture(null)
    }
  }

  // -------------------------------------------------------------------------
  // Cancel / dequeue a lecture
  // -------------------------------------------------------------------------
  async function handleCancelLecture(lectureNumber: number, jobId: number | null) {
    if (!jobId) return
    setCancellingLecture(lectureNumber)
    try {
      const res  = await fetch('/api/upload-jobs', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ jobId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const action = data.action as string
      setLectures(prev =>
        prev.map(l =>
          l.lectureNumber === lectureNumber
            ? { ...l, status: action === 'deleted' ? 'none' : 'failed', jobId: null }
            : l,
        ),
      )
      success(
        action === 'deleted' ? 'Removed' : 'Cancelled',
        action === 'deleted'
          ? `Lecture ${lectureNumber} removed from queue.`
          : `Lecture ${lectureNumber} marked failed — can be retried.`,
      )
    } catch (e) {
      toastError('Failed', e instanceof Error ? e.message : String(e))
    } finally {
      setCancellingLecture(null)
    }
  }

  // -------------------------------------------------------------------------
  // Queue all unqueued / failed lectures
  // -------------------------------------------------------------------------
  async function handleQueueAll() {
    if (!currentCourse || queuingAll) return
    const toQueue = lectures.filter(l => l.status === 'none' || l.status === 'failed')
    if (toQueue.length === 0) return
    setQueuingAll(true)
    let queued = 0
    for (const l of toQueue) {
      try {
        const res  = await fetch('/api/upload-jobs', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ courseId: currentCourse.id, lectureNumber: l.lectureNumber }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        queued++
        setLectures(prev =>
          prev.map(x =>
            x.lectureNumber === l.lectureNumber
              ? { ...x, status: 'pending', jobId: data.jobId as number }
              : x,
          ),
        )
      } catch { /* individual failures are silent; the row stays at its current status */ }
    }
    setQueuingAll(false)
    if (queued > 0) {
      success('Queued!', `${queued} lecture${queued !== 1 ? 's' : ''} added to transcription queue.`)
      setTimeout(() => loadLectures(currentCourse.id), 4_000)
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const subjectFor = (id: number | null) => id ? subjects.find(s => s.id === id) ?? null : null

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">

        {/* ── Loading ── */}
        {phase === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="glass rounded-2xl p-10 border border-white/[0.07]
                       flex flex-col items-center gap-3"
          >
            <Loader2 size={22} className="text-aura-accent animate-spin" />
            <p className="text-sm text-aura-muted">Loading…</p>
          </motion.div>
        )}

        {/* ── Home ── */}
        {phase === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            {/* Available R2 folders */}
            <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
                  New Course
                </p>
                <button
                  onClick={loadHome}
                  title="Refresh"
                  className="text-aura-muted hover:text-aura-text transition-colors"
                >
                  <RefreshCw size={13} />
                </button>
              </div>

              {dirs.length === 0 ? (
                <p className="text-center text-aura-muted text-sm py-4">
                  No available R2 folders.
                  <br />
                  <span className="text-xs opacity-60">
                    Each folder must have numeric sub-directories with metadata.json.
                  </span>
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {dirs.map(d => (
                    <button
                      key={d.dir}
                      onClick={() => handlePickDir(d)}
                      className={clsx(
                        'flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left',
                        'border-white/[0.07] hover:border-aura-accent/30',
                        'hover:bg-aura-accent/[0.04] transition-all duration-200',
                      )}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <FolderOpen size={14} className="text-aura-accent shrink-0" />
                        <span className="text-sm font-medium text-aura-text truncate">{d.dir}</span>
                      </div>
                      <span className="text-[10px] text-aura-muted font-mono">
                        {d.lectureCount} lecture{d.lectureCount !== 1 ? 's' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Upload status widget */}
            {uploadStatus && (uploadStatus.active.length > 0 || uploadStatus.lastCompleted) && (
              <div className="glass rounded-2xl border border-white/[0.07] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.05]">
                  <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
                    {uploadStatus.active.length > 0 ? 'Upload Queue' : 'Last Upload'}
                  </p>
                </div>
                {uploadStatus.active.length > 0 ? (
                  <div className="divide-y divide-white/[0.03]">
                    {uploadStatus.active.map((j, i) => (
                      <ActiveJobRow key={i} job={j} />
                    ))}
                  </div>
                ) : uploadStatus.lastCompleted ? (
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    {uploadStatus.lastCompleted.status === 'succeeded'
                      ? <Check size={12} className="text-aura-success shrink-0" />
                      : <X    size={12} className="text-aura-error shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-aura-text truncate">{uploadStatus.lastCompleted.courseTitle}</p>
                      <p className="text-[10px] text-aura-muted">
                        Lecture {uploadStatus.lastCompleted.lectureNumber} · {formatRelative(uploadStatus.lastCompleted.completedAt)}
                      </p>
                    </div>
                    <span className={clsx(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0',
                      uploadStatus.lastCompleted.status === 'succeeded'
                        ? 'text-aura-success bg-aura-success/10 border-aura-success/20'
                        : 'text-aura-error bg-aura-error/10 border-aura-error/20',
                    )}>
                      {uploadStatus.lastCompleted.status === 'succeeded' ? 'done' : 'failed'}
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            {/* Managed courses */}
            {managedCourses.length > 0 && (
              <div className="glass rounded-2xl border border-white/[0.07] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.05]">
                  <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
                    Your Courses
                  </p>
                </div>
                <div className="divide-y divide-white/[0.03]">
                  {managedCourses.map(c => {
                    const sub      = subjectFor(c.subjectId)
                    // r2LectureCount is always live from R2 (re-fetched on every load)
                    const r2Total  = c.r2LectureCount && c.r2LectureCount > 0 ? c.r2LectureCount : null
                    const total    = r2Total ?? (c.lectureCount > 0 ? c.lectureCount : null)
                    const uploaded = uploadStatus?.succeededPerCourse?.[c.id] ?? c.lectureCount
                    const pct      = total ? Math.min(100, Math.round((uploaded / total) * 100)) : null

                    return (
                      <button
                        key={c.id}
                        onClick={() => goToManage(c)}
                        className="w-full flex items-center gap-3 px-4 py-3
                                   hover:bg-white/[0.02] transition-colors text-left"
                      >
                        <BookOpen size={14} className="text-aura-accent shrink-0" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-aura-text truncate">{c.title}</p>
                            <span className="text-[10px] text-aura-muted shrink-0 font-mono">
                              {uploaded}/{total ?? '?'}
                            </span>
                          </div>
                          {sub && (
                            <p className="text-[10px] text-aura-muted">{sub.nameHe}</p>
                          )}
                          {pct !== null && (
                            <div className="h-0.5 rounded-full bg-white/[0.05] overflow-hidden">
                              <div
                                className={clsx(
                                  "h-full rounded-full transition-all duration-500",
                                  pct >= 100 ? "bg-green-500" : "bg-aura-accent"
                                )}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <ChevronRight size={12} className="text-aura-muted shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Form ── */}
        {phase === 'form' && selectedDir && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            <button
              onClick={() => setPhase('home')}
              className="flex items-center gap-1.5 text-xs text-aura-muted hover:text-aura-text transition-colors"
            >
              <ArrowLeft size={12} /> Back
            </button>

            <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-4">
              <div className="flex items-center gap-2">
                <FolderOpen size={16} className="text-aura-accent" />
                <div>
                  <p className="text-sm font-semibold text-aura-text">{selectedDir.dir}</p>
                  <p className="text-[10px] text-aura-muted font-mono">{selectedDir.lectureCount} lectures detected</p>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-[11px] text-aura-muted uppercase tracking-wider mb-1.5">
                  Course Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Enter course title…"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]
                             text-sm text-aura-text placeholder-aura-muted/50
                             focus:outline-none focus:border-aura-accent/40 transition-colors"
                />
              </div>

              {/* Subject */}
              {subjects.length > 0 && (
                <div>
                  <label className="block text-[11px] text-aura-muted uppercase tracking-wider mb-1.5">
                    Subject <span className="normal-case font-normal opacity-60">(optional)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setSubjectId(null)}
                      className={clsx(
                        'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150',
                        subjectId === null
                          ? 'bg-white/[0.08] text-aura-text border-white/[0.14]'
                          : 'text-aura-muted border-white/[0.06] hover:border-white/[0.12]',
                      )}
                    >
                      None
                    </button>
                    {subjects.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSubjectId(s.id)}
                        className={clsx(
                          'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150',
                          subjectId === s.id
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
              )}

              <button
                onClick={handleCreateCourse}
                disabled={submitting || !title.trim()}
                className={clsx(
                  'w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2',
                  'bg-gradient-to-r from-aura-accent to-aura-indigo text-aura-base',
                  'hover:opacity-90 active:scale-[0.98] transition-all duration-200',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                )}
              >
                {submitting
                  ? <><Loader2 size={12} className="animate-spin" /> Creating…</>
                  : <><Upload size={12} /> Create Course</>
                }
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Manage ── */}
        {phase === 'manage' && currentCourse && (
          <motion.div
            key="manage"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            <button
              onClick={() => { setPhase('home'); loadHome() }}
              className="flex items-center gap-1.5 text-xs text-aura-muted hover:text-aura-text transition-colors"
            >
              <ArrowLeft size={12} /> Back
            </button>

            <div className="glass rounded-2xl border border-white/[0.07] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-aura-text truncate">{currentCourse.title}</p>
                  <p className="text-[10px] text-aura-muted font-mono mt-0.5">
                    {/* Always show live count: succeeded / r2 total */}
                    {(uploadStatus?.succeededPerCourse?.[currentCourse.id] ?? currentCourse.lectureCount)}
                    {' / '}
                    {currentCourse.r2LectureCount ?? currentCourse.lectureCount} uploaded
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {lectures.some(l => l.status === 'none' || l.status === 'failed') && (
                    <button
                      onClick={handleQueueAll}
                      disabled={queuingAll}
                      className={clsx(
                        'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold',
                        'bg-aura-accent/10 text-aura-accent border border-aura-accent/20',
                        'hover:bg-aura-accent/20 transition-colors',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                      )}
                      title="Queue all unqueued lectures"
                    >
                      {queuingAll
                        ? <Loader2 size={10} className="animate-spin" />
                        : <Zap size={10} />
                      }
                      Queue All
                    </button>
                  )}
                  <button
                    onClick={() => loadLectures(currentCourse.id)}
                    className="text-aura-muted hover:text-aura-text transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw size={13} className={loadingLectures ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {loadingLectures ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-aura-accent" />
                </div>
              ) : (
                <div className="divide-y divide-white/[0.03]">
                  {lectures.map(l => (
                    <div
                      key={l.lectureNumber}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <span className="text-[10px] text-aura-muted font-mono w-6 shrink-0 text-right">
                        {l.lectureNumber}
                      </span>
                      <div className="flex-1">
                        <StatusBadge status={l.status} />
                      </div>
                      {(l.status === 'none' || l.status === 'failed') && (
                        <button
                          onClick={() => handleQueueLecture(l.lectureNumber)}
                          disabled={queuingLecture === l.lectureNumber || queuingAll}
                          className={clsx(
                            'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium',
                            'bg-aura-accent/10 text-aura-accent border border-aura-accent/20',
                            'hover:bg-aura-accent/20 transition-colors',
                            'disabled:opacity-40 disabled:cursor-not-allowed',
                          )}
                        >
                          {queuingLecture === l.lectureNumber
                            ? <Loader2 size={10} className="animate-spin" />
                            : <Zap size={10} />
                          }
                          {l.status === 'failed' ? 'Retry' : 'Queue'}
                        </button>
                      )}
                      {(l.status === 'pending' || l.status === 'running') && (
                        <button
                          onClick={() => handleCancelLecture(l.lectureNumber, l.jobId)}
                          disabled={cancellingLecture === l.lectureNumber}
                          title={l.status === 'pending' ? 'Remove from queue' : 'Mark as failed'}
                          className={clsx(
                            'flex items-center justify-center w-6 h-6 rounded-lg text-[10px]',
                            'text-aura-muted border border-white/[0.08]',
                            'hover:text-aura-error hover:border-aura-error/30 transition-colors',
                            'disabled:opacity-40 disabled:cursor-not-allowed',
                          )}
                        >
                          {cancellingLecture === l.lectureNumber
                            ? <Loader2 size={10} className="animate-spin" />
                            : <X size={10} />
                          }
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}