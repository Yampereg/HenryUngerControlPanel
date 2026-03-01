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

  const showAll  = req.nextUrl.searchParams.get('all') === 'true'
  const search   = req.nextUrl.searchParams.get('search')?.trim() || null
  const courseId = req.nextUrl.searchParams.get('courseId')
  const { nameField } = ENTITY_TYPES[entityType]

  try {
    // ── Lectures: special fields, courseId filter, no images ──────────────
    if (entityType === 'lectures') {
      let query = supabase
        .from('lectures')
        .select('id, title, synopsis, date, duration, order_in_course, transcribed, course_id')
        .order('order_in_course')

      if (courseId) query = query.eq('course_id', parseInt(courseId, 10))
      if (search)   query = query.ilike('title', `%${search}%`)

      const { data: rows, error } = await query
      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allEntities = ((rows ?? []) as any[]).map((row: Record<string, unknown>) => ({
        ...row,
        id:          row.id as number,
        displayName: row.title as string,
        hasImage:    false,
      }))

      return NextResponse.json({ entities: allEntities, total: rows?.length ?? 0, withImages: 0 })
    }

    // ── All other entity types ─────────────────────────────────────────────
    // 1. Fetch all entities from Supabase
    const extraFields = entityType === 'courses'
      ? ', description, course_r2_url, r2_dir'
      : ', hebrew_name, description'
    let query = supabase
      .from(entityType)
      .select(`id, ${nameField}${extraFields}`)
      .order(nameField)

    if (search) {
      query = query.ilike(nameField, `%${search}%`)
    }

    const { data: rows, error } = await query

    if (error) throw error

    // 1b. For courses: attach subject_ids from junction table
    if (entityType === 'courses' && rows && rows.length > 0) {
      const courseIds = (rows as unknown as { id: number }[]).map(r => r.id)
      const { data: csData } = await supabase
        .from('course_subjects')
        .select('course_id, subject_id')
        .in('course_id', courseIds)
      const subjectMap: Record<number, number[]> = {}
      for (const cs of (csData ?? []) as { course_id: number; subject_id: number }[]) {
        if (!subjectMap[cs.course_id]) subjectMap[cs.course_id] = []
        subjectMap[cs.course_id].push(cs.subject_id)
      }
      for (const row of rows as unknown as Record<string, unknown>[]) {
        row.subject_ids = subjectMap[row.id as number] ?? []
      }
    }

    // 2. List all image keys already in R2 for this entity type
    const prefix = `${R2_IMAGES_PREFIX}/${entityType}/`
    const existingKeys = await listR2Keys(prefix)

    const existingIds = new Set<number>()
    for (const key of existingKeys) {
      const filename = key.replace(prefix, '')
      const id = parseInt(filename.split('.')[0], 10)
      if (!isNaN(id)) existingIds.add(id)
    }

    // 3. Build entity list — preserve original row fields so form editors can read them
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allEntities = ((rows ?? []) as any[]).map((row: Record<string, unknown>) => ({
      ...row,                                              // keep name/title/synopsis/etc.
      id:          row.id as number,
      displayName: row[nameField] as string,
      hasImage:    existingIds.has(row.id as number),
      hebrewName:  (row.hebrew_name as string | null) ?? null,
      description: (row.description as string | null) ?? null,
    }))

    const entities = showAll
      ? allEntities
      : allEntities.filter((e) => !e.hasImage)

    return NextResponse.json({ entities, total: rows?.length ?? 0, withImages: existingIds.size })
  } catch (err) {
    console.error('[entities]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
