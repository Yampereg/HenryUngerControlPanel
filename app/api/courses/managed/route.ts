import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/courses/managed
// Returns courses that have an r2_dir set, with actual lecture counts from the DB.
export async function GET() {
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, r2_dir, subject_id')
    .not('r2_dir', 'is', null)
    .order('id', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const courses = data ?? []
  if (courses.length === 0) return NextResponse.json({ courses: [] })

  // Count actual lecture rows per course (catches manually-created lectures too)
  const courseIds = courses.map(c => c.id)
  const { data: lectureRows } = await supabase
    .from('lectures')
    .select('course_id')
    .in('course_id', courseIds)

  const lectureCounts: Record<number, number> = {}
  for (const row of (lectureRows ?? []) as { course_id: number }[]) {
    lectureCounts[row.course_id] = (lectureCounts[row.course_id] ?? 0) + 1
  }

  return NextResponse.json({
    courses: courses.map(c => ({ ...c, lecture_count: lectureCounts[c.id] ?? 0 })),
  })
}
