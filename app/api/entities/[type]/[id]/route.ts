import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ENTITY_TYPES, JUNCTION_MAP, EntityType, R2_IMAGES_PREFIX } from '@/lib/constants'
import { deleteFromR2 } from '@/lib/r2'

type Params = { params: Promise<{ type: string; id: string }> }

// PATCH /api/entities/[type]/[id]  — update name, hebrewName, description
export async function PATCH(req: NextRequest, { params }: Params) {
  const { type, id } = await params
  const entityType   = type as EntityType

  if (!(entityType in ENTITY_TYPES)) {
    return NextResponse.json({ error: 'Unknown entity type' }, { status: 400 })
  }

  const body = await req.json() as {
    name?:        string
    hebrewName?:  string | null
    description?: string | null
  }

  const { nameField } = ENTITY_TYPES[entityType]
  const update: Record<string, unknown> = {}

  if (body.name        !== undefined) update[nameField]     = body.name
  if (body.hebrewName  !== undefined) update['hebrew_name'] = body.hebrewName
  if (body.description !== undefined) update['description'] = body.description

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from(entityType)
    .update(update)
    .eq('id', parseInt(id, 10))

  if (error) {
    console.error('[PATCH entity]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/entities/[type]/[id]  — remove junction rows, then the entity row
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { type, id } = await params
  const entityType   = type as EntityType
  const numericId    = parseInt(id, 10)

  if (!(entityType in ENTITY_TYPES)) {
    return NextResponse.json({ error: 'Unknown entity type' }, { status: 400 })
  }

  const junction = JUNCTION_MAP[entityType]

  // 1. Delete junction table rows (lecture ↔ entity links)
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

  // 2. Delete the entity row itself
  const { error } = await supabase
    .from(entityType)
    .delete()
    .eq('id', numericId)

  if (error) {
    console.error('[DELETE entity]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 3. Delete R2 image (best-effort — not fatal if missing)
  try {
    await deleteFromR2(`${R2_IMAGES_PREFIX}/${entityType}/${numericId}.jpeg`)
  } catch (e) {
    console.warn('[DELETE entity image]', e)
  }

  return NextResponse.json({ ok: true })
}
