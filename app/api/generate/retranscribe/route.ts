import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { deleteFromR2 } from '@/lib/r2'

const JUNCTION_TABLES = [
  'lecture_directors',
  'lecture_films',
  'lecture_writers',
  'lecture_books',
  'lecture_painters',
  'lecture_paintings',
  'lecture_philosophers',
  'lecture_themes',
] as const

const R2_OUTPUT_FILES = ['summary.pdf', 'transcript.txt', 'chapters.vtt']

export async function POST(req: NextRequest) {
  const { lectureId } = await req.json()
  if (!lectureId) return NextResponse.json({ error: 'lectureId required' }, { status: 400 })

  // 1. Fetch lecture
  const { data: lecRows, error: lecErr } = await supabase
    .from('lectures')
    .select('id, course_id, order_in_course')
    .eq('id', lectureId)
  if (lecErr) return NextResponse.json({ error: lecErr.message }, { status: 500 })
  const lec = lecRows?.[0]
  if (!lec) return NextResponse.json({ error: `Lecture ${lectureId} not found` }, { status: 404 })

  // 2. Fetch course
  const { data: crsRows, error: crsErr } = await supabase
    .from('courses')
    .select('id, r2_dir')
    .eq('id', lec.course_id)
  if (crsErr) return NextResponse.json({ error: crsErr.message }, { status: 500 })
  const course = crsRows?.[0]
  if (!course) return NextResponse.json({ error: `Course ${lec.course_id} not found` }, { status: 404 })

  const r2Prefix = `${course.r2_dir}/${lec.order_in_course}`

  // 3. Delete junction table rows
  for (const table of JUNCTION_TABLES) {
    await supabase.from(table).delete().eq('lecture_id', lectureId)
  }

  // 4. Delete R2 output files (keep the source video)
  await Promise.allSettled(
    R2_OUTPUT_FILES.map(file => deleteFromR2(`${r2Prefix}/${file}`)),
  )

  // 5. Delete existing upload_jobs for this lecture
  await supabase
    .from('upload_jobs')
    .delete()
    .eq('course_id', lec.course_id)
    .eq('lecture_number', lec.order_in_course)

  // 6. Delete the lecture row (new clean one will be created by the transcriber)
  await supabase.from('lectures').delete().eq('id', lectureId)

  // 7. Insert new pending upload_jobs entry
  const { error: jobErr } = await supabase.from('upload_jobs').insert({
    course_id:       lec.course_id,
    r2_dir:          course.r2_dir,
    lecture_number:  lec.order_in_course,
    status:          'pending',
  })
  if (jobErr) return NextResponse.json({ error: `Queued clean-up succeeded but job insert failed: ${jobErr.message}` }, { status: 500 })

  return NextResponse.json({ ok: true, lecture_number: lec.order_in_course, r2_prefix: r2Prefix })
}
