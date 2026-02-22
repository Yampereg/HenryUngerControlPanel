'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Check,
  FolderOpen,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface R2Dir    { dir: string; lectureCount: number; defaultTitle: string }
interface Subject  { id: number; nameEn: string; nameHe: string }
interface JobGroup {
  courseId:    number
  courseTitle: string
  total:       number
  succeeded:   number
  failed:      number
  running:     number
  pending:     number
}

type Phase = 'loading' | 'pick' | 'form' | 'done'

// ---------------------------------------------------------------------------
// Progress section
// ---------------------------------------------------------------------------
function ProgressSection({
  jobs,
  loading,
  onRefresh,
}: {
  jobs:      JobGroup[]
  loading:   boolean
  onRefresh: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/[0.07] overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
        <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
          Transcription Progress
        </p>
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
          className="text-aura-muted hover:text-aura-text transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="divide-y divide-white/[0.03]">
        {jobs.map(job => {
          const done    = job.succeeded + job.failed
          const pct     = job.total > 0 ? (done / job.total) * 100 : 0
          const allDone = done === job.total && job.total > 0

          return (
            <div key={job.courseId} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-aura-text truncate">{job.courseTitle}</p>
                <span className="text-xs text-aura-muted shrink-0 ml-2">
                  {done}/{job.total}
                  {allDone && <span className="ml-1 text-aura-success">✓</span>}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={clsx(
                    'h-full rounded-full',
                    allDone
                      ? 'bg-aura-success'
                      : job.failed > 0
                      ? 'bg-gradient-to-r from-aura-accent to-aura-error'
                      : 'bg-gradient-to-r from-aura-accent to-aura-indigo',
                  )}
                />
              </div>

              {/* Status counts */}
              <div className="flex gap-3 mt-1 text-[10px]">
                {job.succeeded > 0 && (
                  <span className="text-aura-success">{job.succeeded} done</span>
                )}
                {job.failed > 0 && (
                  <span className="text-aura-error">{job.failed} failed</span>
                )}
                {job.running > 0 && (
                  <span className="text-aura-accent">{job.running} running</span>
                )}
                {job.pending > 0 && (
                  <span className="text-aura-muted">{job.pending} pending</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function CourseUploader() {
  const { success, error: toastError } = useToast()

  const [phase,        setPhase]        = useState<Phase>('loading')
  const [dirs,         setDirs]         = useState<R2Dir[]>([])
  const [subjects,     setSubjects]     = useState<Subject[]>([])
  const [selectedDir,  setSelectedDir]  = useState<R2Dir | null>(null)
  const [title,        setTitle]        = useState('')
  const [subjectId,    setSubjectId]    = useState<number | null>(null)
  const [imageFile,    setImageFile]    = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [queuedCount,  setQueuedCount]  = useState(0)
  const [jobs,         setJobs]         = useState<JobGroup[]>([])
  const [loadingJobs,  setLoadingJobs]  = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // -------------------------------------------------------------------------
  // Data loaders
  // -------------------------------------------------------------------------
  const loadDirs = useCallback(async () => {
    setPhase('loading')
    try {
      const [dirsRes, subjectsRes] = await Promise.all([
        fetch('/api/r2-dirs'),
        fetch('/api/subjects'),
      ])
      const dirsData     = await dirsRes.json()
      const subjectsData = await subjectsRes.json()
      setDirs(dirsData.dirs ?? [])
      setSubjects(
        ((subjectsData.subjects ?? []) as { id: number; name_en: string; name_he: string }[]).map(s => ({
          id:     s.id,
          nameEn: s.name_en,
          nameHe: s.name_he,
        })),
      )
    } catch {
      toastError('Load failed', 'Could not load R2 directories')
    }
    setPhase('pick')
  }, [toastError])

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true)
    try {
      const res  = await fetch('/api/upload-jobs')
      const data = await res.json()
      setJobs(data.jobs ?? [])
    } catch {
      /* silent */
    } finally {
      setLoadingJobs(false)
    }
  }, [])

  useEffect(() => { loadDirs() }, [loadDirs])

  // Poll jobs every 10 s
  useEffect(() => {
    loadJobs()
    const id = setInterval(loadJobs, 10_000)
    return () => clearInterval(id)
  }, [loadJobs])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
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

  async function handleSubmit() {
    if (!selectedDir || !title.trim()) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('r2Dir', selectedDir.dir)
      fd.append('title', title.trim())
      if (subjectId) fd.append('subjectId', String(subjectId))
      if (imageFile) fd.append('image', imageFile)

      const res  = await fetch('/api/courses/create', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setQueuedCount(data.lectureCount)
      setPhase('done')
      success('Queued!', `${data.lectureCount} lectures added to the transcription queue.`)
      loadJobs()
    } catch (e) {
      toastError('Failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass rounded-2xl p-10 border border-white/[0.07]
                       flex flex-col items-center gap-3"
          >
            <Loader2 size={22} className="text-aura-accent animate-spin" />
            <p className="text-sm text-aura-muted">Scanning R2 for course folders…</p>
          </motion.div>
        )}

        {/* ── Pick dir ── */}
        {phase === 'pick' && (
          <motion.div
            key="pick"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
                Available R2 Folders
              </p>
              <button
                onClick={loadDirs}
                title="Refresh"
                className="text-aura-muted hover:text-aura-text transition-colors"
              >
                <RefreshCw size={13} />
              </button>
            </div>

            {dirs.length === 0 ? (
              <p className="text-center text-aura-muted text-sm py-8">
                No available course folders found in R2.
                <br />
                <span className="text-xs opacity-60">
                  Folders must have numeric sub-directories each containing metadata.json.
                  Already-assigned folders are excluded.
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
          </motion.div>
        )}

        {/* ── Create form ── */}
        {phase === 'form' && selectedDir && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="glass rounded-2xl p-4 border border-white/[0.07] space-y-4"
          >
            {/* Back + selected dir */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPhase('pick')}
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
                <div className="relative w-full h-28 rounded-xl overflow-hidden
                                border border-white/[0.08]">
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
              onClick={handleSubmit}
              disabled={submitting || !title.trim()}
              className={clsx(
                'w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2',
                'bg-gradient-to-r from-aura-accent to-aura-indigo text-aura-base',
                'hover:opacity-90 active:scale-[0.98] transition-all duration-200',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {submitting
                ? <><Loader2 size={14} className="animate-spin" /> Queuing…</>
                : <><Check size={14} /> Create &amp; Queue Transcription</>
              }
            </button>
          </motion.div>
        )}

        {/* ── Done ── */}
        {phase === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="glass rounded-2xl p-6 border border-aura-success/20 text-center space-y-3"
          >
            <div className="w-12 h-12 rounded-full bg-aura-success/15 border border-aura-success/25
                            flex items-center justify-center mx-auto">
              <Check size={22} className="text-aura-success" />
            </div>
            <div>
              <p className="font-semibold text-aura-text">
                {queuedCount} lecture{queuedCount !== 1 ? 's' : ''} queued
              </p>
              <p className="text-sm text-aura-muted mt-1">
                The Transcriber daemon will pick this up automatically.
                <br />
                Check progress below — it updates every 10 s.
              </p>
            </div>
            <button
              onClick={() => { loadDirs(); loadJobs() }}
              className="text-xs text-aura-accent hover:opacity-80 transition-opacity"
            >
              Queue another course
            </button>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Progress section ── */}
      {jobs.length > 0 && (
        <ProgressSection jobs={jobs} loading={loadingJobs} onRefresh={loadJobs} />
      )}

    </div>
  )
}
