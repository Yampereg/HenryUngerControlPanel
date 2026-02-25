// LOCATION: app/api/entities/merge/route.ts  (replace existing)

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ENTITY_TYPES, JUNCTION_MAP, EntityType, R2_IMAGES_PREFIX } from '@/lib/constants'
import { deleteFromR2, r2KeyExists, copyInR2 } from '@/lib/r2'

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    keepId:     number
    keepType:   EntityType
    deleteId:   number
    deleteType: EntityType
  }

  const { keepId, keepType, deleteId, deleteType } = body

  if (!ENTITY_TYPES[keepType] || !ENTITY_TYPES[deleteType]) {
    return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
  }

  const fromJunction = JUNCTION_MAP[deleteType]
  const toJunction   = JUNCTION_MAP[keepType]

  // ------------------------------------------------------------------
  // 1. Migrate junction rows: move deleteId's lectures → keepId
  // ------------------------------------------------------------------
  if (fromJunction) {
    // Get every lecture linked to the entity being deleted
    const { data: fromRows, error: fetchErr } = await supabase
      .from(fromJunction.table)
      .select('*')
      .eq(fromJunction.fkCol, deleteId)

    if (fetchErr) {
      console.error('[merge fetch]', fetchErr)
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    if (fromRows && fromRows.length > 0) {
      if (keepType === deleteType && toJunction) {
        // ── Same-type merge: UPDATE in place ─────────────────────────────
        // Find lecture_ids already linked to keepId — these would conflict
        const { data: existingRows } = await supabase
          .from(toJunction.table)
          .select('lecture_id')
          .eq(toJunction.fkCol, keepId)

        const existingLectureIds = (existingRows ?? []).map((r: Record<string, unknown>) => r.lecture_id as number)

        // Delete conflicting rows first
        if (existingLectureIds.length > 0) {
          const { error: delConflictErr } = await supabase
            .from(fromJunction.table)
            .delete()
            .eq(fromJunction.fkCol, deleteId)
            .in('lecture_id', existingLectureIds)
          if (delConflictErr) {
            console.error('[merge del conflict]', delConflictErr)
            return NextResponse.json({ error: delConflictErr.message }, { status: 500 })
          }
        }

        // Update remaining rows to point to keepId
        const { error: updateErr } = await supabase
          .from(fromJunction.table)
          .update({ [fromJunction.fkCol]: keepId })
          .eq(fromJunction.fkCol, deleteId)
        if (updateErr) {
          console.error('[merge update]', updateErr)
          return NextResponse.json({ error: updateErr.message }, { status: 500 })
        }
      } else if (toJunction) {
        // ── Cross-type merge: INSERT into toJunction + DELETE from fromJunction ──
        // We cannot UPDATE across tables with different FK columns — that would
        // violate the FK constraint. Instead insert new rows and delete old ones.

        // Get lecture_ids already linked to keepId in the target table
        const { data: existingRows } = await supabase
          .from(toJunction.table)
          .select('lecture_id')
          .eq(toJunction.fkCol, keepId)

        const existingLectureIds = new Set(
          (existingRows ?? []).map((r: Record<string, unknown>) => r.lecture_id as number),
        )

        // Insert rows that don't already exist in toJunction
        const rowsToInsert = fromRows
          .filter((r: Record<string, unknown>) => !existingLectureIds.has(r.lecture_id as number))
          .map((r: Record<string, unknown>) => ({
            lecture_id:        r.lecture_id,
            [toJunction.fkCol]: keepId,
            relationship_type: r.relationship_type ?? 'mentioned',
          }))

        if (rowsToInsert.length > 0) {
          const { error: insertErr } = await supabase
            .from(toJunction.table)
            .insert(rowsToInsert)
          if (insertErr) {
            console.error('[merge cross insert]', insertErr)
            return NextResponse.json({ error: insertErr.message }, { status: 500 })
          }
        }

        // Delete all fromJunction rows for deleteId
        const { error: delErr } = await supabase
          .from(fromJunction.table)
          .delete()
          .eq(fromJunction.fkCol, deleteId)
        if (delErr) {
          console.error('[merge cross delete]', delErr)
          return NextResponse.json({ error: delErr.message }, { status: 500 })
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // 2. Handle R2 image: copy if keepId has no image but deleteId does
  // ------------------------------------------------------------------
  const keepImgKey   = `${R2_IMAGES_PREFIX}/${keepType}/${keepId}.jpg`
  const deleteImgKey = `${R2_IMAGES_PREFIX}/${deleteType}/${deleteId}.jpg`

  const [keepHasImg, deleteHasImg] = await Promise.all([
    r2KeyExists(keepImgKey),
    r2KeyExists(deleteImgKey),
  ])

  if (!keepHasImg && deleteHasImg) {
    // Copy image from deleteId → keepId (possibly different type folder)
    const destKey = `${R2_IMAGES_PREFIX}/${keepType}/${keepId}.jpg`
    await copyInR2(deleteImgKey, destKey).catch(e => console.error('[merge img copy]', e))
  }

  // Always delete the old image
  if (deleteHasImg) {
    await deleteFromR2(deleteImgKey).catch(e => console.error('[merge img del]', e))
  }

  // ------------------------------------------------------------------
  // 3. Delete the entity being merged away
  // ------------------------------------------------------------------
  const { error: deleteErr } = await supabase
    .from(deleteType)
    .delete()
    .eq('id', deleteId)

  if (deleteErr) {
    console.error('[merge delete entity]', deleteErr)
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}