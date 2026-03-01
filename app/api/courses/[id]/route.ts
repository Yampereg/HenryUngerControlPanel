import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// PATCH /api/courses/:id
// Body: { title?: string, subjectIds?: number[], description?: string, course_r2_url?: string, r2_dir?: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (body.title !== undefined) {
    const t = String(body.title).trim()
    if (!t) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
    updates.title = t
  }

  if (body.description !== undefined) updates.description   = body.description   ?? null
  if (body.course_r2_url !== undefined) updates.course_r2_url = body.course_r2_url ?? null
  if (body.r2_dir !== undefined)        updates.r2_dir         = body.r2_dir        ?? null

  const hasSubjectIds = Array.isArray(body.subjectIds)

  if (Object.keys(updates).length === 0 && !hasSubjectIds) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Apply scalar updates
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('courses').update(updates).eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Replace junction rows
  if (hasSubjectIds) {
    const { error: delErr } = await supabase
      .from('course_subjects')
      .delete()
      .eq('course_id', id)
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    if (body.subjectIds.length > 0) {
      const rows = (body.subjectIds as number[]).map(sid => ({ course_id: id, subject_id: sid }))
      const { error: insErr } = await supabase.from('course_subjects').insert(rows)
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
