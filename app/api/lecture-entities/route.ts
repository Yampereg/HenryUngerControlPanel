import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ENTITY_TYPES, JUNCTION_MAP, EntityType } from '@/lib/constants'

type RelType = 'discussed' | 'mentioned'

// ---------------------------------------------------------------------------
// GET /api/lecture-entities?lectureId=X&category=directors
// Returns all entities linked to the lecture in that category, with relationship_type
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const lectureId = req.nextUrl.searchParams.get('lectureId')
  const category  = req.nextUrl.searchParams.get('category') as EntityType | null

  if (!lectureId || !category) {
    return NextResponse.json({ error: 'Missing lectureId or category' }, { status: 400 })
  }

  const junction = JUNCTION_MAP[category]
  if (!junction) {
    return NextResponse.json({ error: 'Category has no junction table' }, { status: 400 })
  }

  const { nameField } = ENTITY_TYPES[category]

  // 1. Fetch junction rows for this lecture
  const { data: juncRows, error: juncErr } = await supabase
    .from(junction.table)
    .select(`id, ${junction.fkCol}, relationship_type`)
    .eq('lecture_id', parseInt(lectureId, 10))

  if (juncErr) {
    return NextResponse.json({ error: juncErr.message }, { status: 500 })
  }

  if (!juncRows?.length) {
    return NextResponse.json({ entities: [] })
  }

  // 2. Fetch entity details
  const entityIds = (juncRows as Record<string, unknown>[]).map(r => r[junction.fkCol] as number)

  const { data: entityRows, error: entityErr } = await supabase
    .from(category)
    .select(`id, ${nameField}, hebrew_name`)
    .in('id', entityIds)

  if (entityErr) {
    return NextResponse.json({ error: entityErr.message }, { status: 500 })
  }

  // 3. Join junction + entity rows
  const entityMap = new Map<number, Record<string, unknown>>(
    ((entityRows ?? []) as unknown as Record<string, unknown>[]).map(e => [e.id as number, e]),
  )

  const result = (juncRows as Record<string, unknown>[]).map(row => {
    const eid    = row[junction.fkCol] as number
    const entity = entityMap.get(eid)
    return {
      junctionId:       row.id as number,
      entityId:         eid,
      displayName:      (entity?.[nameField] ?? '') as string,
      hebrewName:       (entity?.hebrew_name   ?? null) as string | null,
      relationshipType: row.relationship_type as RelType,
    }
  }).sort((a, b) => a.displayName.localeCompare(b.displayName))

  return NextResponse.json({ entities: result })
}

// ---------------------------------------------------------------------------
// PATCH /api/lecture-entities
// Body: { junctionId, category, relationshipType }
// Toggles relationship_type for a single junction row
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  const { junctionId, category, relationshipType } = await req.json() as {
    junctionId:       number
    category:         EntityType
    relationshipType: RelType
  }

  if (!junctionId || !category || !['discussed', 'mentioned'].includes(relationshipType)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const junction = JUNCTION_MAP[category]
  if (!junction) {
    return NextResponse.json({ error: 'Category has no junction table' }, { status: 400 })
  }

  const { error } = await supabase
    .from(junction.table)
    .update({ relationship_type: relationshipType })
    .eq('id', junctionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
