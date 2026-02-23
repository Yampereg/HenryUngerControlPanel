import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listR2Prefixes } from '@/lib/r2'

// GET /api/course-lectures?courseId=X
// Returns the lecture numbers found in R2 for a course, merged with upload_job statuses.
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

  if (courseErr || !course?.r2_dir) {
    return NextResponse.json({ error: 'Course not found or has no r2_dir' }, { status: 404 })
  }

  const r2Dir = course.r2_dir as string

  // Discover lecture numbers from R2 sub-prefixes
  const subPrefixes = await listR2Prefixes(`${r2Dir}/`)
  const lectureNums = subPrefixes
    .map(p => parseInt(p.replace(`${r2Dir}/`, '').replace(/\/$/, ''), 10))
    .filter(n => !isNaN(n) && n > 0)
    .sort((a, b) => a - b)

  // Get existing upload_jobs for this course
  const { data: jobs } = await supabase
    .from('upload_jobs')
    .select('id, lecture_number, status')
    .eq('course_id', courseId)

  interface JobRow { id: number; lecture_number: number; status: string }
  const jobMap = new Map<number, { id: number; status: string }>(
    ((jobs ?? []) as JobRow[]).map(j => [j.lecture_number, { id: j.id, status: j.status }]),
  )

  const lectures = lectureNums.map(n => {
    const job = jobMap.get(n)
    return {
      lectureNumber: n,
      status:        job ? job.status : 'none',
      jobId:         job ? job.id : null,
    }
  })

  return NextResponse.json({ lectures })
}
