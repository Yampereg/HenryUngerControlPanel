import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ENTITY_TYPES, JUNCTION_MAP, EntityType, R2_IMAGES_PREFIX } from '@/lib/constants'
import { r2KeyExists, copyInR2, deleteFromR2 } from '@/lib/r2'

// POST /api/entities/restore — restore a deleted entity from backup
export async function POST(req: NextRequest) {
  const { deletedId } = await req.json() as { deletedId: number }

  // ------------------------------------------------------------------
  // 1. Fetch the backup row
  // ------------------------------------------------------------------
  const { data: rows, error: fetchErr } = await supabase
    .from('deleted_entities')
    .select('*')
    .eq('id', deletedId)
    .limit(1)

  if (fetchErr || !rows?.length) {
    return NextResponse.json({ error: 'Backup not found' }, { status: 404 })
  }

  const backup = rows[0] as {
    id:            number
    original_id:   number
    entity_type:   EntityType
    name:          string
    hebrew_name:   string | null
    description:   string | null
    junction_data: Record<string, unknown>[]
    has_image:     boolean
  }

  if (!(backup.entity_type in ENTITY_TYPES)) {
    return NextResponse.json({ error: 'Unknown entity type in backup' }, { status: 400 })
  }

  const { nameField } = ENTITY_TYPES[backup.entity_type]
  const junction      = JUNCTION_MAP[backup.entity_type]

  // ------------------------------------------------------------------
  // 2. Re-insert entity into the original table (gets a new ID)
  // ------------------------------------------------------------------
  const { data: inserted, error: insertErr } = await supabase
    .from(backup.entity_type)
    .insert({
      [nameField]:  backup.name,
      hebrew_name:  backup.hebrew_name ?? null,
      description:  backup.description ?? null,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  const newId = (inserted as Record<string, unknown>).id as number

  // ------------------------------------------------------------------
  // 3. Restore junction rows (dedup by lecture_id, skip existing links)
  // ------------------------------------------------------------------
  if (junction && backup.junction_data?.length > 0) {
    const seen = new Set<unknown>()
    const newRows = backup.junction_data
      .filter((r) => {
        if (seen.has(r.lecture_id)) return false
        seen.add(r.lecture_id)
        return true
      })
      .map((r) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [junction.fkCol]: _fk, id: _id, ...rest } = r
        return { ...rest, [junction.fkCol]: newId }
      })

    if (newRows.length > 0) {
      const { error: juncErr } = await supabase
        .from(junction.table)
        .insert(newRows)

      if (juncErr) {
        // Roll back: delete the newly inserted entity
        await supabase.from(backup.entity_type).delete().eq('id', newId)
        return NextResponse.json({ error: juncErr.message }, { status: 500 })
      }
    }
  }

  // ------------------------------------------------------------------
  // 4. Restore R2 image from deleted/ prefix (best-effort)
  // ------------------------------------------------------------------
  if (backup.has_image) {
    try {
      const storedKey = `deleted/${R2_IMAGES_PREFIX}/${backup.entity_type}/${backup.original_id}.jpeg`
      const newKey    = `${R2_IMAGES_PREFIX}/${backup.entity_type}/${newId}.jpeg`
      if (await r2KeyExists(storedKey)) {
        await copyInR2(storedKey, newKey)
        await deleteFromR2(storedKey)
      }
    } catch (e) {
      console.warn('[RESTORE image]', e)
    }
  }

  // ------------------------------------------------------------------
  // 5. Remove the backup row
  // ------------------------------------------------------------------
  await supabase.from('deleted_entities').delete().eq('id', deletedId)

  return NextResponse.json({ ok: true, newId })
}
