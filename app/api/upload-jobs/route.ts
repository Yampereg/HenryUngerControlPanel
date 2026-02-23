import { NextRequest, NextResponse } from 'next/server'
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

// POST /api/upload-jobs
// Body: { courseId: number, lectureNumber: number }
// Queues a single lecture for transcription. Re-queues failed jobs.
export async function POST(req: NextRequest) {
  const body          = await req.json()
  const courseId      = body.courseId      as number | undefined
  const lectureNumber = body.lectureNumber as number | undefined

  if (!courseId || !lectureNumber) {
    return NextResponse.json({ error: 'courseId and lectureNumber required' }, { status: 400 })
  }

  // Fetch course to get r2_dir
  const { data: course, error: courseErr } = await supabase
    .from('courses')
    .select('r2_dir')
    .eq('id', courseId)
    .single()

  if (courseErr || !course?.r2_dir) {
    return NextResponse.json({ error: 'Course not found or has no r2_dir' }, { status: 404 })
  }

  // Check for an existing job for this lecture
  const { data: existing } = await supabase
    .from('upload_jobs')
    .select('id, status')
    .eq('course_id', courseId)
    .eq('lecture_number', lectureNumber)
    .maybeSingle()

  interface ExistingJob { id: number; status: string }
  const existingJob = existing as ExistingJob | null

  if (existingJob && existingJob.status !== 'failed') {
    return NextResponse.json(
      { error: `Job already exists (status: ${existingJob.status})` },
      { status: 409 },
    )
  }

  if (existingJob) {
    // Re-queue a failed job
    const { error: updateErr } = await supabase
      .from('upload_jobs')
      .update({ status: 'pending', retry_count: 0, output: null, completed_at: null })
      .eq('id', existingJob.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }
    return NextResponse.json({ jobId: existingJob.id })
  }

  // Insert a new job
  const { data: job, error: jobErr } = await supabase
    .from('upload_jobs')
    .insert({
      course_id:      courseId,
      r2_dir:         course.r2_dir,
      lecture_number: lectureNumber,
      status:         'pending',
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ jobId: (job as { id: number }).id })
}
