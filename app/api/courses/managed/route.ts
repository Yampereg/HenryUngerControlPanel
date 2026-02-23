import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listR2Prefixes } from '@/lib/r2'

// GET /api/courses/managed
// Returns courses that have an r2_dir set, with actual lecture counts from the DB
// and the total available lecture count from R2 (for progress bar).
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

  // Count R2 sub-directories per course (= total lectures available in R2)
  const r2Counts = await Promise.all(
    courses.map(async c => {
      const r2Dir = c.r2_dir as string
      try {
        const prefixes = await listR2Prefixes(`${r2Dir}/`)
        const count = prefixes
          .map(p => parseInt(p.replace(`${r2Dir}/`, '').replace(/\/$/, ''), 10))
          .filter(n => !isNaN(n) && n > 0).length
        return { id: c.id, count }
      } catch {
        return { id: c.id, count: null }
      }
    }),
  )
  const r2CountMap: Record<number, number | null> = {}
  for (const { id, count } of r2Counts) {
    r2CountMap[id] = count
  }

  return NextResponse.json({
    courses: courses.map(c => ({
      ...c,
      lecture_count:    lectureCounts[c.id] ?? 0,
      r2_lecture_count: r2CountMap[c.id] ?? null,
    })),
  })
}
