import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

interface JobRow {
  id:             number
  course_id:      number
  status:         string
  lecture_number: number
}

interface CourseRow {
  id:    number
  title: string
}

// GET /api/upload-jobs
// Returns transcription job progress grouped by course.
export async function GET() {
  const { data: jobRows, error: jobErr } = await supabase
    .from('upload_jobs')
    .select('id, course_id, status, lecture_number')
    .order('created_at', { ascending: false })

  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 })
  }

  const rows = (jobRows ?? []) as JobRow[]

  if (rows.length === 0) {
    return NextResponse.json({ jobs: [] })
  }

  // Fetch course titles
  const courseIds = [...new Set(rows.map(r => r.course_id))]
  const { data: courseRows, error: courseErr } = await supabase
    .from('courses')
    .select('id, title')
    .in('id', courseIds)

  if (courseErr) {
    return NextResponse.json({ error: courseErr.message }, { status: 500 })
  }

  const courseMap = new Map<number, string>(
    ((courseRows ?? []) as CourseRow[]).map(c => [c.id, c.title]),
  )

  // Aggregate counts per course
  const groups = new Map<
    number,
    { courseId: number; courseTitle: string; total: number; succeeded: number; failed: number; running: number; pending: number }
  >()

  for (const row of rows) {
    if (!groups.has(row.course_id)) {
      groups.set(row.course_id, {
        courseId:    row.course_id,
        courseTitle: courseMap.get(row.course_id) ?? `Course ${row.course_id}`,
        total:       0,
        succeeded:   0,
        failed:      0,
        running:     0,
        pending:     0,
      })
    }
    const g = groups.get(row.course_id)!
    g.total++
    if      (row.status === 'succeeded') g.succeeded++
    else if (row.status === 'failed')    g.failed++
    else if (row.status === 'running')   g.running++
    else if (row.status === 'pending')   g.pending++
  }

  return NextResponse.json({ jobs: [...groups.values()] })
}
