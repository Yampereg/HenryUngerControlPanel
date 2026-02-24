'use client'

import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Database, Film, GitMerge, ImageIcon, Layers, Link2, Pencil, RefreshCw, RotateCcw, Shuffle, Sparkles } from 'lucide-react'
import { Entity, EntityType, ENTITY_TYPES } from '@/lib/constants'
import { EntitySelector } from './EntitySelector'
import { TargetSelector } from './TargetSelector'
import { AuraUploadZone } from './AuraUploadZone'
import { EntityEditor } from './EntityEditor'
import { MergeEntities } from './MergeEntities'
import { EntityReclassifier } from './EntityReclassifier'
import { RecoveryPanel } from './RecoveryPanel'
import { RelationshipManager } from './RelationshipManager'
import { CourseUploader } from './CourseUploader'
import { CourseEditor } from './CourseEditor'
import { LectureMetaEditor } from './LectureMetaEditor'
import { GeneratePanel } from './GeneratePanel'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

type Tab = 'upload' | 'edit' | 'merge' | 'entities' | 'recovery' | 'links' | 'courses' | 'generate'

// ---------------------------------------------------------------------------
// Stat card — compact for phone
// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label:  string
  value:  string | number
  icon:   React.ReactNode
  accent: string
}) {
  return (
    <div className={clsx('glass rounded-xl p-3 flex items-center gap-2.5 border', accent)}>
      <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-base font-bold text-aura-text leading-none">{value}</p>
        <p className="text-[10px] text-aura-muted mt-0.5 truncate">{label}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step label
// ---------------------------------------------------------------------------
function StepLabel({ n, label, active }: { n: number; label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={clsx(
        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors duration-300',
        active
          ? 'bg-aura-accent text-aura-base shadow-[0_0_10px_rgba(34,211,238,0.4)]'
          : 'bg-white/[0.06] text-aura-muted border border-white/[0.08]',
      )}>
        {n}
      </div>
      <span className={clsx(
        'text-sm font-semibold transition-colors duration-300',
        active ? 'text-aura-text' : 'text-aura-muted',
      )}>
        {label}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export function Dashboard() {
  const { info } = useToast()

  const [tab, setTab] = useState<Tab>('upload')

  const [entityType,      setEntityType]      = useState<EntityType | null>(null)
  const [entities,        setEntities]        = useState<Entity[]>([])
  const [totalCount,      setTotalCount]      = useState<number>(0)
  const [loadingEntities, setLoadingEntities] = useState(false)
  const [selectedEntity,  setSelectedEntity]  = useState<Entity | null>(null)
  const [uploadKey,       setUploadKey]       = useState(0)
  const [showAll,         setShowAll]         = useState(false)

  const fetchEntities = useCallback(async (type: EntityType, all: boolean) => {
    setLoadingEntities(true)
    setEntities([])
    setSelectedEntity(null)

    try {
      const url = `/api/entities/${type}${all ? '?all=true' : ''}`
      const res  = await fetch(url)
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Failed to load')

      setEntities(data.entities ?? [])
      setTotalCount(data.total ?? 0)

      if (!all && data.entities?.length === 0) {
        info(
          `${ENTITY_TYPES[type].label} — all images present`,
          'Every record in this category already has an image in R2.',
        )
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingEntities(false)
    }
  }, [info])

  function handleTypeChange(type: EntityType) {
    setEntityType(type)
    fetchEntities(type, showAll)
  }

  function handleModeToggle(all: boolean) {
    setShowAll(all)
    if (entityType) fetchEntities(entityType, all)
  }

  function handleUploadSuccess() {
    if (!showAll) {
      setEntities((prev) => prev.filter((e) => e.id !== selectedEntity?.id))
    } else {
      setEntities((prev) =>
        prev.map((e) =>
          e.id === selectedEntity?.id ? { ...e, hasImage: true } : e,
        ),
      )
    }
    setSelectedEntity(null)
    setUploadKey((k) => k + 1)
  }

  const missingCount = showAll
    ? entities.filter((e) => !e.hasImage).length
    : entities.length

  const coveragePercent = totalCount > 0
    ? Math.round(((totalCount - missingCount) / totalCount) * 100)
    : 0

  return (
    <div className="min-h-screen bg-aura-base text-aura-text">
      {/* Background ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full
                        bg-aura-accent/[0.05] blur-[100px]" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 rounded-full
                        bg-aura-indigo/[0.07] blur-[100px]" />
      </div>

      <div className="relative z-10 px-3 py-5">

        {/* Header — two rows */}
        <motion.header
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-5"
        >
          {/* Row 1: icon + title + live dot */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-aura-accent to-aura-indigo
                            flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.3)] shrink-0">
              <ImageIcon size={18} className="text-aura-base" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">Control Panel</h1>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full
                                 bg-aura-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-aura-success" />
              </span>
              <span className="text-xs text-aura-muted">Live</span>
            </div>
          </div>

          {/* Row 2: tab switcher — scrollable */}
          <div className="flex p-0.5 rounded-xl bg-black/30 border border-white/[0.06] overflow-x-auto scrollbar-none">
            {([
              { id: 'upload',   label: 'Upload',   icon: <ImageIcon  size={12} /> },
              { id: 'edit',     label: 'Edit',     icon: <Pencil     size={12} /> },
              { id: 'merge',    label: 'Merge',    icon: <GitMerge   size={12} /> },
              { id: 'entities', label: 'Entities', icon: <Shuffle    size={12} /> },
              { id: 'recovery', label: 'Recovery', icon: <RotateCcw  size={12} /> },
              { id: 'links',    label: 'Links',    icon: <Link2      size={12} /> },
              { id: 'courses',  label: 'Courses',  icon: <Film       size={12} /> },
              { id: 'generate', label: 'Generate', icon: <Sparkles   size={12} /> },
            ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={clsx(
                  'shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg',
                  'text-xs font-medium transition-all duration-200 whitespace-nowrap',
                  tab === id
                    ? 'bg-aura-accent/10 text-aura-accent border border-aura-accent/20'
                    : 'text-aura-muted',
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </motion.header>

        {/* Edit Entities tab */}
        <AnimatePresence mode="wait">
          {tab === 'edit' && (
            <motion.div
              key="edit"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              <EntityEditor />
              <CourseEditor />
              <LectureMetaEditor />
            </motion.div>
          )}
          {tab === 'merge' && (
            <motion.div
              key="merge"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <MergeEntities />
            </motion.div>
          )}
          {tab === 'entities' && (
            <motion.div
              key="entities"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <EntityReclassifier />
            </motion.div>
          )}
          {tab === 'recovery' && (
            <motion.div
              key="recovery"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <RecoveryPanel />
            </motion.div>
          )}
          {tab === 'links' && (
            <motion.div
              key="links"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <RelationshipManager />
            </motion.div>
          )}
          {tab === 'courses' && (
            <motion.div
              key="courses"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <CourseUploader />
            </motion.div>
          )}
          {tab === 'generate' && (
            <motion.div
              key="generate"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <GeneratePanel />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload tab content */}
        {tab === 'upload' && (
          <div className="space-y-4">

            {/* Stats row */}
            <AnimatePresence>
              {entityType && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="grid grid-cols-3 gap-2"
                >
                  <StatCard
                    label="Total"
                    value={totalCount}
                    icon={<Database size={13} className="text-aura-muted" />}
                    accent="border-white/[0.06]"
                  />
                  <StatCard
                    label="Missing"
                    value={loadingEntities ? '…' : missingCount}
                    icon={<ImageIcon size={13} className="text-aura-error/80" />}
                    accent={missingCount > 0 ? 'border-aura-error/20' : 'border-white/[0.06]'}
                  />
                  <StatCard
                    label="Coverage"
                    value={loadingEntities ? '…' : `${coveragePercent}%`}
                    icon={<Layers size={13} className="text-aura-success/80" />}
                    accent={coveragePercent === 100 ? 'border-aura-success/20' : 'border-white/[0.06]'}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Step 1 — category */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass rounded-2xl p-4 border border-white/[0.07]"
            >
              <StepLabel n={1} label="Select category" active={true} />
              <EntitySelector selected={entityType} onChange={handleTypeChange} />
            </motion.div>

            {/* Step 2 — target record */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-2xl p-4 border border-white/[0.07]"
            >
              <div className="flex items-center justify-between">
                <StepLabel n={2} label="Choose record" active={!!entityType} />
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex p-0.5 rounded-lg bg-black/30 border border-white/[0.04]">
                    <button
                      onClick={() => handleModeToggle(false)}
                      className={clsx(
                        'px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200',
                        !showAll ? 'bg-white/[0.07] text-aura-text' : 'text-aura-muted',
                      )}
                    >
                      Missing
                    </button>
                    <button
                      onClick={() => handleModeToggle(true)}
                      className={clsx(
                        'px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200',
                        showAll ? 'bg-white/[0.07] text-aura-text' : 'text-aura-muted',
                      )}
                    >
                      All
                    </button>
                  </div>
                  {entityType && !loadingEntities && (
                    <button
                      onClick={() => fetchEntities(entityType, showAll)}
                      className="text-aura-muted"
                      title="Refresh"
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}
                </div>
              </div>

              <TargetSelector
                entities={entities}
                loading={loadingEntities}
                selected={selectedEntity}
                onChange={setSelectedEntity}
                showAll={showAll}
                disabled={!entityType}
              />

              <AnimatePresence>
                {!loadingEntities && entityType && (
                  <motion.p
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="mt-2.5 text-xs text-aura-muted"
                  >
                    {showAll ? (
                      <>
                        <span className="text-aura-text font-semibold">{entities.length}</span>
                        {' '}records ·{' '}
                        <span className="text-aura-error font-semibold">{missingCount}</span>
                        {' '}missing
                      </>
                    ) : missingCount > 0 ? (
                      <>
                        <span className="text-aura-error font-semibold">{missingCount}</span>
                        {' '}missing image{missingCount !== 1 ? 's' : ''}
                      </>
                    ) : null}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Selected entity info */}
            <AnimatePresence>
              {selectedEntity && entityType && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="glass rounded-2xl p-4 border border-aura-accent/20
                             shadow-[0_0_20px_rgba(34,211,238,0.06)]"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-[10px] text-aura-muted uppercase tracking-widest">Target</p>
                    {showAll && (
                      <span className={clsx(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded-full border',
                        selectedEntity.hasImage
                          ? 'text-aura-success border-aura-success/30 bg-aura-success/10'
                          : 'text-aura-error border-aura-error/30 bg-aura-error/10',
                      )}>
                        {selectedEntity.hasImage ? 'Replacing' : 'No image'}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-aura-text leading-snug">
                    {selectedEntity.displayName}
                  </p>
                  <p className="text-[11px] text-aura-muted mt-1 font-mono">
                    images/{entityType}/{selectedEntity.id}.jpeg
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Step 3 — upload zone */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass rounded-2xl p-4 border border-white/[0.07] flex flex-col"
            >
              <StepLabel n={3} label="Upload image" active={!!selectedEntity} />
              <AuraUploadZone
                key={uploadKey}
                entity={selectedEntity}
                entityType={entityType}
                onSuccess={handleUploadSuccess}
              />
            </motion.div>

          </div>
        )}

      </div>
    </div>
  )
}
