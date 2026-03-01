// LOCATION: app/api/upload-jobs/route.ts  (replace existing)

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

interface JobRow {
  id:             number
  course_id:      number
  status:         string
  lecture_number: number
  completed_at:   string | null
  created_at:     string | null
  started_at:     string | null
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
    .select('id, course_id, status, lecture_number, completed_at, created_at, started_at')
    .order('created_at', { ascending: false })

  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 })
  }

  const rows = (jobRows ?? []) as JobRow[]

  if (rows.length === 0) {
    return NextResponse.json({ jobs: [], active: [], lastCompleted: null, succeededPerCourse: {} })
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

  // Active jobs (running or pending), sorted by created_at ascending (oldest first)
  // Include started_at so the UI can show elapsed time
  const active = rows
    .filter(r => r.status === 'running' || r.status === 'pending')
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map(r => ({
      courseId:      r.course_id,
      courseTitle:   courseMap.get(r.course_id) ?? `Course ${r.course_id}`,
      lectureNumber: r.lecture_number,
      status:        r.status,
      startedAt:     r.started_at ?? null,
    }))

  // Most recent terminal job
  const terminalRows = rows
    .filter(r => r.status === 'succeeded' || r.status === 'failed')
    .sort((a, b) =>
      (b.completed_at ?? b.created_at ?? '').localeCompare(a.completed_at ?? a.created_at ?? ''),
    )
  const lastCompleted = terminalRows.length > 0 ? {
    courseId:      terminalRows[0].course_id,
    courseTitle:   courseMap.get(terminalRows[0].course_id) ?? `Course ${terminalRows[0].course_id}`,
    lectureNumber: terminalRows[0].lecture_number,
    status:        terminalRows[0].status,
    completedAt:   terminalRows[0].completed_at ?? terminalRows[0].created_at,
  } : null

  // Succeeded count per course (for X/Y progress in home view)
  // Only count jobs whose lecture actually exists in the lectures table
  const { data: lectureRows } = await supabase
    .from('lectures')
    .select('course_id, order_in_course')
    .in('course_id', courseIds)

  interface LectureRow { course_id: number; order_in_course: number | null }
  const dbLectureSet = new Set<string>(
    ((lectureRows ?? []) as LectureRow[])
      .filter(l => l.order_in_course != null)
      .map(l => `${l.course_id}:${l.order_in_course}`),
  )

  const succeededPerCourse: Record<number, number> = {}
  for (const r of rows) {
    if (r.status === 'succeeded' && dbLectureSet.has(`${r.course_id}:${r.lecture_number}`)) {
      succeededPerCourse[r.course_id] = (succeededPerCourse[r.course_id] ?? 0) + 1
    }
  }

  return NextResponse.json({ jobs: [...groups.values()], active, lastCompleted, succeededPerCourse })
}

// DELETE /api/upload-jobs
// Body: { jobId: number }
// Cancels a pending job (deletes the row) or marks a running job as failed.
export async function DELETE(req: NextRequest) {
  const body  = await req.json()
  const jobId = body.jobId as number | undefined

  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  }

  const { data: job, error: fetchErr } = await supabase
    .from('upload_jobs')
    .select('id, status')
    .eq('id', jobId)
    .maybeSingle()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  interface JobRecord { id: number; status: string }
  const j = job as JobRecord

  if (j.status === 'pending') {
    const { error } = await supabase.from('upload_jobs').delete().eq('id', jobId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action: 'deleted' })
  }

  if (j.status === 'running') {
    // Can't kill the subprocess remotely; mark as failed so it won't be retried
    const { error } = await supabase
      .from('upload_jobs')
      .update({ status: 'failed', output: '[Cancelled by user]', completed_at: new Date().toISOString() })
      .eq('id', jobId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action: 'cancelled' })
  }

  return NextResponse.json(
    { error: `Cannot cancel job with status: ${j.status}` },
    { status: 409 },
  )
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
      .update({ status: 'pending', retry_count: 0, output: null, completed_at: null, started_at: null })
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