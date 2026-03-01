'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Film, GitMerge, ImageIcon, Link2, Pencil, RotateCcw, Shuffle, Sparkles } from 'lucide-react'
import { EditPanel } from './EditPanel'
import { MergeEntities } from './MergeEntities'
import { EntityReclassifier } from './EntityReclassifier'
import { RecoveryPanel } from './RecoveryPanel'
import { RelationshipManager } from './RelationshipManager'
import { CourseUploader } from './CourseUploader'
import { GeneratePanel } from './GeneratePanel'
import { ImageGame } from './ImageGame'
import clsx from 'clsx'

type Tab = 'edit' | 'merge' | 'entities' | 'recovery' | 'links' | 'courses' | 'generate' | 'images'

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export function Dashboard() {
  const [tab, setTab] = useState<Tab>('edit')

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
              { id: 'edit',     label: 'Edit',     icon: <Pencil     size={12} /> },
              { id: 'merge',    label: 'Merge',    icon: <GitMerge   size={12} /> },
              { id: 'entities', label: 'Entities', icon: <Shuffle    size={12} /> },
              { id: 'recovery', label: 'Recovery', icon: <RotateCcw  size={12} /> },
              { id: 'links',    label: 'Links',    icon: <Link2      size={12} /> },
              { id: 'courses',  label: 'Courses',  icon: <Film       size={12} /> },
              { id: 'generate', label: 'Generate', icon: <Sparkles   size={12} /> },
              { id: 'images',   label: 'Images',   icon: <ImageIcon  size={12} /> },
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
              <EditPanel />
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
          {tab === 'images' && (
            <motion.div
              key="images"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <ImageGame />
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}
