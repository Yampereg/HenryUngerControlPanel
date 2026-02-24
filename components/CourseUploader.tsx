'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
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
interface ActiveJob     { courseId: number; courseTitle: string; lectureNumber: number; status: string }
interface LastCompleted { courseId: number; courseTitle: string; lectureNumber: number; status: string; completedAt: string | null }
interface UploadStatusData {
  active:             ActiveJob[]
  lastCompleted:      LastCompleted | null
  succeededPerCourse: Record<number, number>
}

type Phase = 'loading' | 'home' | 'form' | 'manage'

// ---------------------------------------------------------------------------
// Relative time helper
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
// Main component
// ---------------------------------------------------------------------------
export function CourseUploader() {
  const { success, error: toastError } = useToast()

  const [phase,           setPhase]           = useState<Phase>('loading')
  const [dirs,            setDirs]            = useState<R2Dir[]>([])
  const [subjects,        setSubjects]        = useState<Subject[]>([])
  const [managedCourses,  setManagedCourses]  = useState<ManagedCourse[]>([])
  const [selectedDir,     setSelectedDir]     = useState<R2Dir | null>(null)
  const [currentCourse,   setCurrentCourse]   = useState<ManagedCourse | null>(null)
  const [lectures,        setLectures]        = useState<LectureItem[]>([])
  const [loadingLectures, setLoadingLectures] = useState(false)
  const [title,           setTitle]           = useState('')
  const [subjectId,       setSubjectId]       = useState<number | null>(null)
  const [imageFile,       setImageFile]       = useState<File | null>(null)
  const [imagePreview,    setImagePreview]    = useState<string | null>(null)
  const [submitting,      setSubmitting]      = useState(false)
  const [queuingLecture,  setQueuingLecture]  = useState<number | null>(null)
  const [uploadStatus,    setUploadStatus]    = useState<UploadStatusData | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // -------------------------------------------------------------------------
  // Data loaders
  // -------------------------------------------------------------------------
  const loadHome = useCallback(async () => {
    setPhase('loading')
    try {
      const [dirsRes, subjectsRes, managedRes, jobsRes] = await Promise.all([
        fetch('/api/r2-dirs'),
        fetch('/api/subjects'),
        fetch('/api/courses/managed'),
        fetch('/api/upload-jobs'),
      ])
      const dirsData     = await dirsRes.json()
      const subjectsData = await subjectsRes.json()
      const managedData  = await managedRes.json()
      const jobsData     = await jobsRes.json()

      setDirs(dirsData.dirs ?? [])
      setSubjects(
        ((subjectsData.subjects ?? []) as { id: number; name_en: string; name_he: string }[]).map(s => ({
          id: s.id, nameEn: s.name_en, nameHe: s.name_he,
        })),
      )
      setManagedCourses(
        ((managedData.courses ?? []) as { id: number; title: string; r2_dir: string; subject_id: number | null; lecture_count: number; r2_lecture_count: number | null }[]).map(c => ({
          id: c.id, title: c.title, r2Dir: c.r2_dir, subjectId: c.subject_id,
          lectureCount: c.lecture_count ?? 0, r2LectureCount: c.r2_lecture_count ?? null,
        })),
      )
      setUploadStatus({
        active:             jobsData.active ?? [],
        lastCompleted:      jobsData.lastCompleted ?? null,
        succeededPerCourse: jobsData.succeededPerCourse ?? {},
      })
    } catch {
      toastError('Load failed', 'Could not load course data')
    }
    setPhase('home')
  }, [toastError])

  const loadLectures = useCallback(async (courseId: number) => {
    setLoadingLectures(true)
    try {
      const res  = await fetch(`/api/course-lectures?courseId=${courseId}`)
      const data = await res.json()
      setLectures(
        (data.lectures ?? []) as LectureItem[],
      )
    } catch { /* silent */ } finally {
      setLoadingLectures(false)
    }
  }, [])

  useEffect(() => { loadHome() }, [loadHome])

  // Auto-refresh lectures every 5 s while in manage phase
  useEffect(() => {
    if (phase !== 'manage' || !currentCourse) return
    const id = setInterval(() => loadLectures(currentCourse.id), 5_000)
    return () => clearInterval(id)
  }, [phase, currentCourse, loadLectures])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  function goToManage(course: ManagedCourse) {
    setCurrentCourse(course)
    setLectures([])
    setPhase('manage')
    loadLectures(course.id)
  }

  function handlePickDir(dir: R2Dir) {
    setSelectedDir(dir)
    setTitle(dir.defaultTitle)
    setSubjectId(null)
    setImageFile(null)
    setImagePreview(null)
    setPhase('form')
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleCreateCourse() {
    if (!selectedDir || !title.trim()) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('r2Dir',  selectedDir.dir)
      fd.append('title',  title.trim())
      if (subjectId) fd.append('subjectId', String(subjectId))
      if (imageFile) fd.append('image', imageFile)

      const res  = await fetch('/api/courses/create', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      success('Course created!', `"${title.trim()}" is ready — queue lectures below.`)

      const newCourse: ManagedCourse = {
        id: data.courseId as number,
        title: title.trim(),
        r2Dir: selectedDir.dir,
        subjectId,
        lectureCount: 0,
        r2LectureCount: selectedDir.lectureCount,
      }
      goToManage(newCourse)
    } catch (e) {
      toastError('Failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

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

      // Optimistic update
      setLectures(prev =>
        prev.map(l =>
          l.lectureNumber === lectureNumber
            ? { ...l, status: 'pending', jobId: data.jobId as number }
            : l,
        ),
      )
      success('Queued!', `Lecture ${lectureNumber} added to transcription queue.`)
      // Poll quickly so status updates as soon as the daemon picks it up
      setTimeout(() => loadLectures(currentCourse.id), 3_000)
      setTimeout(() => loadLectures(currentCourse.id), 8_000)
    } catch (e) {
      toastError('Failed', e instanceof Error ? e.message : String(e))
    } finally {
      setQueuingLecture(null)
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
                    {uploadStatus.active.length > 0 ? 'Uploading Now' : 'Last Upload'}
                  </p>
                </div>
                {uploadStatus.active.length > 0 ? (
                  <div className="divide-y divide-white/[0.03]">
                    {uploadStatus.active.map((j, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <Loader2
                          size={12}
                          className={clsx(
                            'shrink-0',
                            j.status === 'running' ? 'animate-spin text-aura-accent' : 'text-aura-muted',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-aura-text truncate">{j.courseTitle}</p>
                          <p className="text-[10px] text-aura-muted">
                            Lecture {j.lectureNumber} · {j.status === 'running' ? 'in progress' : 'queued'}
                          </p>
                        </div>
                      </div>
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
                    // Prefer R2 count as authoritative total; fall back to DB count
                    // (manually-uploaded courses have 0 R2 sub-dirs → show 100%)
                    const r2Total  = c.r2LectureCount && c.r2LectureCount > 0 ? c.r2LectureCount : null
                    const total    = r2Total ?? (c.lectureCount > 0 ? c.lectureCount : null)
                    const uploaded = Math.max(c.lectureCount, uploadStatus?.succeededPerCourse[c.id] ?? 0)
                    const pct      = total != null && total > 0 ? Math.round((uploaded / total) * 100) : 0
                    const subtitle = [
                      sub?.nameHe,
                      total != null ? `${uploaded}/${total} uploaded` : undefined,
                    ].filter(Boolean).join(' · ')
                    return (
                      <button
                        key={c.id}
                        onClick={() => goToManage(c)}
                        className="w-full flex items-center gap-3 px-4 py-3
                                   hover:bg-white/[0.02] transition-colors text-left"
                      >
                        <BookOpen size={13} className="text-aura-muted shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-aura-text truncate">{c.title}</p>
                          {subtitle && (
                            <p className="text-[10px] text-aura-muted">{subtitle}</p>
                          )}
                          {total != null && (
                            <div className="mt-1.5 h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
                              <div
                                className={clsx(
                                  'h-full rounded-full transition-all duration-500',
                                  pct === 100
                                    ? 'bg-aura-success'
                                    : 'bg-gradient-to-r from-aura-accent to-aura-indigo',
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <ChevronRight size={13} className="text-aura-muted shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Create form ── */}
        {phase === 'form' && selectedDir && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="glass rounded-2xl p-4 border border-white/[0.07] space-y-4"
          >
            {/* Back + folder name */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPhase('home')}
                className="text-aura-muted hover:text-aura-text transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-aura-accent/10
                               text-aura-accent border border-aura-accent/20 font-mono">
                {selectedDir.dir}
              </span>
              <span className="text-xs text-aura-muted ml-auto">
                {selectedDir.lectureCount} lectures
              </span>
            </div>

            {/* Course name */}
            <div>
              <label className="block text-[11px] text-aura-muted uppercase tracking-wider mb-1.5">
                Course Name
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Course title…"
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]
                           text-sm text-aura-text placeholder-aura-muted/50
                           focus:outline-none focus:border-aura-accent/40 transition-colors"
              />
            </div>

            {/* Subject pills */}
            <div>
              <label className="block text-[11px] text-aura-muted uppercase tracking-wider mb-1.5">
                Subject
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

            {/* Image picker */}
            <div>
              <label className="block text-[11px] text-aura-muted uppercase tracking-wider mb-1.5">
                Course Image (optional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
              {imagePreview ? (
                <div className="relative w-full h-28 rounded-xl overflow-hidden border border-white/[0.08]">
                  <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={clearImage}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60
                               flex items-center justify-center hover:bg-black/80 transition-colors"
                  >
                    <X size={11} className="text-white" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                             border border-dashed border-white/[0.12] text-aura-muted
                             hover:border-aura-accent/30 hover:text-aura-text transition-all"
                >
                  <Upload size={14} />
                  <span className="text-xs">Choose image…</span>
                </button>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleCreateCourse}
              disabled={submitting || !title.trim()}
              className={clsx(
                'w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2',
                'bg-gradient-to-r from-aura-accent to-aura-indigo text-aura-base',
                'hover:opacity-90 active:scale-[0.98] transition-all duration-200',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {submitting
                ? <><Loader2 size={14} className="animate-spin" /> Creating…</>
                : <><Check size={14} /> Create Course</>
              }
            </button>
          </motion.div>
        )}

        {/* ── Manage ── */}
        {phase === 'manage' && currentCourse && (
          <motion.div
            key="manage"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-3"
          >
            {/* Course header */}
            <div className="glass rounded-2xl p-4 border border-white/[0.07]">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setPhase('home'); loadHome() }}
                  className="text-aura-muted hover:text-aura-text transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-aura-text truncate">
                    {currentCourse.title}
                  </p>
                  {subjectFor(currentCourse.subjectId) && (
                    <p className="text-[10px] text-aura-muted">
                      {subjectFor(currentCourse.subjectId)!.nameHe}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => loadLectures(currentCourse.id)}
                  disabled={loadingLectures}
                  title="Refresh"
                  className="text-aura-muted hover:text-aura-text transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={13} className={loadingLectures ? 'animate-spin' : ''} />
                </button>
              </div>
              <p className="text-[10px] text-aura-muted font-mono mt-1.5">
                {currentCourse.r2Dir}/
              </p>
            </div>

            {/* Lectures list */}
            <div className="glass rounded-2xl border border-white/[0.07] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.05]">
                <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
                  Lectures
                </p>
              </div>

              {loadingLectures && lectures.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-aura-muted" />
                </div>
              ) : (
                <div className="divide-y divide-white/[0.03]">
                  {lectures.map(lec => {
                    const canQueue  = lec.status === 'none' || lec.status === 'failed'
                    const isQueuing = queuingLecture === lec.lectureNumber
                    return (
                      <div key={lec.lectureNumber} className="flex items-center gap-3 px-4 py-3">
                        <span className="text-[11px] font-mono text-aura-muted w-5 shrink-0 text-right">
                          {lec.lectureNumber}
                        </span>
                        <span className="flex-1 text-xs text-aura-text">
                          Lecture {lec.lectureNumber}
                        </span>
                        <StatusBadge status={lec.status} />
                        {canQueue && (
                          <button
                            onClick={() => handleQueueLecture(lec.lectureNumber)}
                            disabled={isQueuing}
                            className={clsx(
                              'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium',
                              'border border-aura-accent/25 text-aura-accent',
                              'hover:bg-aura-accent/10 transition-all duration-150',
                              'disabled:opacity-40 disabled:cursor-not-allowed',
                            )}
                          >
                            {isQueuing
                              ? <Loader2 size={10} className="animate-spin" />
                              : <Zap size={10} />
                            }
                            {lec.status === 'failed' ? 'Retry' : 'Queue'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
