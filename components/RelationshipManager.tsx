'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ChevronDown, RefreshCw } from 'lucide-react'
import { ENTITY_TYPES, JUNCTION_MAP, EntityType } from '@/lib/constants'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type RelType = 'discussed' | 'mentioned'

interface Course   { id: number; title: string }
interface Lecture  { id: number; title: string }
interface LinkedEntity {
  junctionId:       number
  entityId:         number
  displayName:      string
  hebrewName:       string | null
  relationshipType: RelType
}

// ---------------------------------------------------------------------------
// Relationship pill toggle
// ---------------------------------------------------------------------------
function RelToggle({
  value,
  onChange,
  saving,
}: {
  value:    RelType
  onChange: (v: RelType) => void
  saving:   boolean
}) {
  return (
    <div className="flex gap-1 p-0.5 rounded-lg bg-black/30 border border-white/[0.06] shrink-0">
      {(['discussed', 'mentioned'] as RelType[]).map(t => (
        <button
          key={t}
          disabled={saving}
          onClick={() => value !== t && onChange(t)}
          className={clsx(
            'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all duration-150 disabled:opacity-50',
            value === t
              ? t === 'discussed'
                ? 'bg-aura-accent/15 text-aura-accent border border-aura-accent/25'
                : 'bg-aura-indigo/15 text-aura-indigo border border-aura-indigo/25'
              : 'text-aura-muted hover:text-aura-text',
          )}
        >
          {saving && value !== t ? <Loader2 size={10} className="animate-spin" /> : t}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Course select dropdown
// ---------------------------------------------------------------------------
function CourseSelect({
  courses,
  selected,
  onChange,
}: {
  courses:  Course[]
  selected: Course | null
  onChange: (c: Course) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl',
          'border text-sm transition-all duration-150',
          selected
            ? 'border-aura-accent/25 text-aura-text bg-aura-accent/[0.05]'
            : 'border-white/[0.08] text-aura-muted bg-white/[0.03]',
        )}
      >
        <span className="truncate">{selected?.title ?? 'Choose a course…'}</span>
        <ChevronDown
          size={14}
          className={clsx('shrink-0 text-aura-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute z-20 top-full mt-1.5 w-full rounded-xl border border-white/[0.10]
                       overflow-hidden shadow-xl"
            style={{ background: '#13131f' }}
          >
            {courses.map(c => (
              <button
                key={c.id}
                onClick={() => { onChange(c); setOpen(false) }}
                className={clsx(
                  'w-full text-left px-3 py-2.5 text-sm transition-colors duration-100',
                  selected?.id === c.id
                    ? 'text-aura-accent bg-aura-accent/[0.08]'
                    : 'text-aura-text hover:bg-white/[0.04]',
                )}
              >
                {c.title}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lecture list
// ---------------------------------------------------------------------------
function LectureList({
  lectures,
  selected,
  onSelect,
}: {
  lectures: Lecture[]
  selected: Lecture | null
  onSelect: (l: Lecture) => void
}) {
  return (
    <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
      {lectures.length === 0 ? (
        <p className="text-center text-sm text-aura-muted py-6">No lectures found</p>
      ) : (
        lectures.map(l => (
          <button
            key={l.id}
            onClick={() => onSelect(l)}
            className={clsx(
              'w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-100 border',
              selected?.id === l.id
                ? 'bg-aura-accent/10 text-aura-accent border-aura-accent/20'
                : 'text-aura-text hover:bg-white/[0.04] border-transparent',
            )}
          >
            <span className="truncate block">{l.title}</span>
          </button>
        ))
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category pills — only entity types that have a junction table
// ---------------------------------------------------------------------------
function CategoryPills({
  selected,
  onChange,
}: {
  selected: EntityType | null
  onChange: (t: EntityType) => void
}) {
  const categories = Object.keys(JUNCTION_MAP) as EntityType[]

  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map(key => {
        const cfg = ENTITY_TYPES[key]
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
              'transition-all duration-150 border',
              selected === key
                ? 'bg-aura-accent/10 text-aura-accent border-aura-accent/20'
                : 'text-aura-muted border-white/[0.07] hover:border-white/[0.14] hover:text-aura-text',
            )}
          >
            <span>{cfg.icon}</span>
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function RelationshipManager() {
  const { success, error: toastError } = useToast()

  const [courses,         setCourses]         = useState<Course[]>([])
  const [loadingCourses,  setLoadingCourses]  = useState(false)

  const [selectedCourse,  setSelectedCourse]  = useState<Course | null>(null)
  const [lectures,        setLectures]        = useState<Lecture[]>([])
  const [loadingLectures, setLoadingLectures] = useState(false)

  const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null)
  const [category,        setCategory]        = useState<EntityType | null>(null)

  const [entities,        setEntities]        = useState<LinkedEntity[]>([])
  const [loadingEntities, setLoadingEntities] = useState(false)
  const [savingId,        setSavingId]        = useState<number | null>(null) // junctionId being saved

  // -------------------------------------------------------------------------
  // Load courses on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    setLoadingCourses(true)
    fetch('/api/courses')
      .then(r => r.json())
      .then(d => setCourses(d.courses ?? []))
      .catch(() => toastError('Load failed', 'Could not load courses'))
      .finally(() => setLoadingCourses(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Load lectures when course changes
  // -------------------------------------------------------------------------
  async function handleCourseChange(course: Course) {
    setSelectedCourse(course)
    setSelectedLecture(null)
    setEntities([])
    setLoadingLectures(true)
    try {
      const res  = await fetch(`/api/lectures?courseId=${course.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLectures(data.lectures ?? [])
    } catch (e) {
      toastError('Load failed', e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingLectures(false)
    }
  }

  // -------------------------------------------------------------------------
  // Load entities when lecture or category changes
  // -------------------------------------------------------------------------
  async function loadEntities(lectureId: number, cat: EntityType) {
    setLoadingEntities(true)
    setEntities([])
    try {
      const res  = await fetch(`/api/lecture-entities?lectureId=${lectureId}&category=${cat}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEntities(data.entities ?? [])
    } catch (e) {
      toastError('Load failed', e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingEntities(false)
    }
  }

  function handleLectureSelect(lecture: Lecture) {
    setSelectedLecture(lecture)
    setEntities([])
    if (category) loadEntities(lecture.id, category)
  }

  function handleCategoryChange(cat: EntityType) {
    setCategory(cat)
    setEntities([])
    if (selectedLecture) loadEntities(selectedLecture.id, cat)
  }

  // -------------------------------------------------------------------------
  // Toggle relationship_type (optimistic)
  // -------------------------------------------------------------------------
  async function handleToggle(entity: LinkedEntity, newType: RelType) {
    const prevType = entity.relationshipType

    // Optimistic update
    setEntities(prev =>
      prev.map(e => e.junctionId === entity.junctionId ? { ...e, relationshipType: newType } : e),
    )
    setSavingId(entity.junctionId)

    try {
      const res = await fetch('/api/lecture-entities', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          junctionId:       entity.junctionId,
          category,
          relationshipType: newType,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      success('Updated', `"${entity.displayName}" is now ${newType}.`)
    } catch (e) {
      // Revert on failure
      setEntities(prev =>
        prev.map(e => e.junctionId === entity.junctionId ? { ...e, relationshipType: prevType } : e),
      )
      toastError('Update failed', e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const showLectures = !!selectedCourse
  const showCategory = !!selectedLecture
  const showEntities = !!selectedLecture && !!category

  return (
    <div className="space-y-4">

      {/* Step 1 — course */}
      <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3">
        <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
          1 · Course
        </p>
        {loadingCourses ? (
          <div className="flex justify-center py-4">
            <Loader2 size={18} className="text-aura-accent animate-spin" />
          </div>
        ) : (
          <CourseSelect
            courses={courses}
            selected={selectedCourse}
            onChange={handleCourseChange}
          />
        )}
      </div>

      {/* Step 2 — lecture */}
      <AnimatePresence>
        {showLectures && (
          <motion.div
            key="lectures"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3"
          >
            <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
              2 · Lecture
            </p>
            {loadingLectures ? (
              <div className="flex justify-center py-6">
                <Loader2 size={18} className="text-aura-accent animate-spin" />
              </div>
            ) : (
              <LectureList
                lectures={lectures}
                selected={selectedLecture}
                onSelect={handleLectureSelect}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step 3 — category */}
      <AnimatePresence>
        {showCategory && (
          <motion.div
            key="category"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3"
          >
            <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
              3 · Category
            </p>
            <CategoryPills selected={category} onChange={handleCategoryChange} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step 4 — entity list */}
      <AnimatePresence>
        {showEntities && (
          <motion.div
            key="entities"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="glass rounded-2xl border border-white/[0.07] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
              <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
                {loadingEntities ? 'Loading…' : `${entities.length} linked`}
              </p>
              <button
                onClick={() => selectedLecture && category && loadEntities(selectedLecture.id, category)}
                disabled={loadingEntities}
                className="text-aura-muted disabled:opacity-40"
                title="Refresh"
              >
                <RefreshCw size={13} className={loadingEntities ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Body */}
            {loadingEntities ? (
              <div className="flex items-center justify-center py-12 gap-2 text-aura-muted">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : entities.length === 0 ? (
              <p className="text-center text-aura-muted text-sm py-12">
                No {ENTITY_TYPES[category!]?.label.toLowerCase()} linked to this lecture
              </p>
            ) : (
              <AnimatePresence initial={false}>
                {entities.map(entity => (
                  <motion.div
                    key={entity.junctionId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0"
                  >
                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-aura-text truncate">
                        {entity.displayName}
                      </p>
                      {entity.hebrewName && (
                        <p className="text-xs text-aura-muted font-hebrew truncate mt-0.5" dir="rtl">
                          {entity.hebrewName}
                        </p>
                      )}
                    </div>

                    {/* Toggle */}
                    <RelToggle
                      value={entity.relationshipType}
                      onChange={newType => handleToggle(entity, newType)}
                      saving={savingId === entity.junctionId}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
