import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ENTITY_TYPES, JUNCTION_MAP, EntityType, R2_IMAGES_PREFIX } from '@/lib/constants'
import { r2KeyExists, copyInR2, deleteFromR2 } from '@/lib/r2'

export async function POST(req: NextRequest) {
  const { entityId, fromType, toType } = await req.json() as {
    entityId: number
    fromType: EntityType
    toType:   EntityType
  }

  if (!ENTITY_TYPES[fromType] || !ENTITY_TYPES[toType] || fromType === toType) {
    return NextResponse.json({ error: 'Invalid types' }, { status: 400 })
  }

  const fromNameField = ENTITY_TYPES[fromType].nameField
  const toNameField   = ENTITY_TYPES[toType].nameField

  // ------------------------------------------------------------------
  // 1. Fetch the source entity
  // ------------------------------------------------------------------
  const { data: srcRows, error: fetchErr } = await supabase
    .from(fromType)
    .select('*')
    .eq('id', entityId)
    .limit(1)

  if (fetchErr || !srcRows?.length) {
    return NextResponse.json({ error: fetchErr?.message ?? 'Entity not found' }, { status: 404 })
  }

  const src = srcRows[0] as Record<string, unknown>

  // ------------------------------------------------------------------
  // 2. Insert into target table
  // ------------------------------------------------------------------
  const insertPayload: Record<string, unknown> = {
    [toNameField]: src[fromNameField],
    hebrew_name:   src.hebrew_name  ?? null,
    description:   src.description  ?? null,
  }

  const { data: inserted, error: insertErr } = await supabase
    .from(toType)
    .insert(insertPayload)
    .select('id')
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  const newId: number = (inserted as Record<string, unknown>).id as number

  // ------------------------------------------------------------------
  // 3. Migrate junction rows
  //    If junctions are the same table (shouldn't happen) just update the FK.
  //    If different tables, copy rows then delete originals.
  // ------------------------------------------------------------------
  const fromJunction = JUNCTION_MAP[fromType]
  const toJunction   = JUNCTION_MAP[toType]

  if (fromJunction && toJunction) {
    const { data: juncRows } = await supabase
      .from(fromJunction.table)
      .select('*')
      .eq(fromJunction.fkCol, entityId)

    if (juncRows && juncRows.length > 0) {
      if (fromJunction.table === toJunction.table) {
        // Same junction table — just update the FK
        await supabase
          .from(fromJunction.table)
          .update({ [fromJunction.fkCol]: newId })
          .eq(fromJunction.fkCol, entityId)
      } else {
        // Different junction tables — copy rows then delete originals
        // Deduplicate by lecture_id to avoid unique constraint violations
        const seenLectureIds = new Set<unknown>()
        const newRows = (juncRows as Record<string, unknown>[])
          .filter((r) => {
            if (seenLectureIds.has(r.lecture_id)) return false
            seenLectureIds.add(r.lecture_id)
            return true
          })
          .map((r) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [fromJunction.fkCol]: _removed, ...rest } = r
            return { ...rest, [toJunction.fkCol]: newId }
          })

        if (newRows.length > 0) {
          const { error: juncInsertErr } = await supabase
            .from(toJunction.table)
            .insert(newRows)
          if (juncInsertErr) {
            // Roll back: delete the newly inserted entity
            await supabase.from(toType).delete().eq('id', newId)
            return NextResponse.json({ error: juncInsertErr.message }, { status: 500 })
          }
        }

        await supabase
          .from(fromJunction.table)
          .delete()
          .eq(fromJunction.fkCol, entityId)
      }
    }
  }

  // ------------------------------------------------------------------
  // 4. Delete original entity
  // ------------------------------------------------------------------
  const { error: delErr } = await supabase
    .from(fromType)
    .delete()
    .eq('id', entityId)

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  // ------------------------------------------------------------------
  // 5. Move R2 image (best-effort)
  // ------------------------------------------------------------------
  try {
    const srcKey  = `${R2_IMAGES_PREFIX}/${fromType}/${entityId}.jpeg`
    const destKey = `${R2_IMAGES_PREFIX}/${toType}/${newId}.jpeg`
    if (await r2KeyExists(srcKey)) {
      await copyInR2(srcKey, destKey)
      await deleteFromR2(srcKey)
    }
  } catch (e) {
    console.warn('[reclassify image]', e)
  }

  return NextResponse.json({ ok: true, newId })
}
