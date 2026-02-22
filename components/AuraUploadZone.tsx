'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Upload, CheckCircle2, AlertCircle,
  Image as ImageIcon, Link, Loader2, ArrowRight, Crop,
} from 'lucide-react'
import { Entity, EntityType, R2_IMAGES_PREFIX } from '@/lib/constants'
import { useToast } from './ToastProvider'
import { ImageCropper } from './ImageCropper'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Tab      = 'file' | 'url' | 'crop'
type ZoneState = 'idle' | 'hover' | 'fetching_url' | 'loading_crop' | 'cropping' | 'preview' | 'uploading' | 'success' | 'error'

interface Step { label: string; done: boolean }

interface Props {
  entity:     Entity | null
  entityType: EntityType | null
  onSuccess?: (info: { url: string }) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AuraUploadZone({ entity, entityType, onSuccess }: Props) {
  const { success: toastSuccess, error: toastError } = useToast()

  const [tab,        setTab]        = useState<Tab>('file')
  const [state,      setState]      = useState<ZoneState>('idle')
  const [preview,    setPreview]    = useState<string | null>(null)
  const [file,       setFile]       = useState<File | null>(null)
  const [urlInput,   setUrlInput]   = useState('')
  const [steps,      setSteps]      = useState<Step[]>([])
  const [successUrl, setSuccessUrl] = useState<string | null>(null)
  const [cropSrc,    setCropSrc]    = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const disabled = !entity || !entityType

  // When entity changes while in crop mode, reset to idle
  useEffect(() => {
    if (state === 'cropping' || state === 'loading_crop') {
      setState('idle')
      if (cropSrc) { URL.revokeObjectURL(cropSrc); setCropSrc(null) }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity?.id])

  // -------------------------------------------------------------------------
  // Shared: handle a File object (from drop, browse, URL fetch, or crop)
  // -------------------------------------------------------------------------
  const handleFile = useCallback(
    (f: File) => {
      if (!f.type.startsWith('image/') && !f.type.includes('octet-stream')) {
        toastError('Invalid file', 'Please provide an image (JPEG, PNG, WEBP…)')
        return
      }
      setFile(f)
      setPreview(URL.createObjectURL(f))
      setSuccessUrl(null)
      setState('preview')
    },
    [toastError],
  )

  // -------------------------------------------------------------------------
  // File tab — drag & drop / browse
  // -------------------------------------------------------------------------
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const dropped = e.dataTransfer.files[0]
      if (dropped) handleFile(dropped)
    },
    [handleFile],
  )

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0]
      if (picked) handleFile(picked)
    },
    [handleFile],
  )

  // -------------------------------------------------------------------------
  // URL tab — fetch via proxy then hand off to handleFile
  // -------------------------------------------------------------------------
  async function loadFromUrl() {
    const trimmed = urlInput.trim()
    if (!trimmed) return

    setState('fetching_url')
    try {
      const res = await fetch(`/api/fetch-image?url=${encodeURIComponent(trimmed)}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? `Server error ${res.status}`)
      }

      const blob     = await res.blob()
      const filename = trimmed.split('/').pop()?.split('?')[0] || 'image.jpg'
      const mimeType = blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
      const f        = new File([blob], filename, { type: mimeType })

      handleFile(f)
    } catch (err) {
      setState('idle')
      toastError('Could not load URL', (err as Error).message)
    }
  }

  // -------------------------------------------------------------------------
  // Crop tab — fetch existing R2 image then open the cropper
  // -------------------------------------------------------------------------
  async function loadCropImage() {
    if (!entity || !entityType) return
    setState('loading_crop')

    try {
      const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''
      const r2Key      = `${R2_IMAGES_PREFIX}/${entityType}/${entity.id}.jpeg`
      const imageUrl   = publicBase ? `${publicBase}/${r2Key}` : ''

      if (!imageUrl) throw new Error('R2 public URL not configured')

      // Proxy via fetch-image to avoid CORS issues with canvas
      const res = await fetch(`/api/fetch-image?url=${encodeURIComponent(imageUrl)}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? `Server error ${res.status}`)
      }

      const blob      = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      setCropSrc(objectUrl)
      setState('cropping')
    } catch (err) {
      setState('idle')
      toastError('Could not load image', (err as Error).message)
    }
  }

  function handleCropApply(croppedFile: File) {
    if (cropSrc) { URL.revokeObjectURL(cropSrc); setCropSrc(null) }
    handleFile(croppedFile)   // → 'preview' state → normal upload flow
  }

  function handleCropCancel() {
    if (cropSrc) { URL.revokeObjectURL(cropSrc); setCropSrc(null) }
    setState('idle')
  }

  // -------------------------------------------------------------------------
  // Upload to R2
  // -------------------------------------------------------------------------
  async function upload() {
    if (!file || !entity || !entityType) return

    setState('uploading')
    const stepList: Step[] = [
      { label: 'Preparing image…', done: false },
      { label: 'Uploading to Cloudflare R2…', done: false },
      { label: 'Finalizing…', done: false },
    ]
    setSteps([...stepList])

    try {
      await delay(300)
      stepList[0].done = true
      setSteps([...stepList])

      const form = new FormData()
      form.append('file', file)
      form.append('entityType', entityType)
      form.append('entityId', String(entity.id))

      const res  = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Upload failed')

      stepList[1].done = true
      setSteps([...stepList])
      await delay(280)
      stepList[2].done = true
      setSteps([...stepList])
      await delay(180)

      setSuccessUrl(data.publicUrl)
      setState('success')

      toastSuccess('Asset uploaded!', `Saved as ${entity.id}.jpeg`)
      onSuccess?.({ url: data.publicUrl })
    } catch (err) {
      setState('error')
      toastError('Upload failed', (err as Error).message)
    }
  }

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------
  function reset() {
    setState('idle')
    setPreview(null)
    setFile(null)
    setSteps([])
    setSuccessUrl(null)
    setUrlInput('')
    if (cropSrc) { URL.revokeObjectURL(cropSrc); setCropSrc(null) }
    if (inputRef.current) inputRef.current.value = ''
  }

  // -------------------------------------------------------------------------
  // Derived flags
  // -------------------------------------------------------------------------
  const isHovering = state === 'hover'
  const isFetching = state === 'fetching_url' || state === 'loading_crop'
  const isLoading  = state === 'uploading'
  const isDone     = state === 'success'
  const isError    = state === 'error'
  const isInactive = state === 'idle' || state === 'fetching_url'

  const showCropTab = !!(entity?.hasImage)

  const borderColor = clsx(
    isLoading  ? 'border-aura-indigo/50'  :
    isDone     ? 'border-aura-success/50' :
    isError    ? 'border-aura-error/50'   :
    isHovering || state === 'preview' ? 'border-aura-accent/40' :
    'border-white/[0.05]',
  )

  const glowShadow = clsx(
    isLoading  ? 'shadow-[0_0_50px_rgba(129,140,248,0.10)]' :
    isDone     ? 'shadow-[0_0_50px_rgba(52,211,153,0.10)]'  :
    isError    ? 'shadow-[0_0_50px_rgba(248,113,113,0.10)]' :
    isHovering || state === 'preview' ? 'shadow-[0_0_50px_rgba(34,211,238,0.08)]' :
    '',
  )

  // -------------------------------------------------------------------------
  // Crop mode — full replacement of the normal zone UI
  // -------------------------------------------------------------------------
  if (state === 'cropping' && cropSrc) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-xs text-aura-muted text-center">
          Drag the corners to adjust the crop, then click <strong className="text-aura-text">Apply</strong>.
        </p>
        <ImageCropper
          imgSrc={cropSrc}
          onApply={handleCropApply}
          onCancel={handleCropCancel}
        />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full gap-4">

      {/* Tab switcher — only visible when idle */}
      <AnimatePresence>
        {isInactive && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex gap-1 p-1 rounded-xl bg-black/30 border border-white/[0.04] self-start"
          >
            {(['file', 'url'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setState('idle') }}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                  tab === t
                    ? 'bg-white/[0.07] text-aura-text'
                    : 'text-aura-muted hover:text-aura-text',
                )}
              >
                {t === 'file' ? <Upload size={11} /> : <Link size={11} />}
                {t === 'file' ? 'Drop / Browse' : 'From URL'}
              </button>
            ))}

            {/* Crop tab — only when entity has an existing image */}
            {showCropTab && (
              <button
                onClick={() => { setTab('crop'); setState('idle') }}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                  tab === 'crop'
                    ? 'bg-aura-indigo/15 text-aura-indigo'
                    : 'text-aura-muted hover:text-aura-text',
                )}
              >
                <Crop size={11} />
                Crop existing
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main zone */}
      <motion.div
        onDragEnter={(e) => { e.preventDefault(); if (!disabled && tab === 'file' && isInactive) setState('hover') }}
        onDragLeave={(e) => { e.preventDefault(); if (state === 'hover') setState('idle') }}
        onDragOver={(e)  => { e.preventDefault() }}
        onDrop={disabled || tab !== 'file' ? undefined : onDrop}
        onClick={() => {
          if (tab === 'file' && !disabled && isInactive) inputRef.current?.click()
        }}
        animate={{ scale: isHovering ? 1.01 : 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className={clsx(
          'relative flex-1 min-h-64 flex flex-col items-center justify-center',
          'rounded-2xl border transition-all duration-300 overflow-hidden',
          'select-none',
          borderColor, glowShadow,
          tab === 'file' && !disabled && isInactive ? 'cursor-pointer' : 'cursor-default',
          state === 'preview' || isDone ? 'bg-black/20' : 'glass',
        )}
      >
        {/* Animated SVG dashed border */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <linearGradient id="dg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#22d3ee" stopOpacity="0.5" />
              <stop offset="50%"  stopColor="#818cf8" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <rect
            x="1" y="1"
            width="calc(100% - 2)" height="calc(100% - 2)"
            rx="15" fill="none"
            stroke={state !== 'idle' ? 'url(#dg)' : 'transparent'}
            strokeWidth="1.5" strokeDasharray="10 6"
            className="animate-dash"
          />
        </svg>

        <AnimatePresence>
          {(isHovering || state === 'preview') && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gradient-to-br from-aura-accent/[0.04] to-aura-indigo/[0.04] pointer-events-none"
            />
          )}
        </AnimatePresence>

        <div className="relative z-10 flex flex-col items-center gap-4 p-8 w-full">
          <AnimatePresence mode="wait">

            {/* FILE TAB · idle / hover */}
            {tab === 'file' && (state === 'idle' || state === 'hover') && (
              <motion.div
                key="file-idle"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="flex flex-col items-center gap-4 text-center"
              >
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                  className="w-16 h-16 rounded-2xl flex items-center justify-center
                             bg-gradient-to-br from-aura-accent/15 to-aura-indigo/15
                             border border-white/[0.07]"
                >
                  <Upload size={26} className={disabled ? 'text-aura-muted' : 'text-aura-accent'} />
                </motion.div>
                {disabled ? (
                  <p className="text-aura-muted text-sm">Select a record above first</p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-aura-text font-semibold">Drop your image here</p>
                    <p className="text-aura-muted text-sm">or click to browse · JPEG, PNG, WEBP</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* URL TAB · idle */}
            {tab === 'url' && state === 'idle' && (
              <motion.div
                key="url-idle"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="flex flex-col items-center gap-5 w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center
                               bg-gradient-to-br from-aura-indigo/15 to-aura-accent/15
                               border border-white/[0.07]">
                  <Link size={24} className={disabled ? 'text-aura-muted' : 'text-aura-indigo'} />
                </div>

                {disabled ? (
                  <p className="text-aura-muted text-sm">Select a record above first</p>
                ) : (
                  <div className="w-full space-y-2">
                    <input
                      autoFocus
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadFromUrl()}
                      placeholder="https://example.com/image.jpg"
                      className="w-full bg-black/30 border border-white/[0.07] rounded-xl
                                 px-4 py-3 text-sm text-aura-text placeholder:text-aura-muted/50
                                 outline-none focus:border-aura-indigo/50
                                 focus:shadow-[0_0_20px_rgba(129,140,248,0.08)]
                                 transition-all duration-200"
                    />
                    <button
                      onClick={loadFromUrl}
                      disabled={!urlInput.trim()}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                                 bg-aura-indigo/15 border border-aura-indigo/25 text-aura-indigo
                                 text-sm font-medium hover:bg-aura-indigo/22 disabled:opacity-30
                                 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      Load image <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* CROP TAB · idle */}
            {tab === 'crop' && state === 'idle' && (
              <motion.div
                key="crop-idle"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="flex flex-col items-center gap-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center
                               bg-gradient-to-br from-aura-indigo/15 to-aura-accent/15
                               border border-white/[0.07]">
                  <Crop size={24} className="text-aura-indigo" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-aura-text font-semibold">Crop existing image</p>
                  <p className="text-aura-muted text-sm">Load and crop the current image</p>
                </div>
                <button
                  onClick={loadCropImage}
                  disabled={disabled || isFetching}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                             bg-aura-indigo/15 border border-aura-indigo/25 text-aura-indigo
                             text-sm font-medium hover:bg-aura-indigo/22
                             disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <Crop size={14} /> Load &amp; Crop
                </button>
              </motion.div>
            )}

            {/* Fetching URL / loading crop */}
            {(state === 'fetching_url' || state === 'loading_crop') && (
              <motion.div
                key="fetching"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4"
              >
                <Loader2 size={36} className="text-aura-indigo animate-spin" />
                <p className="text-aura-muted text-sm">
                  {state === 'loading_crop' ? 'Loading image…' : 'Fetching image…'}
                </p>
              </motion.div>
            )}

            {/* Preview */}
            {state === 'preview' && preview && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 w-full"
              >
                <img
                  src={preview} alt="Preview"
                  className="max-h-48 max-w-full rounded-xl object-contain shadow-2xl"
                />
                <p className="text-aura-muted text-xs truncate max-w-xs">{file?.name}</p>
              </motion.div>
            )}

            {/* Uploading */}
            {state === 'uploading' && (
              <motion.div
                key="uploading"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-5 w-full"
              >
                <div className="relative w-16 h-16">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                    className="absolute inset-0 rounded-full border-2 border-transparent
                               border-t-aura-accent border-r-aura-indigo/60"
                  />
                  <div className="absolute inset-2 rounded-full bg-aura-surface flex items-center justify-center">
                    <Upload size={16} className="text-aura-accent" />
                  </div>
                </div>

                <div className="space-y-2 w-full max-w-xs">
                  {steps.map((step, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-center gap-2.5"
                    >
                      <div className={clsx(
                        'w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                        step.done
                          ? 'bg-aura-success/15 border border-aura-success/30'
                          : 'bg-aura-indigo/15 border border-aura-indigo/30',
                      )}>
                        {step.done
                          ? <CheckCircle2 size={9} className="text-aura-success" />
                          : <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                              className="w-2 h-2 border border-aura-indigo rounded-full border-t-transparent"
                            />
                        }
                      </div>
                      <p className={clsx('text-xs', step.done ? 'text-aura-muted line-through' : 'text-aura-text')}>
                        {step.label}
                      </p>
                    </motion.div>
                  ))}
                </div>

                <div className="w-full max-w-xs h-0.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-transparent via-aura-accent to-transparent"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                    style={{ width: '60%' }}
                  />
                </div>
              </motion.div>
            )}

            {/* Success */}
            {state === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                  className="w-16 h-16 rounded-full bg-aura-success/10 border border-aura-success/25
                             flex items-center justify-center shadow-[0_0_30px_rgba(52,211,153,0.15)]"
                >
                  <CheckCircle2 size={30} className="text-aura-success" />
                </motion.div>
                <div>
                  <p className="text-aura-success font-semibold">Upload complete</p>
                  {successUrl && (
                    <p className="text-xs text-aura-muted/50 mt-2 break-all font-mono leading-relaxed">
                      {successUrl}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Error */}
            {state === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-4 text-center"
              >
                <div className="w-16 h-16 rounded-full bg-aura-error/08 border border-aura-error/25
                                flex items-center justify-center">
                  <AlertCircle size={30} className="text-aura-error" />
                </div>
                <p className="text-aura-error font-medium">Upload failed</p>
                <p className="text-aura-muted text-xs">Check the browser console for details</p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onInputChange} />
      </motion.div>

      {/* Action buttons */}
      <AnimatePresence>
        {state === 'preview' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            className="flex gap-3"
          >
            <button
              onClick={reset}
              className="flex-1 py-3 rounded-xl border border-white/[0.06] text-aura-muted
                         text-sm font-medium hover:bg-white/[0.03] hover:text-aura-text transition-all duration-200"
            >
              Clear
            </button>
            <button
              onClick={upload}
              className="flex-[2] py-3 rounded-xl text-sm font-semibold text-aura-base
                         bg-gradient-to-r from-aura-accent to-aura-indigo
                         hover:opacity-90 active:scale-[0.98] transition-all duration-200
                         shadow-[0_0_28px_rgba(34,211,238,0.2)]"
            >
              <span className="flex items-center gap-2 justify-center">
                <ImageIcon size={15} /> Upload Image
              </span>
            </button>
          </motion.div>
        )}

        {(state === 'success' || state === 'error') && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="w-full">
            <button
              onClick={reset}
              className="w-full py-3 rounded-xl border border-white/[0.06] text-aura-muted
                         text-sm font-medium hover:bg-white/[0.03] hover:text-aura-text transition-all duration-200"
            >
              Upload another
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
