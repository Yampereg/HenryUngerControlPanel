import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/courses — all courses ordered by id, with subject_ids array
export async function GET() {
  const [{ data: coursesData, error }, { data: csData }] = await Promise.all([
    supabase.from('courses').select('id, title').order('id'),
    supabase.from('course_subjects').select('course_id, subject_id'),
  ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build subject_id lookup
  const subjectMap: Record<number, number[]> = {}
  for (const row of (csData ?? []) as { course_id: number; subject_id: number }[]) {
    ;(subjectMap[row.course_id] ??= []).push(row.subject_id)
  }

  const courses = (coursesData ?? []).map((c: { id: number; title: string }) => ({
    id:          c.id,
    title:       c.title,
    subject_ids: subjectMap[c.id] ?? [],
  }))

  return NextResponse.json({ courses })
}
