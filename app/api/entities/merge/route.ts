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
  if (fromJunction && toJunction) {
    // Get every lecture linked to the entity being deleted (select * to preserve all columns)
    const { data: fromRows, error: fetchErr } = await supabase
      .from(fromJunction.table)
      .select('*')
      .eq(fromJunction.fkCol, deleteId)

    if (fetchErr) {
      console.error('[merge fetch]', fetchErr)
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    if (fromRows && fromRows.length > 0) {
      // Find lecture_ids already linked to keepId — these would conflict on update
      const { data: existingRows } = await supabase
        .from(toJunction.table)
        .select('lecture_id')
        .eq(toJunction.fkCol, keepId)

      const existingLectureIds = (existingRows ?? []).map((r: Record<string, unknown>) => r.lecture_id as number)

      // Step 1: delete the deleteId rows that would conflict (keepId already covers them)
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

      // Step 2: update all remaining deleteId rows → point them to keepId
      // This preserves relationship_type and all other columns in-place.
      const { error: updateErr } = await supabase
        .from(fromJunction.table)
        .update({ [fromJunction.fkCol]: keepId })
        .eq(fromJunction.fkCol, deleteId)
      if (updateErr) {
        console.error('[merge update]', updateErr)
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }
    }

  }

  // ------------------------------------------------------------------
  // 2. Delete the entity row
  // ------------------------------------------------------------------
  const { error: delEntityErr } = await supabase
    .from(deleteType)
    .delete()
    .eq('id', deleteId)

  if (delEntityErr) {
    console.error('[merge del entity]', delEntityErr)
    return NextResponse.json({ error: delEntityErr.message }, { status: 500 })
  }

  // ------------------------------------------------------------------
  // 3. Handle R2 images (best-effort)
  //    • If keep has no image but delete does → copy delete's image to keep
  //    • Then delete the deleted entity's image
  // ------------------------------------------------------------------
  try {
    const deleteKey = `${R2_IMAGES_PREFIX}/${deleteType}/${deleteId}.jpeg`
    const keepKey   = `${R2_IMAGES_PREFIX}/${keepType}/${keepId}.jpeg`

    const [deleteHasImage, keepHasImage] = await Promise.all([
      r2KeyExists(deleteKey),
      r2KeyExists(keepKey),
    ])

    if (deleteHasImage && !keepHasImage) {
      await copyInR2(deleteKey, keepKey)
    }

    if (deleteHasImage) {
      await deleteFromR2(deleteKey)
    }
  } catch (e) {
    console.warn('[merge image]', e)
  }

  return NextResponse.json({ ok: true })
}
