import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listR2Prefixes } from '@/lib/r2'

// GET /api/course-lectures?courseId=X
// Returns the lecture numbers for a course, merging R2 sub-dirs and DB rows.
export async function GET(req: NextRequest) {
  const courseId = parseInt(req.nextUrl.searchParams.get('courseId') ?? '', 10)
  if (!courseId) {
    return NextResponse.json({ error: 'courseId required' }, { status: 400 })
  }

  // Get course r2_dir
  const { data: course, error: courseErr } = await supabase
    .from('courses')
    .select('r2_dir')
    .eq('id', courseId)
    .single()

  if (courseErr || !course) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  const r2Dir = (course.r2_dir as string | null) ?? ''

  // Discover lecture numbers from R2 sub-prefixes (may be empty if no R2 folder)
  let r2Nums = new Set<number>()
  if (r2Dir) {
    try {
      const subPrefixes = await listR2Prefixes(`${r2Dir}/`)
      r2Nums = new Set(
        subPrefixes
          .map(p => parseInt(p.replace(`${r2Dir}/`, '').replace(/\/$/, ''), 10))
          .filter(n => !isNaN(n) && n > 0),
      )
    } catch {
      // R2 unavailable or folder doesn't exist — fall back to DB only
    }
  }

  // Also query actual lecture rows in the DB (catches manually-uploaded courses)
  const { data: dbLectures } = await supabase
    .from('lectures')
    .select('order_in_course')
    .eq('course_id', courseId)

  const dbNums = new Set<number>(
    ((dbLectures ?? []) as { order_in_course: number | null }[])
      .map(l => l.order_in_course)
      .filter((n): n is number => n != null && !isNaN(n) && n > 0),
  )

  // Union of R2 + DB lecture numbers
  const allNums = [...new Set([...r2Nums, ...dbNums])].sort((a, b) => a - b)

  // Get existing upload_jobs for this course
  const { data: jobs } = await supabase
    .from('upload_jobs')
    .select('id, lecture_number, status, output')
    .eq('course_id', courseId)

  interface JobRow { id: number; lecture_number: number; status: string; output: string | null }
  const jobMap = new Map<number, { id: number; status: string; output: string | null }>(
    ((jobs ?? []) as JobRow[]).map(j => [j.lecture_number, { id: j.id, status: j.status, output: j.output }]),
  )

  const lectures = allNums.map(n => {
    const job = jobMap.get(n)
    let status: string
    if (!job) {
      // No job row — succeeded only if lecture is actually in the DB
      status = dbNums.has(n) ? 'succeeded' : 'none'
    } else if (job.status === 'succeeded') {
      // Job claims success — only trust it if the lecture row is actually in the DB
      status = dbNums.has(n) ? 'succeeded' : 'failed'
    } else {
      status = job.status
    }
    return {
      lectureNumber: n,
      status,
      jobId:  job ? job.id : null,
      output: job?.output ?? null,
    }
  })

  return NextResponse.json({ lectures })
}
