'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Rect { x: number; y: number; w: number; h: number }
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const MIN_SIZE = 30 // minimum crop dimension in px

interface Props {
  imgSrc:   string
  onApply:  (file: File) => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// ImageCropper
// ---------------------------------------------------------------------------
export function ImageCropper({ imgSrc, onApply, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef       = useRef<HTMLImageElement>(null)

  const [imageRect, setImageRect] = useState<Rect | null>(null)
  const [cropRect,  setCropRect]  = useState<Rect | null>(null)
  const [applying,  setApplying]  = useState(false)

  // drag state — stored in ref so event handlers always get fresh value
  const activeDrag = useRef<{
    handle:    Handle
    startX:    number
    startY:    number
    startCrop: Rect
    imageRect: Rect
  } | null>(null)

  // -------------------------------------------------------------------------
  // Compute rendered image rect on load (letterbox / pillarbox aware)
  // -------------------------------------------------------------------------
  const onImageLoad = useCallback(() => {
    const img       = imgRef.current!
    const container = containerRef.current!
    const cW = container.clientWidth
    const cH = container.clientHeight
    const scale = Math.min(cW / img.naturalWidth, cH / img.naturalHeight)
    const rW = img.naturalWidth  * scale
    const rH = img.naturalHeight * scale
    const rect: Rect = {
      x: (cW - rW) / 2,
      y: (cH - rH) / 2,
      w: rW,
      h: rH,
    }
    setImageRect(rect)
    // Initial crop = entire image
    setCropRect({ ...rect })
  }, [])

  // -------------------------------------------------------------------------
  // Start drag / resize
  // -------------------------------------------------------------------------
  function startDrag(
    e: React.MouseEvent | React.TouchEvent,
    handle: Handle,
  ) {
    e.preventDefault()
    e.stopPropagation()
    if (!cropRect || !imageRect) return
    const pt = 'touches' in e ? e.touches[0] : e
    activeDrag.current = {
      handle,
      startX:    pt.clientX,
      startY:    pt.clientY,
      startCrop: { ...cropRect },
      imageRect: { ...imageRect },
    }
  }

  // -------------------------------------------------------------------------
  // Document-level move + up listeners
  // -------------------------------------------------------------------------
  useEffect(() => {
    function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

    function onMove(e: MouseEvent | TouchEvent) {
      if (!activeDrag.current) return
      const { handle, startX, startY, startCrop: sc, imageRect: ir } = activeDrag.current
      const pt = 'touches' in e ? (e as TouchEvent).touches[0] : (e as MouseEvent)
      const dx = pt.clientX - startX
      const dy = pt.clientY - startY

      setCropRect(() => {
        let { x, y, w, h } = sc

        if (handle === 'move') {
          x = clamp(sc.x + dx, ir.x, ir.x + ir.w - sc.w)
          y = clamp(sc.y + dy, ir.y, ir.y + ir.h - sc.h)
        } else {
          // Resize: each handle moves specific edges
          if (handle === 'nw') {
            const nx = clamp(sc.x + dx, ir.x, sc.x + sc.w - MIN_SIZE)
            const ny = clamp(sc.y + dy, ir.y, sc.y + sc.h - MIN_SIZE)
            w = sc.x + sc.w - nx;  x = nx
            h = sc.y + sc.h - ny;  y = ny
          } else if (handle === 'ne') {
            const ny = clamp(sc.y + dy, ir.y, sc.y + sc.h - MIN_SIZE)
            w = clamp(sc.w + dx, MIN_SIZE, ir.x + ir.w - sc.x)
            h = sc.y + sc.h - ny;  y = ny
          } else if (handle === 'sw') {
            const nx = clamp(sc.x + dx, ir.x, sc.x + sc.w - MIN_SIZE)
            w = sc.x + sc.w - nx;  x = nx
            h = clamp(sc.h + dy, MIN_SIZE, ir.y + ir.h - sc.y)
          } else if (handle === 'se') {
            w = clamp(sc.w + dx, MIN_SIZE, ir.x + ir.w - sc.x)
            h = clamp(sc.h + dy, MIN_SIZE, ir.y + ir.h - sc.y)
          }
        }
        return { x, y, w, h }
      })
    }

    function onUp() { activeDrag.current = null }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend',  onUp)

    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend',  onUp)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Apply crop → canvas → File → onApply
  // -------------------------------------------------------------------------
  function apply() {
    if (!cropRect || !imageRect || !imgRef.current) return
    setApplying(true)

    const img    = imgRef.current
    const scaleX = img.naturalWidth  / imageRect.w
    const scaleY = img.naturalHeight / imageRect.h

    const srcX = Math.round((cropRect.x - imageRect.x) * scaleX)
    const srcY = Math.round((cropRect.y - imageRect.y) * scaleY)
    const srcW = Math.round(cropRect.w * scaleX)
    const srcH = Math.round(cropRect.h * scaleY)

    const canvas = document.createElement('canvas')
    canvas.width  = srcW
    canvas.height = srcH

    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)

    canvas.toBlob(
      (blob) => {
        setApplying(false)
        if (blob) {
          onApply(new File([blob], 'cropped.jpeg', { type: 'image/jpeg' }))
        }
      },
      'image/jpeg',
      0.95,
    )
  }

  // -------------------------------------------------------------------------
  // Handle corner positions
  // -------------------------------------------------------------------------
  function cornerStyle(pos: Handle, r: Rect): React.CSSProperties {
    const half = 8
    return {
      left:   pos === 'nw' || pos === 'sw' ? r.x - half : r.x + r.w - half,
      top:    pos === 'nw' || pos === 'ne' ? r.y - half : r.y + r.h - half,
      cursor: `${pos}-resize`,
    }
  }

  const handles: Handle[] = ['nw', 'ne', 'sw', 'se']

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-3 w-full">

      {/* Image + crop overlay */}
      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden bg-black select-none"
        style={{ height: 280 }}
      >
        <img
          ref={imgRef}
          src={imgSrc}
          alt="Crop preview"
          className="w-full h-full object-contain"
          onLoad={onImageLoad}
          draggable={false}
        />

        {cropRect && (
          <>
            {/* Semi-transparent overlay via inset box-shadow */}
            <div
              className="absolute pointer-events-none"
              style={{
                left:      cropRect.x,
                top:       cropRect.y,
                width:     cropRect.w,
                height:    cropRect.h,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.58)',
                border:    '1.5px solid rgba(34,211,238,0.75)',
              }}
            />

            {/* Rule-of-thirds grid */}
            <div
              className="absolute pointer-events-none"
              style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
            >
              {[1, 2].map(n => (
                <div
                  key={`v${n}`}
                  className="absolute top-0 bottom-0 w-px bg-white/[0.12]"
                  style={{ left: `${(n / 3) * 100}%` }}
                />
              ))}
              {[1, 2].map(n => (
                <div
                  key={`h${n}`}
                  className="absolute left-0 right-0 h-px bg-white/[0.12]"
                  style={{ top: `${(n / 3) * 100}%` }}
                />
              ))}
            </div>

            {/* Draggable crop area (move) */}
            <div
              className="absolute cursor-move"
              style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
              onMouseDown={e => startDrag(e, 'move')}
              onTouchStart={e => startDrag(e, 'move')}
            />

            {/* Corner handles */}
            {handles.map(h => (
              <div
                key={h}
                className="absolute w-4 h-4 rounded-sm z-10"
                style={{
                  ...cornerStyle(h, cropRect),
                  background:  'rgba(34,211,238,0.9)',
                  boxShadow:   '0 0 8px rgba(34,211,238,0.5)',
                }}
                onMouseDown={e => startDrag(e, h)}
                onTouchStart={e => startDrag(e, h)}
              />
            ))}
          </>
        )}
      </div>

      {/* Dimension info */}
      {cropRect && imageRect && imgRef.current && (
        <p className="text-[10px] text-aura-muted/60 text-center font-mono">
          {Math.round(cropRect.w * (imgRef.current.naturalWidth  / imageRect.w))}
          {' × '}
          {Math.round(cropRect.h * (imgRef.current.naturalHeight / imageRect.h))}
          {' px'}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={applying}
          className="flex-1 py-2.5 rounded-xl border border-white/[0.06] text-aura-muted
                     text-sm font-medium hover:bg-white/[0.03] hover:text-aura-text
                     transition-all duration-200 disabled:opacity-40"
        >
          <span className="flex items-center gap-1.5 justify-center">
            <X size={13} /> Cancel
          </span>
        </button>
        <button
          onClick={apply}
          disabled={applying || !cropRect}
          className={clsx(
            'flex-[2] py-2.5 rounded-xl text-sm font-semibold',
            'bg-gradient-to-r from-aura-accent to-aura-indigo text-aura-base',
            'hover:opacity-90 active:scale-[0.98] transition-all duration-200',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          <span className="flex items-center gap-1.5 justify-center">
            {applying
              ? <><Loader2 size={13} className="animate-spin" /> Applying…</>
              : <><Check size={13} /> Apply Crop</>
            }
          </span>
        </button>
      </div>
    </div>
  )
}
