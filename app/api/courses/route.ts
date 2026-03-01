import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/courses — all courses ordered by id, with subject_ids array
export async function GET() {
  try {
    const { data: coursesData, error } = await supabase
      .from('courses')
      .select('id, title')
      .order('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: csData } = await supabase
      .from('course_subjects')
      .select('course_id, subject_id')

    const subjectMap: Record<number, number[]> = {}
    for (const row of (csData ?? []) as { course_id: number; subject_id: number }[]) {
      if (!subjectMap[row.course_id]) subjectMap[row.course_id] = []
      subjectMap[row.course_id].push(row.subject_id)
    }

    const courses = (coursesData ?? []).map((c: { id: number; title: string }) => ({
      id:          c.id,
      title:       c.title,
      subject_ids: subjectMap[c.id] || [],
    }))

    return NextResponse.json({ courses })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 })
  }
}
