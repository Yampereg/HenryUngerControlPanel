'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, 'id'>) => void
  success: (title: string, message?: string) => void
  error:   (title: string, message?: string) => void
  info:    (title: string, message?: string) => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    ({ type, title, message }: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev.slice(-4), { id, type, title, message }])
      setTimeout(() => dismiss(id), 5000)
    },
    [dismiss],
  )

  const success = useCallback((t: string, m?: string) => toast({ type: 'success', title: t, message: m }), [toast])
  const error   = useCallback((t: string, m?: string) => toast({ type: 'error',   title: t, message: m }), [toast])
  const info    = useCallback((t: string, m?: string) => toast({ type: 'info',    title: t, message: m }), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}

      {/* Toast stack — fixed bottom-right */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Single toast card
// ---------------------------------------------------------------------------
const ICON = {
  success: <CheckCircle size={18} className="text-aura-success shrink-0" />,
  error:   <XCircle    size={18} className="text-aura-error   shrink-0" />,
  info:    <AlertCircle size={18} className="text-aura-accent  shrink-0" />,
}

const BORDER = {
  success: 'border-aura-success/30',
  error:   'border-aura-error/30',
  info:    'border-aura-accent/30',
}

const GLOW = {
  success: 'shadow-[0_0_20px_rgba(52,211,153,0.12)]',
  error:   'shadow-[0_0_20px_rgba(248,113,113,0.12)]',
  info:    'shadow-[0_0_20px_rgba(34,211,238,0.12)]',
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={`pointer-events-auto w-80 glass rounded-xl p-4 flex items-start gap-3 border ${BORDER[toast.type]} ${GLOW[toast.type]}`}
    >
      {ICON[toast.type]}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-aura-text leading-tight">{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-aura-muted mt-0.5 leading-relaxed">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-aura-muted hover:text-aura-text transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </motion.div>
  )
}
