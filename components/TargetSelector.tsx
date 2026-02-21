'use client'

import { useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, ChevronDown, Check, Loader2 } from 'lucide-react'
import { Entity } from '@/lib/constants'
import clsx from 'clsx'

interface Props {
  entities:  Entity[]
  loading:   boolean
  selected:  Entity | null
  onChange:  (entity: Entity) => void
  showAll?:  boolean
  disabled?: boolean
}

export function TargetSelector({ entities, loading, selected, onChange, showAll, disabled }: Props) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return entities
    const q = query.toLowerCase()
    return entities.filter((e) => e.displayName.toLowerCase().includes(q))
  }, [entities, query])

  function handleSelect(entity: Entity) {
    onChange(entity)
    setOpen(false)
    setQuery('')
  }

  const placeholder = disabled
    ? 'Select a category first'
    : loading
    ? 'Loading…'
    : entities.length === 0
    ? showAll ? 'No records found' : 'No missing images found'
    : showAll
    ? `Search ${entities.length} records…`
    : `Search ${entities.length} records without images…`

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        disabled={disabled || loading}
        onClick={() => !disabled && !loading && setOpen((v) => !v)}
        className={clsx(
          'w-full flex items-center justify-between px-4 py-3.5 rounded-xl',
          'glass border transition-all duration-200 text-left focus:outline-none',
          disabled || loading
            ? 'opacity-40 cursor-not-allowed'
            : open
            ? 'border-aura-indigo/50 shadow-[0_0_20px_rgba(129,140,248,0.1)]'
            : 'border-white/[0.08] hover:border-white/[0.14]',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {loading ? (
            <>
              <Loader2 size={16} className="text-aura-muted animate-spin shrink-0" />
              <span className="text-aura-muted">Loading records…</span>
            </>
          ) : selected ? (
            <span className="text-aura-text font-medium truncate">{selected.displayName}</span>
          ) : (
            <span className="text-aura-muted">{placeholder}</span>
          )}
        </div>
        {!loading && (
          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0"
          >
            <ChevronDown size={16} className="text-aura-muted" />
          </motion.div>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && !disabled && !loading && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute top-full mt-2 inset-x-0 z-50 dropdown-bg rounded-xl overflow-hidden
                       shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
          >
            {/* Search */}
            <div className="p-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-2">
                <Search size={14} className="text-aura-muted shrink-0" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="flex-1 bg-transparent text-sm text-aura-text placeholder:text-aura-muted
                             outline-none min-w-0"
                />
              </div>
            </div>

            {/* List */}
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-aura-muted">No results</p>
              ) : (
                filtered.map((entity, i) => (
                  <motion.button
                    key={entity.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => handleSelect(entity)}
                    className={clsx(
                      'w-full flex items-center justify-between px-4 py-2.5',
                      'text-sm transition-colors duration-150',
                      selected?.id === entity.id
                        ? 'bg-aura-indigo/10 text-aura-indigo'
                        : 'text-aura-text hover:bg-white/[0.05]',
                    )}
                  >
                    <span className="truncate">{entity.displayName}</span>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className="text-xs text-aura-muted">#{entity.id}</span>
                      {/* Image status dot — only shown in "all" mode */}
                      {showAll && (
                        <span className={clsx(
                          'w-1.5 h-1.5 rounded-full',
                          entity.hasImage ? 'bg-aura-success' : 'bg-aura-error/60',
                        )} />
                      )}
                      {selected?.id === entity.id && (
                        <Check size={12} className="text-aura-indigo" />
                      )}
                    </div>
                  </motion.button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
