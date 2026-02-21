'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'
import { ENTITY_TYPES, EntityType } from '@/lib/constants'
import clsx from 'clsx'

interface Props {
  selected: EntityType | null
  onChange: (type: EntityType) => void
}

export function EntitySelector({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false)

  const selectedConfig = selected ? ENTITY_TYPES[selected] : null

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'w-full flex items-center justify-between px-4 py-3.5 rounded-xl',
          'glass border transition-all duration-200',
          open
            ? 'border-aura-accent/50 shadow-[0_0_20px_rgba(34,211,238,0.1)]'
            : 'border-white/[0.08] hover:border-white/[0.14]',
          'text-left focus:outline-none',
        )}
      >
        <div className="flex items-center gap-3">
          {selectedConfig ? (
            <>
              <span className="text-xl leading-none">{selectedConfig.icon}</span>
              <span className="text-aura-text font-medium">{selectedConfig.label}</span>
            </>
          ) : (
            <span className="text-aura-muted">Select a category…</span>
          )}
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={16} className="text-aura-muted" />
        </motion.div>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute top-full mt-2 inset-x-0 z-50 glass rounded-xl overflow-hidden
                       border border-white/[0.10] shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
          >
            {(Object.entries(ENTITY_TYPES) as [EntityType, typeof ENTITY_TYPES[EntityType]][]).map(
              ([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => {
                    onChange(key)
                    setOpen(false)
                  }}
                  className={clsx(
                    'w-full flex items-center justify-between px-4 py-3 transition-colors duration-150',
                    selected === key
                      ? 'bg-aura-accent/10 text-aura-accent'
                      : 'text-aura-text hover:bg-white/[0.05]',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg leading-none">{cfg.icon}</span>
                    <span className="font-medium">{cfg.label}</span>
                  </div>
                  {selected === key && (
                    <Check size={14} className="text-aura-accent" />
                  )}
                </button>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
