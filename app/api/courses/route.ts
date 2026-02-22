import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/courses — all courses ordered by id
export async function GET() {
  const { data, error } = await supabase
    .from('courses')
    .select('id, title')
    .order('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ courses: data ?? [] })
}
