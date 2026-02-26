import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listR2Prefixes } from '@/lib/r2'

// POST /api/courses/create
// JSON body fields:
//   r2Dir      — R2 top-level folder name (e.g. "my_course")
//   title      — Course title
//   subjectId  — (optional) numeric subject id
export async function POST(req: NextRequest) {
  try {
    const body    = await req.json() as { r2Dir?: string; title?: string; subjectId?: number | null }
    const r2Dir   = body.r2Dir?.trim()
    const title   = body.title?.trim()

    if (!r2Dir || !title) {
      return NextResponse.json({ error: 'r2Dir and title are required' }, { status: 400 })
    }

    const subjectId = body.subjectId != null ? body.subjectId : null

    // Prevent duplicate courses for the same r2_dir
    const { data: existing } = await supabase
      .from('courses')
      .select('id')
      .eq('r2_dir', r2Dir)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `A course already exists for R2 dir "${r2Dir}"` },
        { status: 409 },
      )
    }

    // Create course row
    const { data: course, error: courseErr } = await supabase
      .from('courses')
      .insert({ title, r2_dir: r2Dir, subject_id: subjectId ?? null })
      .select('id')
      .single()

    if (courseErr || !course) {
      return NextResponse.json(
        { error: courseErr?.message ?? 'Insert failed' },
        { status: 500 },
      )
    }

    const courseId = course.id as number

    // Discover lecture numbers from R2 sub-prefixes
    const subPrefixes  = await listR2Prefixes(`${r2Dir}/`)
    const lectureNums  = subPrefixes
      .map(p => {
        const part = p.replace(`${r2Dir}/`, '').replace(/\/$/, '')
        return parseInt(part, 10)
      })
      .filter(n => !isNaN(n) && n > 0)
      .sort((a, b) => a - b)

    if (lectureNums.length === 0) {
      // Roll back the just-created course
      await supabase.from('courses').delete().eq('id', courseId)
      return NextResponse.json(
        { error: 'No numeric lecture sub-folders found under the selected R2 dir' },
        { status: 400 },
      )
    }

    return NextResponse.json({ courseId, r2Dir, lectureCount: lectureNums.length })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
