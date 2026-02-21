import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listR2Keys } from '@/lib/r2'
import { ENTITY_TYPES, EntityType, R2_IMAGES_PREFIX } from '@/lib/constants'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params
  const entityType = type as EntityType

  if (!(entityType in ENTITY_TYPES)) {
    return NextResponse.json({ error: 'Unknown entity type' }, { status: 400 })
  }

  const showAll = req.nextUrl.searchParams.get('all') === 'true'
  const { nameField } = ENTITY_TYPES[entityType]

  try {
    // 1. Fetch all entities from Supabase
    const extraFields = entityType === 'courses' ? '' : ', hebrew_name, description'
    const { data: rows, error } = await supabase
      .from(entityType)
      .select(`id, ${nameField}${extraFields}`)
      .order(nameField)

    if (error) throw error

    // 2. List all image keys already in R2 for this entity type
    const prefix = `${R2_IMAGES_PREFIX}/${entityType}/`
    const existingKeys = await listR2Keys(prefix)

    const existingIds = new Set<number>()
    for (const key of existingKeys) {
      const filename = key.replace(prefix, '')
      const id = parseInt(filename.split('.')[0], 10)
      if (!isNaN(id)) existingIds.add(id)
    }

    // 3. Build entity list
    const allEntities = (rows ?? []).map((row: Record<string, unknown>) => ({
      id:          row.id as number,
      displayName: row[nameField] as string,
      hasImage:    existingIds.has(row.id as number),
      hebrewName:  (row.hebrew_name as string | null) ?? null,
      description: (row.description as string | null) ?? null,
    }))

    const entities = showAll
      ? allEntities
      : allEntities.filter((e) => !e.hasImage)

    return NextResponse.json({ entities, total: rows?.length ?? 0 })
  } catch (err) {
    console.error('[entities]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
