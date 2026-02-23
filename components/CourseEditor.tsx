'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronUp, Loader2, Pencil } from 'lucide-react'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

interface Course  { id: number; title: string; subjectId: number | null }
interface Subject { id: number; nameEn: string; nameHe: string }

export function CourseEditor() {
  const { success, error: toastError } = useToast()

  const [courses,      setCourses]      = useState<Course[]>([])
  const [subjects,     setSubjects]     = useState<Subject[]>([])
  const [loading,      setLoading]      = useState(true)
  const [editId,       setEditId]       = useState<number | null>(null)
  const [editTitle,    setEditTitle]    = useState('')
  const [editSubjectId,setEditSubjectId]= useState<number | null>(null)
  const [saving,       setSaving]       = useState(false)

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

  function openEdit(course: Course) {
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
        prev.map(c => c.id === editId
          ? { ...c, title: editTitle.trim(), subjectId: editSubjectId }
          : c,
        ),
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
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
          Edit Courses
        </p>
      </div>

      <div className="divide-y divide-white/[0.03]">
        {courses.map(course => {
          const subject = subjects.find(s => s.id === course.subjectId)
          const isOpen  = editId === course.id

          return (
            <div key={course.id}>
              {/* Row */}
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

              {/* Edit panel */}
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
                      {/* Title */}
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

                      {/* Subject pills */}
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

                      {/* Save */}
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
