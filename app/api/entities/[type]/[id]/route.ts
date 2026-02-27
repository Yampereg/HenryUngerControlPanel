import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ENTITY_TYPES, JUNCTION_MAP, EntityType, R2_IMAGES_PREFIX } from '@/lib/constants'
import { deleteFromR2, r2KeyExists, copyInR2 } from '@/lib/r2'

type Params = { params: Promise<{ type: string; id: string }> }

// PATCH /api/entities/[type]/[id]
// Accepts raw DB field names from the client (e.g. 'name'/'title', 'hebrew_name', 'description').
// Also handles 'lectures' type (not in ENTITY_TYPES).
export async function PATCH(req: NextRequest, { params }: Params) {
  const { type, id } = await params
  const numericId    = parseInt(id, 10)
  const body         = await req.json() as Record<string, unknown>

  // ── Lectures — handled separately (not in ENTITY_TYPES) ──────────────────
  if (type === 'lectures') {
    const allowed = ['title', 'synopsis', 'date', 'duration', 'order_in_course', 'transcribed']
    const update: Record<string, unknown> = {}
    for (const f of allowed) {
      if (body[f] !== undefined) update[f] = body[f]
    }
    if (!Object.keys(update).length) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }
    const { error } = await supabase.from('lectures').update(update).eq('id', numericId)
    if (error) {
      console.error('[PATCH lecture]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // ── Entities ──────────────────────────────────────────────────────────────
  const entityType = type as EntityType

  if (!(entityType in ENTITY_TYPES)) {
    return NextResponse.json({ error: 'Unknown entity type' }, { status: 400 })
  }

  const { nameField } = ENTITY_TYPES[entityType]
  const update: Record<string, unknown> = {}

  // Client sends raw DB field key: 'name' for directors/writers/etc, 'title' for films/books/paintings
  if (body[nameField]  !== undefined) update[nameField]     = body[nameField]
  if (body.hebrew_name !== undefined) update['hebrew_name'] = body.hebrew_name
  if (body.description !== undefined) update['description'] = body.description

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from(entityType)
    .update(update)
    .eq('id', numericId)

  if (error) {
    console.error('[PATCH entity]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/entities/[type]/[id]  — back up to deleted_entities, then remove
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { type, id } = await params
  const entityType   = type as EntityType
  const numericId    = parseInt(id, 10)

  if (!(entityType in ENTITY_TYPES)) {
    return NextResponse.json({ error: 'Unknown entity type' }, { status: 400 })
  }

  const { nameField } = ENTITY_TYPES[entityType]
  const junction      = JUNCTION_MAP[entityType]

  const { data: entityRows, error: fetchErr } = await supabase
    .from(entityType)
    .select('*')
    .eq('id', numericId)
    .limit(1)

  if (fetchErr || !entityRows?.length) {
    return NextResponse.json({ error: fetchErr?.message ?? 'Entity not found' }, { status: 404 })
  }

  const entity = entityRows[0] as Record<string, unknown>

  let junctionRows: Record<string, unknown>[] = []
  if (junction) {
    const { data } = await supabase
      .from(junction.table)
      .select('*')
      .eq(junction.fkCol, numericId)
    junctionRows = ((data ?? []) as unknown as Record<string, unknown>[])
  }

  const r2Key    = `${R2_IMAGES_PREFIX}/${entityType}/${numericId}.jpeg`
  const hasImage = await r2KeyExists(r2Key).catch(() => false)

  const { error: backupErr } = await supabase
    .from('deleted_entities')
    .insert({
      original_id:   numericId,
      entity_type:   entityType,
      name:          entity[nameField] as string,
      hebrew_name:   entity.hebrew_name ?? null,
      description:   entity.description ?? null,
      junction_data: junctionRows,
      has_image:     hasImage,
    })

  if (backupErr) {
    console.error('[DELETE backup]', backupErr)
    return NextResponse.json({ error: backupErr.message }, { status: 500 })
  }

  if (hasImage) {
    try {
      await copyInR2(r2Key, `deleted/${r2Key}`)
      await deleteFromR2(r2Key)
    } catch (e) {
      console.warn('[DELETE entity image move]', e)
    }
  }

  if (junction) {
    const { error } = await supabase
      .from(junction.table)
      .delete()
      .eq(junction.fkCol, numericId)

    if (error) {
      console.error('[DELETE junction]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const { error: delErr } = await supabase
    .from(entityType)
    .delete()
    .eq('id', numericId)

  if (delErr) {
    console.error('[DELETE entity]', delErr)
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
