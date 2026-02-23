import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listR2Prefixes, uploadToR2 } from '@/lib/r2'

// POST /api/courses/create
// FormData fields:
//   r2Dir      — R2 top-level folder name (e.g. "my_course")
//   title      — Course title
//   subjectId  — (optional) numeric subject id
//   image      — (optional) course cover image File
export async function POST(req: NextRequest) {
  try {
    const formData  = await req.formData()
    const r2Dir     = (formData.get('r2Dir')     as string | null)?.trim()
    const title     = (formData.get('title')     as string | null)?.trim()
    const subIdRaw  = formData.get('subjectId')  as string | null
    const imageFile = formData.get('image')      as File   | null

    if (!r2Dir || !title) {
      return NextResponse.json({ error: 'r2Dir and title are required' }, { status: 400 })
    }

    const subjectId = subIdRaw && subIdRaw !== '' ? parseInt(subIdRaw, 10) : null

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

    // Upload cover image if provided
    if (imageFile && imageFile.size > 0) {
      const r2Key  = `images/courses/${courseId}.jpeg`
      const buffer = Buffer.from(await imageFile.arrayBuffer())
      await uploadToR2(r2Key, buffer, imageFile.type || 'image/jpeg')

      // course_r2_url is reserved for the course folder URL set by the
      // transcription pipeline; the image is served via /api/media/course/{id}/image
    }

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
