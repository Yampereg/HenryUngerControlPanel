'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Loader2, Palette, Star, Trash2 } from 'lucide-react'
import { useToast } from './ToastProvider'
import { ENTITY_TYPES, Entity } from '@/lib/constants'
import type { ImageResult } from '@/app/api/image-process/route'

// Entity types that support images (no lectures)
const IMAGE_TYPES = ['films', 'directors', 'writers', 'painters', 'philosophers', 'paintings', 'books', 'courses'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

// Types that get Wikimedia Commons search + NIMA scoring
const WIKIMEDIA_TYPES = new Set(['philosophers', 'directors', 'writers', 'painters', 'paintings', 'films'])

// Portrait ratio for these types, square for people
const PORTRAIT_TYPES = new Set(['films', 'paintings', 'books'])

interface TypeStats {
  total:   number
  missing: number
}

interface ImageMeta extends ImageResult {
  colorized_url: string | null
}

// ---------------------------------------------------------------------------
export function ImageGame() {
  const { success, error: toastError, info } = useToast()

  const [stats,        setStats]        = useState<Record<string, TypeStats>>({})
  const [activeType,   setActiveType]   = useState<ImageType | null>(null)
  const [queue,        setQueue]        = useState<Entity[]>([])
  const [queueIdx,     setQueueIdx]     = useState(0)
  const [images,       setImages]       = useState<string[]>([])
  const [imageMeta,    setImageMeta]    = useState<ImageMeta[]>([])
  const [searchLoading,  setSearchLoading]  = useState(false)
  const [scoresLoading,  setScoresLoading]  = useState(false)
  const [uploadingIdx,   setUploadingIdx]   = useState<number | null>(null)
  const [statsLoading,   setStatsLoading]   = useState(true)

  const pollRefs = useRef<ReturnType<typeof setInterval>[]>([])

  const clearPolls = useCallback(() => {
    pollRefs.current.forEach(clearInterval)
    pollRefs.current = []
  }, [])

  // ── Fetch stats for all types ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadStats() {
      setStatsLoading(true)
      const results = await Promise.all(
        IMAGE_TYPES.map(async (t) => {
          const res  = await fetch(`/api/entities/${t}?all=true`)
          const json = await res.json()
          const all: Entity[] = json.entities ?? []
          const missing = all.filter((e) => !e.hasImage).length
          return [t, { total: all.length, missing }] as [string, TypeStats]
        }),
      )
      const map = Object.fromEntries(results)
      setStats(map)
      const first = IMAGE_TYPES.find((t) => map[t]?.missing > 0) ?? null
      setActiveType(first as ImageType | null)
      setStatsLoading(false)
    }
    loadStats()
  }, [])

  // ── Start polling colorize-ready for a single image ───────────────────────────────────────
  const startColorizePolling = useCallback((colorize_key: string, imgIndex: number) => {
    const iv = setInterval(async () => {
      try {
        const res  = await fetch(`/api/colorize-ready?key=${encodeURIComponent(colorize_key)}`)
        const json = await res.json()
        if (json.ready && json.url) {
          clearInterval(iv)
          pollRefs.current = pollRefs.current.filter(r => r !== iv)
          setImageMeta(prev =>
            prev.map((m, i) => i === imgIndex ? { ...m, colorized_url: json.url } : m),
          )
        }
      } catch {
        // ignore — will retry next tick
      }
    }, 5000)
    pollRefs.current.push(iv)
  }, [])

  // ── Fetch images for a given entity ─────────────────────────────────────────────────
  const fetchImages = useCallback(async (entity: Entity, type: string) => {
    clearPolls()
    setImages([])
    setImageMeta([])
    setScoresLoading(false)
    setSearchLoading(true)

    try {
      // Phase 1: get image URLs (fast, ~1-2s)
      const params = new URLSearchParams({
        type,
        name: entity.displayName,
        ...(entity.hebrewName ? { hebrewName: entity.hebrewName } : {}),
      })
      const res  = await fetch(`/api/image-search?${params}`)
      const json = await res.json()
      const urls: string[] = json.images ?? []
      setImages(urls)
      setSearchLoading(false)

      if (!urls.length || !WIKIMEDIA_TYPES.has(type)) return

      // Phase 2: NIMA scoring + B&W detection (~3-10s)
      setScoresLoading(true)
      const processRes = await fetch('/api/image-process', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ urls, entity_type: type }),
      })

      if (!processRes.ok) return

      const processJson = await processRes.json()
      const results: ImageResult[] = processJson.results ?? []
      const meta: ImageMeta[] = results.map(r => ({ ...r, colorized_url: null }))
      setImageMeta(meta)
      setScoresLoading(false)

      // Phase 3: start polling R2 for each pending B&W colorize_key
      meta.forEach((m, i) => {
        if (m.colorize_key && !m.error) startColorizePolling(m.colorize_key, i)
      })
    } catch {
      setSearchLoading(false)
      setScoresLoading(false)
    }
  }, [clearPolls, startColorizePolling])

  // ── Load queue when activeType changes ───────────────────────────────────────────────────
  useEffect(() => {
    if (!activeType) return
    let cancelled = false

    async function loadQueue() {
      const res  = await fetch(`/api/entities/${activeType}`)
      const json = await res.json()
      const entities: Entity[] = json.entities ?? []
      if (cancelled) return
      setQueue(entities)
      setQueueIdx(0)
      setImages([])
      setImageMeta([])
      clearPolls()
      if (entities.length > 0) fetchImages(entities[0], activeType!)
    }
    loadQueue()
    return () => { cancelled = true; clearPolls() }
  }, [activeType, fetchImages, clearPolls])

  // ── Advance to next entity in queue ──────────────────────────────────────────────────────
  const advanceQueue = useCallback((currentQueue: Entity[], currentIdx: number) => {
    clearPolls()
    const nextIdx = currentIdx + 1
    if (nextIdx < currentQueue.length) {
      setQueueIdx(nextIdx)
      fetchImages(currentQueue[nextIdx], activeType!)
    } else {
      setQueueIdx(nextIdx)
    }
  }, [activeType, fetchImages, clearPolls])

  // ── Handle image click → upload ────────────────────────────────────────────────────────────
  async function handleImageClick(originalUrl: string, idx: number) {
    if (uploadingIdx !== null || !activeType) return
    const entity = queue[queueIdx]
    if (!entity) return

    const meta       = imageMeta[idx]
    const displayUrl = meta?.colorized_url ?? originalUrl

    setUploadingIdx(idx)
    try {
      const fetchRes = await fetch(`/api/fetch-image?url=${encodeURIComponent(displayUrl)}`)
      if (!fetchRes.ok) throw new Error('Could not fetch image')
      const blob = await fetchRes.blob()

      const form = new FormData()
      form.append('file', blob, 'image.jpg')
      form.append('entityType', activeType)
      form.append('entityId', String(entity.id))

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: form })
      if (!uploadRes.ok) throw new Error('Upload failed')

      success('Image saved', entity.displayName)
      setStats((prev) => ({
        ...prev,
        [activeType]: { ...prev[activeType], missing: Math.max(0, prev[activeType].missing - 1) },
      }))
      advanceQueue(queue, queueIdx)
    } catch (err) {
      toastError('Upload failed', String(err))
    } finally {
      setUploadingIdx(null)
    }
  }

  function handleSkip() { advanceQueue(queue, queueIdx) }

  async function handleDelete() {
    if (!activeType) return
    const entity = queue[queueIdx]
    if (!entity) return
    const res = await fetch(`/api/entities/${activeType}/${entity.id}`, { method: 'DELETE' })
    if (!res.ok) { toastError('Delete failed'); return }
    info('Entity deleted', entity.displayName)
    clearPolls()
    const newQueue  = queue.filter((_, i) => i !== queueIdx)
    setQueue(newQueue)
    const targetIdx = queueIdx < newQueue.length ? queueIdx : queueIdx - 1
    if (targetIdx >= 0 && newQueue.length > 0) {
      setQueueIdx(targetIdx)
      fetchImages(newQueue[targetIdx], activeType)
    } else {
      setQueueIdx(0); setImages([]); setImageMeta([])
    }
  }

  const entity     = queue[queueIdx] ?? null
  const allDone    = !statsLoading && activeType !== null && queueIdx >= queue.length
  const remaining  = Math.max(0, queue.length - queueIdx)
  const isPortrait = activeType ? PORTRAIT_TYPES.has(activeType) : false

  return (
    <div className="space-y-4">

      {/* Stats chips */}
      <div className="glass rounded-xl p-3 flex flex-wrap gap-2">
        {statsLoading ? (
          <div className="flex items-center gap-2 text-aura-muted text-xs">
            <Loader2 size={14} className="animate-spin" />
            Loading stats…
          </div>
        ) : (
          IMAGE_TYPES.map((t) => {
            const s = stats[t]
            if (!s) return null
            const isActive = t === activeType
            return (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-aura-accent/15 text-aura-accent border border-aura-accent/30'
                    : s.missing > 0
                    ? 'bg-white/5 text-aura-text border border-white/10 hover:border-aura-accent/20'
                    : 'bg-white/[0.03] text-aura-muted border border-white/5'
                }`}
              >
                <span>{ENTITY_TYPES[t as keyof typeof ENTITY_TYPES]?.icon}</span>
                <span>{ENTITY_TYPES[t as keyof typeof ENTITY_TYPES]?.label}</span>
                <span className={`ml-0.5 font-bold ${s.missing > 0 ? 'text-aura-error' : 'text-aura-success'}`}>
                  {s.missing}
                </span>
              </button>
            )
          })
        )}
      </div>

      {/* Game area */}
      <div className="glass rounded-xl p-4 space-y-4">

        <div className="flex items-center justify-between">
          <select
            value={activeType ?? ''}
            onChange={(e) => setActiveType(e.target.value as ImageType)}
            className="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-aura-text focus:outline-none focus:border-aura-accent/40"
          >
            {IMAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTITY_TYPES[t as keyof typeof ENTITY_TYPES]?.label}
              </option>
            ))}
          </select>
          {activeType && <span className="text-xs text-aura-muted">{remaining} remaining</span>}
        </div>

        <AnimatePresence mode="wait">
          {allDone ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center py-10 text-2xl">
              All done 🎉
            </motion.div>
          ) : entity ? (
            <motion.div key={entity.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="space-y-3">

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-aura-text leading-tight">{entity.displayName}</p>
                  {entity.hebrewName && <p className="text-xs text-aura-muted mt-0.5">{entity.hebrewName}</p>}
                  {entity.description && <p className="text-xs text-aura-muted mt-1 leading-relaxed line-clamp-3">{entity.description}</p>}
                </div>
                <button onClick={handleDelete} className="shrink-0 p-1.5 rounded-lg text-aura-muted hover:text-aura-error hover:bg-aura-error/10 transition-all" title="Delete entity">
                  <Trash2 size={15} />
                </button>
              </div>

              {searchLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-aura-muted text-sm">
                  <Loader2 size={18} className="animate-spin" />Searching images…
                </div>
              ) : images.length === 0 ? (
                <div className="text-center py-8 text-aura-muted text-sm">No images found</div>
              ) : (
                <>
                  {scoresLoading && (
                    <div className="flex items-center gap-1.5 text-xs text-aura-muted">
                      <Loader2 size={12} className="animate-spin" />Scoring images…
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((url, idx) => {
                      const meta         = imageMeta[idx]
                      const displayUrl   = meta?.colorized_url ?? url
                      const isColorizing = meta?.was_bw && !meta?.colorized_url && !!meta?.colorize_key
                      return (
                        <button
                          key={idx}
                          onClick={() => handleImageClick(url, idx)}
                          disabled={uploadingIdx !== null}
                          className={`relative overflow-hidden rounded-lg border border-white/10 bg-black/20 ${isPortrait ? 'aspect-[2/3]' : 'aspect-square'} hover:border-aura-accent/40 hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={displayUrl} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />

                          {meta?.score !== undefined && (
                            <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 bg-black/75 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-yellow-300">
                              <Star size={9} className="fill-yellow-300 text-yellow-300" />
                              {meta.score.toFixed(1)}
                            </div>
                          )}

                          {isColorizing && (
                            <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/75 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-[9px] text-purple-300">
                              <Palette size={9} /><Loader2 size={9} className="animate-spin" />
                            </div>
                          )}

                          {meta?.colorized_url && (
                            <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-purple-500/80 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-[9px] text-white font-medium">
                              <Palette size={9} />colorized
                            </div>
                          )}

                          {uploadingIdx === idx && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <Loader2 size={24} className="animate-spin text-aura-accent" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              <div className="flex justify-end">
                <button onClick={handleSkip} disabled={uploadingIdx !== null} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-aura-muted hover:text-aura-text hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  Skip <ChevronRight size={14} />
                </button>
              </div>
            </motion.div>
          ) : (
            !statsLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-aura-muted text-sm">
                <Loader2 size={16} className="animate-spin" />Loading…
              </div>
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
