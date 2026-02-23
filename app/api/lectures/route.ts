import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/lectures?courseId=X — lectures for a course, ordered by id
export async function GET(req: NextRequest) {
  const courseId = req.nextUrl.searchParams.get('courseId')

  if (!courseId) {
    return NextResponse.json({ error: 'Missing courseId' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('lectures')
    .select('id, title, order_in_course, course_id')
    .eq('course_id', parseInt(courseId, 10))
    .order('order_in_course')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ lectures: data ?? [] })
}
