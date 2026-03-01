import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listR2Prefixes } from '@/lib/r2'

// GET /api/courses/managed
export async function GET() {
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, r2_dir')
    .not('r2_dir', 'is', null)
    .order('id', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const courses = data ?? []
  if (courses.length === 0) return NextResponse.json({ courses: [] })

  const courseIds = courses.map(c => c.id)

  const [{ data: lectureRows }, { data: csData }] = await Promise.all([
    supabase.from('lectures').select('course_id').in('course_id', courseIds),
    supabase.from('course_subjects').select('course_id, subject_id').in('course_id', courseIds),
  ])

  const lectureCounts: Record<number, number> = {}
  for (const row of (lectureRows ?? []) as { course_id: number }[]) {
    lectureCounts[row.course_id] = (lectureCounts[row.course_id] ?? 0) + 1
  }

  const subjectMap: Record<number, number[]> = {}
  for (const row of (csData ?? []) as { course_id: number; subject_id: number }[]) {
    if (!subjectMap[row.course_id]) subjectMap[row.course_id] = []
    subjectMap[row.course_id].push(row.subject_id)
  }

  const r2Counts = await Promise.all(
    courses.map(async c => {
      const r2Dir = (c.r2_dir as string).replace(/\/+$/, '')
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
    courses: courses.map((c: any) => ({
      id:               c.id,
      title:            c.title,
      r2_dir:           c.r2_dir,
      subject_ids:      subjectMap[c.id] ?? [],
      lecture_count:    lectureCounts[c.id] ?? 0,
      r2_lecture_count: r2CountMap[c.id] ?? null,
    })),
  })
}
