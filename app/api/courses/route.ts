import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/courses — all courses ordered by id, with subject_ids array
export async function GET() {
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, course_subjects(subject_id)')
    .order('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const courses = (data ?? []).map((c: any) => ({
    id: c.id,
    title: c.title,
    subject_ids: (c.course_subjects as { subject_id: number }[] ?? []).map(s => s.subject_id),
  }))

  return NextResponse.json({ courses })
}
