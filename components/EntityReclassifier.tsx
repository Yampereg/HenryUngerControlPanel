'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Search, Shuffle, Check, Loader2 } from 'lucide-react'
import { ENTITY_TYPES, EntityType } from '@/lib/constants'
import { useToast } from './ToastProvider'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EntityRow {
  id:          number
  displayName: string
  hebrewName:  string | null
  hasImage:    boolean
}

// ---------------------------------------------------------------------------
// Inline searchable entity list
// ---------------------------------------------------------------------------
function EntityList({
  entities,
  selected,
  onSelect,
}: {
  entities:  EntityRow[]
  selected:  EntityRow | null
  onSelect:  (e: EntityRow) => void
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return entities
    const q = query.toLowerCase()
    return entities.filter((e) => e.displayName.toLowerCase().includes(q))
  }, [entities, query])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06]">
        <Search size={13} className="text-aura-muted shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="flex-1 bg-transparent text-sm text-aura-text placeholder:text-aura-muted outline-none"
        />
      </div>
      <div className="max-h-64 overflow-y-auto space-y-0.5 pr-1">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-aura-muted py-6">No results</p>
        ) : filtered.map((e) => (
          <button
            key={e.id}
            onClick={() => onSelect(e)}
            className={clsx(
              'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors duration-150',
              selected?.id === e.id
                ? 'bg-aura-accent/10 text-aura-accent border border-aura-accent/20'
                : 'text-aura-text hover:bg-white/[0.05] border border-transparent',
            )}
          >
            <span className="truncate text-left">{e.displayName}</span>
            <div className="flex items-center gap-2 ml-2 shrink-0">
              <span className={clsx(
                'w-1.5 h-1.5 rounded-full',
                e.hasImage ? 'bg-aura-success' : 'bg-white/20',
              )} />
              {selected?.id === e.id && <Check size={12} />}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category pill selector
// ---------------------------------------------------------------------------
function TypePills({
  selected,
  exclude,
  onChange,
}: {
  selected: EntityType | null
  exclude:  EntityType | null
  onChange: (t: EntityType) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.entries(ENTITY_TYPES) as [EntityType, typeof ENTITY_TYPES[EntityType]][]).map(([key, cfg]) => (
        key === exclude ? null : (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border',
              selected === key
                ? 'bg-aura-indigo/15 text-aura-indigo border-aura-indigo/30'
                : 'text-aura-muted border-white/[0.07] hover:border-white/[0.14] hover:text-aura-text',
            )}
          >
            <span>{cfg.icon}</span>
            {cfg.label}
          </button>
        )
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function EntityReclassifier() {
  const { success, error: toastError } = useToast()

  const [fromType,  setFromType]  = useState<EntityType | null>(null)
  const [entities,  setEntities]  = useState<EntityRow[]>([])
  const [loading,   setLoading]   = useState(false)
  const [selected,  setSelected]  = useState<EntityRow | null>(null)
  const [toType,    setToType]    = useState<EntityType | null>(null)
  const [moving,    setMoving]    = useState(false)

  async function loadEntities(type: EntityType) {
    setLoading(true)
    setEntities([])
    setSelected(null)
    try {
      const res  = await fetch(`/api/entities/${type}?all=true`)
      const data = await res.json()
      setEntities(data.entities ?? [])
    } finally {
      setLoading(false)
    }
  }

  function handleFromType(type: EntityType) {
    setFromType(type)
    setSelected(null)
    setToType(null)
    loadEntities(type)
  }

  async function handleMove() {
    if (!selected || !fromType || !toType) return
    setMoving(true)
    try {
      const res  = await fetch('/api/entities/reclassify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ entityId: selected.id, fromType, toType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')

      success(
        'Entity moved',
        `"${selected.displayName}" is now a ${ENTITY_TYPES[toType].label.toLowerCase().replace(/s$/, '')}.`,
      )
      // Remove from list and reset
      setEntities((prev) => prev.filter((e) => e.id !== selected.id))
      setSelected(null)
      setToType(null)
    } catch (e) {
      toastError('Move failed', e instanceof Error ? e.message : String(e))
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="space-y-4">

      {/* From — pick category */}
      <div className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3">
        <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
          1 · Source category
        </p>
        <TypePills selected={fromType} exclude={null} onChange={handleFromType} />
      </div>

      {/* Entity list */}
      <AnimatePresence>
        {fromType && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3"
          >
            <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
              2 · Pick entity
            </p>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={22} className="text-aura-accent animate-spin" />
              </div>
            ) : (
              <EntityList entities={entities} selected={selected} onSelect={setSelected} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* To — pick target category */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key="to"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="glass rounded-2xl p-4 border border-white/[0.07] space-y-3"
          >
            <p className="text-xs font-semibold text-aura-muted uppercase tracking-widest">
              3 · Move to
            </p>
            <TypePills selected={toType} exclude={fromType} onChange={setToType} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm */}
      <AnimatePresence>
        {selected && toType && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="glass rounded-2xl p-4 border border-aura-indigo/20
                       shadow-[0_0_20px_rgba(129,140,248,0.06)] space-y-3"
          >
            {/* Preview */}
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-aura-muted uppercase tracking-widest mb-1">
                  {ENTITY_TYPES[fromType!].label}
                </p>
                <p className="font-semibold text-aura-text truncate">{selected.displayName}</p>
                {selected.hebrewName && (
                  <p className="text-xs text-aura-muted mt-0.5">{selected.hebrewName}</p>
                )}
              </div>
              <ArrowRight size={16} className="text-aura-indigo shrink-0" />
              <div className="flex-1 min-w-0 text-right">
                <p className="text-[10px] text-aura-muted uppercase tracking-widest mb-1">
                  {ENTITY_TYPES[toType].label}
                </p>
                <p className="font-semibold text-aura-indigo">{selected.displayName}</p>
              </div>
            </div>

            <button
              onClick={handleMove}
              disabled={moving}
              className={clsx(
                'w-full flex items-center justify-center gap-2 py-3 rounded-xl',
                'text-sm font-semibold transition-all duration-200',
                moving
                  ? 'bg-aura-indigo/20 text-aura-muted cursor-not-allowed'
                  : 'bg-aura-indigo/20 text-aura-indigo border border-aura-indigo/30 hover:bg-aura-indigo/30',
              )}
            >
              {moving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Shuffle size={15} />
              )}
              {moving ? 'Moving…' : `Move to ${ENTITY_TYPES[toType].label}`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
